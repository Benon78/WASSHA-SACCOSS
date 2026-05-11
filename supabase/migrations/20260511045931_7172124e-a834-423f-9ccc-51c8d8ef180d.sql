
-- ============================================================
-- WASSHA SACCOS — Security hardening + new modules
-- ============================================================

-- 0. Extend enums ------------------------------------------------
DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE IF NOT EXISTS 'disbursement';
EXCEPTION WHEN others THEN NULL; END $$;

-- 1. Tighten SECURITY DEFINER functions --------------------------
CREATE OR REPLACE FUNCTION public.get_savings_balance(_user_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN COALESCE((
    SELECT SUM(CASE WHEN tx_type IN ('deposit','contribution','disbursement') THEN amount
                    WHEN tx_type IN ('withdrawal','fee') THEN -amount
                    ELSE 0 END)
    FROM public.transactions WHERE user_id = _user_id
  ),0) - COALESCE((
    -- disbursement credited to member account but NOT counted as savings
    SELECT SUM(amount) FROM public.transactions WHERE user_id = _user_id AND tx_type='disbursement'
  ),0);
END $$;

CREATE OR REPLACE FUNCTION public.get_active_loan_balance(_user_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN COALESCE((
    SELECT SUM(outstanding_balance) FROM public.loans
    WHERE member_id = _user_id AND status IN ('approved','disbursed')
  ),0);
END $$;

-- 2. Loan policies (versioned) ----------------------------------
CREATE TABLE IF NOT EXISTS public.loan_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL,
  interest_rate NUMERIC NOT NULL DEFAULT 12.0,
  min_savings NUMERIC NOT NULL DEFAULT 100000,
  savings_multiplier NUMERIC NOT NULL DEFAULT 3,
  min_membership_months INT NOT NULL DEFAULT 3,
  max_term_months INT NOT NULL DEFAULT 36,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.loan_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policies read" ON public.loan_policies;
CREATE POLICY "policies read" ON public.loan_policies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "policies admin write" ON public.loan_policies;
CREATE POLICY "policies admin write" ON public.loan_policies FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed initial policy if empty
INSERT INTO public.loan_policies (version, interest_rate, min_savings, savings_multiplier, min_membership_months, max_term_months, notes)
SELECT 1, 12.0, 100000, 3, 3, 36, 'Initial policy'
WHERE NOT EXISTS (SELECT 1 FROM public.loan_policies);

CREATE OR REPLACE FUNCTION public.current_policy()
RETURNS public.loan_policies LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.loan_policies WHERE effective_from <= now() ORDER BY effective_from DESC, version DESC LIMIT 1
$$;

-- 3. Eligibility uses latest policy + ownership guard -----------
CREATE OR REPLACE FUNCTION public.calculate_eligibility(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.loan_policies; v_savings NUMERIC; v_active NUMERIC; v_max NUMERIC;
  v_joined TIMESTAMPTZ; v_months NUMERIC; v_pending INT;
  v_reasons JSONB := '[]'::jsonb; v_eligible BOOLEAN := true;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  p := public.current_policy();
  SELECT joined_at INTO v_joined FROM public.profiles WHERE user_id = _user_id;
  v_savings := public.get_savings_balance(_user_id);
  v_active := public.get_active_loan_balance(_user_id);
  v_months := EXTRACT(EPOCH FROM (now() - COALESCE(v_joined, now())))/2592000;
  SELECT COUNT(*) INTO v_pending FROM public.loans WHERE member_id=_user_id AND status='pending';
  v_max := GREATEST(0, (v_savings * p.savings_multiplier) - v_active);

  IF v_savings < p.min_savings THEN
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_object('code','low_savings','message',
      format('Minimum savings of TZS %s required (you have TZS %s).', p.min_savings, v_savings));
  END IF;
  IF v_months < p.min_membership_months THEN
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_object('code','new_member','message',
      format('Membership must be at least %s months (you have %s).', p.min_membership_months, round(v_months,1)));
  END IF;
  IF v_pending > 0 THEN
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_object('code','pending_loan','message',
      'You have a pending loan application. Please wait for it to be processed.');
  END IF;
  IF v_max <= 0 AND v_eligible THEN
    v_eligible := false;
    v_reasons := v_reasons || jsonb_build_object('code','no_capacity','message',
      'Active loan balance has consumed your borrowing capacity.');
  END IF;

  RETURN jsonb_build_object(
    'eligible', v_eligible, 'max_amount', v_max, 'savings', v_savings,
    'active_loan_balance', v_active, 'months_member', round(v_months,1),
    'reasons', v_reasons,
    'policy', jsonb_build_object('version',p.version,'interest_rate',p.interest_rate,
      'multiplier',p.savings_multiplier,'max_term_months',p.max_term_months)
  );
END $$;

-- 4. Revoke EXECUTE from anon on sensitive functions ------------
REVOKE EXECUTE ON FUNCTION public.get_savings_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.calculate_eligibility(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_policy() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_savings_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_policy() TO authenticated;

-- 5. Loan stage-transition enforcement (server-side) ------------
CREATE OR REPLACE FUNCTION public.enforce_loan_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  required_role app_role;
BEGIN
  -- Allow non-stage/status updates (e.g. outstanding_balance) by staff
  IF OLD.stage = NEW.stage AND OLD.status = NEW.status THEN
    IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
    RETURN NEW;
  END IF;

  -- Determine required role for the *current* stage
  required_role := CASE OLD.stage
    WHEN 'submitted' THEN 'approver'::app_role
    WHEN 'under_review' THEN 'approver'::app_role
    WHEN 'branch_approval' THEN 'approver'::app_role
    WHEN 'finance_approval' THEN 'finance'::app_role
    WHEN 'manager_approval' THEN 'manager'::app_role
    WHEN 'disbursement' THEN 'finance'::app_role
    ELSE NULL END;

  IF required_role IS NULL THEN
    RAISE EXCEPTION 'Loan at stage % cannot be modified', OLD.stage;
  END IF;

  IF NOT (public.has_role(auth.uid(), required_role) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Role % required to act on stage %', required_role, OLD.stage;
  END IF;

  -- Validate stage transitions
  IF NEW.stage <> OLD.stage THEN
    IF NEW.stage = 'rejected' THEN
      NEW.status := 'rejected';
    ELSIF NOT (
      (OLD.stage = 'submitted'        AND NEW.stage = 'under_review') OR
      (OLD.stage = 'under_review'     AND NEW.stage = 'branch_approval') OR
      (OLD.stage = 'branch_approval'  AND NEW.stage = 'finance_approval') OR
      (OLD.stage = 'finance_approval' AND NEW.stage = 'manager_approval') OR
      (OLD.stage = 'manager_approval' AND NEW.stage = 'disbursement') OR
      (OLD.stage = 'disbursement'     AND NEW.stage = 'completed')
    ) THEN
      RAISE EXCEPTION 'Invalid stage transition: % -> %', OLD.stage, NEW.stage;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_loan_transition ON public.loans;
CREATE TRIGGER trg_enforce_loan_transition
BEFORE UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.enforce_loan_transition();

-- 6. Disbursement → completed automation -------------------------
-- When loan moves to 'completed' from disbursement by finance, post a
-- 'disbursement' transaction crediting the member.
CREATE OR REPLACE FUNCTION public.post_disbursement_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.stage = 'disbursement' AND NEW.stage = 'completed' THEN
    NEW.status := 'disbursed';
    INSERT INTO public.transactions (user_id, amount, tx_type, description)
    VALUES (NEW.member_id, COALESCE(NEW.amount_approved, NEW.amount_requested),
            'disbursement', 'Loan ' || NEW.loan_number || ' disbursed');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_post_disbursement ON public.loans;
CREATE TRIGGER trg_post_disbursement BEFORE UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.post_disbursement_tx();

-- Repayment auto-decrement
CREATE OR REPLACE FUNCTION public.apply_repayment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tx_type = 'repayment' THEN
    UPDATE public.loans
       SET outstanding_balance = GREATEST(0, outstanding_balance - NEW.amount),
           status = CASE WHEN outstanding_balance - NEW.amount <= 0 THEN 'completed'::loan_status ELSE status END
     WHERE member_id = NEW.user_id AND status = 'disbursed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_apply_repayment ON public.transactions;
CREATE TRIGGER trg_apply_repayment AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.apply_repayment();

-- 7. Storage policies for loan-documents -------------------------
DROP POLICY IF EXISTS "loan-docs delete" ON storage.objects;
CREATE POLICY "loan-docs delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'loan-documents' AND (
  public.is_staff(auth.uid()) OR auth.uid()::text = (storage.foldername(name))[1]
));
DROP POLICY IF EXISTS "loan-docs update" ON storage.objects;
CREATE POLICY "loan-docs update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'loan-documents' AND (
  public.is_staff(auth.uid()) OR auth.uid()::text = (storage.foldername(name))[1]
));

-- 8. Protect last admin -----------------------------------------
CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining INT;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'admin') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'admin' AND NEW.role <> 'admin') THEN
    SELECT COUNT(*) INTO remaining FROM public.user_roles
      WHERE role = 'admin' AND id <> OLD.id;
    IF remaining = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last admin';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_protect_last_admin ON public.user_roles;
CREATE TRIGGER trg_protect_last_admin BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

-- 9. Audit log ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit admin read" ON public.audit_log;
CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME,
          COALESCE((NEW).id, (OLD).id),
          to_jsonb(COALESCE(NEW, OLD)));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_loans ON public.loans;
CREATE TRIGGER trg_audit_loans AFTER UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_loan_policies ON public.loan_policies;
CREATE TRIGGER trg_audit_loan_policies AFTER INSERT ON public.loan_policies
FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- 10. Allow admin to update profiles.joined_at -------------------
DROP POLICY IF EXISTS "profiles admin update" ON public.profiles;
CREATE POLICY "profiles admin update" ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

-- 11. Realtime topic isolation for notifications ----------------
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user notif topic read" ON realtime.messages;
CREATE POLICY "user notif topic read" ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() = 'user-notif-' || auth.uid()::text
  OR realtime.topic() LIKE 'realtime:%'  -- allow built-in postgres_changes pattern
);
