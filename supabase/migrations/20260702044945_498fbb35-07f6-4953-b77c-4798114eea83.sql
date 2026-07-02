-- 1. Add loan_fee tx type (a fee that reduces a loan's fee balance, NOT savings)
ALTER TYPE public.tx_type ADD VALUE IF NOT EXISTS 'loan_fee';

-- 2. Loan fee columns
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_outstanding NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 3. Recompute helper: simple-interest returned fee = principal * rate% * (term / 12)
CREATE OR REPLACE FUNCTION public.calc_returned_fee(_amount NUMERIC, _rate NUMERIC, _term INT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT round(COALESCE(_amount,0) * COALESCE(_rate,0)/100.0 * (COALESCE(_term,0)::NUMERIC / 12.0), 2)
$$;

-- 4. Disbursement trigger: post principal tx AND set returned fee balance
CREATE OR REPLACE FUNCTION public.post_disbursement_tx()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_principal NUMERIC; v_fee NUMERIC;
BEGIN
  IF OLD.stage = 'disbursement' AND NEW.stage = 'completed' THEN
    NEW.status := 'disbursed';
    v_principal := COALESCE(NEW.amount_approved, NEW.amount_requested);
    v_fee := public.calc_returned_fee(v_principal, NEW.interest_rate, NEW.term_months);
    IF NEW.fee_amount IS NULL OR NEW.fee_amount = 0 THEN
      NEW.fee_amount := v_fee;
      NEW.fee_outstanding := v_fee;
    END IF;
    INSERT INTO public.transactions (user_id, amount, tx_type, description, loan_id)
    VALUES (NEW.member_id, v_principal, 'disbursement',
            'Loan ' || NEW.loan_number || ' disbursed', NEW.id);
  END IF;
  RETURN NEW;
END $function$;

-- 5. Repayment / fee application: handles both 'repayment' (principal) and 'loan_fee' (fee)
CREATE OR REPLACE FUNCTION public.apply_repayment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_bal NUMERIC; v_fee NUMERIC;
BEGIN
  IF NEW.tx_type = 'repayment' THEN
    IF NEW.loan_id IS NULL THEN RAISE EXCEPTION 'loan_id required for repayment'; END IF;
    SELECT GREATEST(0, outstanding_balance - NEW.amount),
           fee_outstanding
      INTO v_bal, v_fee
      FROM public.loans WHERE id = NEW.loan_id;
    UPDATE public.loans
       SET outstanding_balance = v_bal,
           status = CASE WHEN v_bal <= 0 AND COALESCE(v_fee,0) <= 0 THEN 'completed'::loan_status ELSE status END,
           stage  = CASE WHEN v_bal <= 0 AND COALESCE(v_fee,0) <= 0 THEN 'completed'::loan_stage  ELSE stage  END,
           disbursement_confirmed_at = CASE WHEN v_bal<=0 AND COALESCE(v_fee,0)<=0 AND disbursement_confirmed_at IS NULL THEN now() ELSE disbursement_confirmed_at END,
           disbursement_confirmed_by = CASE WHEN v_bal<=0 AND COALESCE(v_fee,0)<=0 AND disbursement_confirmed_by IS NULL THEN auth.uid() ELSE disbursement_confirmed_by END
     WHERE id = NEW.loan_id;
  ELSIF NEW.tx_type = 'loan_fee' THEN
    IF NEW.loan_id IS NULL THEN RAISE EXCEPTION 'loan_id required for loan_fee'; END IF;
    SELECT outstanding_balance,
           GREATEST(0, fee_outstanding - NEW.amount)
      INTO v_bal, v_fee
      FROM public.loans WHERE id = NEW.loan_id;
    UPDATE public.loans
       SET fee_outstanding = v_fee,
           status = CASE WHEN COALESCE(v_bal,0) <= 0 AND v_fee <= 0 THEN 'completed'::loan_status ELSE status END,
           stage  = CASE WHEN COALESCE(v_bal,0) <= 0 AND v_fee <= 0 THEN 'completed'::loan_stage  ELSE stage  END
     WHERE id = NEW.loan_id;
  END IF;
  RETURN NEW;
END $function$;

-- 6. Savings balance excludes loan-linked fees (loan_fee always excluded; classic 'fee' with loan_id excluded)
CREATE OR REPLACE FUNCTION public.get_savings_balance(_user_id uuid)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_open NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COALESCE(opening_balance,0) INTO v_open FROM public.profiles WHERE user_id=_user_id;
  RETURN COALESCE(v_open,0) + COALESCE((
    SELECT SUM(CASE
      WHEN tx_type IN ('deposit','contribution') THEN amount
      WHEN tx_type = 'withdrawal' THEN -amount
      WHEN tx_type = 'fee' AND loan_id IS NULL THEN -amount
      ELSE 0 END)
    FROM public.transactions WHERE user_id=_user_id
  ),0);
END $function$;

-- 7. Completion guard also considers fee_outstanding
CREATE OR REPLACE FUNCTION public.enforce_loan_transition()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $function$
DECLARE allowed boolean := false;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF OLD.stage = NEW.stage AND OLD.status = NEW.status THEN
    IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
    RETURN NEW;
  END IF;

  CASE OLD.stage
    WHEN 'submitted'        THEN allowed := public.has_role(auth.uid(),'approver');
    WHEN 'under_review'     THEN allowed := public.has_role(auth.uid(),'approver');
    WHEN 'branch_approval'  THEN allowed := public.has_role(auth.uid(),'approver');
    WHEN 'finance_approval' THEN allowed := public.has_role(auth.uid(),'finance');
    WHEN 'board_chair'      THEN allowed := public.has_board_seat(auth.uid(),'chair');
    WHEN 'board_member_1'   THEN allowed := public.has_board_seat(auth.uid(),'member_1');
    WHEN 'board_member_2'   THEN allowed := public.has_board_seat(auth.uid(),'member_2');
    WHEN 'manager_approval' THEN allowed := public.has_role(auth.uid(),'manager');
    WHEN 'disbursement'     THEN allowed := public.has_role(auth.uid(),'manager');
    ELSE allowed := false;
  END CASE;

  IF NOT allowed THEN
    allowed := public.has_active_proxy(auth.uid(), NEW.id, OLD.stage);
  END IF;
  IF NOT (allowed OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'You do not have authority for stage %', OLD.stage;
  END IF;
  IF NEW.member_id = auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'You cannot act on your own loan application';
  END IF;

  IF NEW.stage <> OLD.stage THEN
    IF NEW.stage = 'rejected' THEN
      NEW.status := 'rejected';
    ELSIF NOT (
      (OLD.stage = 'submitted'        AND NEW.stage = 'under_review') OR
      (OLD.stage = 'under_review'     AND NEW.stage = 'finance_approval') OR
      (OLD.stage = 'finance_approval' AND NEW.stage = 'board_chair') OR
      (OLD.stage = 'board_chair'      AND NEW.stage = 'board_member_1') OR
      (OLD.stage = 'board_member_1'   AND NEW.stage = 'board_member_2') OR
      (OLD.stage = 'board_member_2'   AND NEW.stage = 'manager_approval') OR
      (OLD.stage = 'manager_approval' AND NEW.stage = 'disbursement') OR
      (OLD.stage = 'disbursement'     AND NEW.stage = 'completed') OR
      (OLD.stage = 'branch_approval'  AND NEW.stage = 'finance_approval')
    ) THEN
      RAISE EXCEPTION 'Invalid stage transition: % -> %', OLD.stage, NEW.stage;
    END IF;

    IF OLD.stage = 'disbursement' AND NEW.stage = 'completed' THEN
      IF COALESCE(NEW.outstanding_balance,0) > 0 THEN
        RAISE EXCEPTION 'Loan cannot be marked completed while outstanding balance is TZS %', NEW.outstanding_balance;
      END IF;
      IF COALESCE(NEW.fee_outstanding,0) > 0 THEN
        RAISE EXCEPTION 'Loan cannot be marked completed while fee balance is TZS %', NEW.fee_outstanding;
      END IF;
      IF NEW.disbursement_confirmed_at IS NULL OR NEW.disbursement_confirmed_by IS NULL THEN
        RAISE EXCEPTION 'Disbursement must be confirmed by a manager before completion';
      END IF;
      IF NOT public.has_role(NEW.disbursement_confirmed_by,'manager') THEN
        RAISE EXCEPTION 'Disbursement confirmation must come from a manager';
      END IF;
    END IF;

    UPDATE public.loan_proxies SET consumed_at = now()
      WHERE loan_id = NEW.id AND stage = OLD.stage AND delegate_id = auth.uid()
        AND consumed_at IS NULL AND expires_at > now();
  END IF;
  RETURN NEW;
END $function$;

-- 8. Escalation notifications: notify admins only + notify raiser on resolve/dismiss
CREATE OR REPLACE FUNCTION public.notify_on_escalation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r RECORD; v_link TEXT;
BEGIN
  v_link := CASE WHEN NEW.loan_id IS NOT NULL THEN '/loans/'||NEW.loan_id ELSE '/admin/escalations' END;
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (r.user_id, 'system',
            'Assistant escalation: '||NEW.category,
            left(NEW.notes, 240), v_link);
  END LOOP;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.notify_escalation_resolved()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('resolved','dismissed') AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.raised_by, 'system',
            CASE NEW.status WHEN 'resolved' THEN 'Your issue was resolved' ELSE 'Your issue was dismissed' END,
            COALESCE(NEW.resolution, 'An admin closed the escalation you raised via the assistant.'),
            CASE WHEN NEW.loan_id IS NOT NULL THEN '/loans/'||NEW.loan_id ELSE '/escalations' END);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_esc_resolved ON public.assistant_escalations;
CREATE TRIGGER trg_esc_resolved AFTER UPDATE ON public.assistant_escalations
  FOR EACH ROW EXECUTE FUNCTION public.notify_escalation_resolved();

-- 9. Tighten board_read policy: staff/admin only
DROP POLICY IF EXISTS "board read" ON public.loan_board_members;
CREATE POLICY "board read staff" ON public.loan_board_members
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 10. Restrict financial SECURITY DEFINER RPCs to signed-in users only
REVOKE EXECUTE ON FUNCTION public.get_savings_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.calculate_eligibility(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_register_existing_loan(uuid,numeric,numeric,loan_stage,loan_type,integer,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_assistant_action(text,text,uuid,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_savings_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_existing_loan(uuid,numeric,numeric,loan_stage,loan_type,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_assistant_action(text,text,uuid,jsonb) TO authenticated;