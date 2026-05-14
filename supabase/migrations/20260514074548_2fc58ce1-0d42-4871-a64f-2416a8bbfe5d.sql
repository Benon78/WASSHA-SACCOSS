
-- 1. Tighten SECURITY DEFINER & revoke anon
REVOKE EXECUTE ON FUNCTION public.get_savings_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.calculate_eligibility(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_policy() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_board_seat(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_savings_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_board_seat(uuid, text) TO authenticated;

-- 2. profiles RLS
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update" ON public.profiles
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
     OR NEW.member_number IS DISTINCT FROM OLD.member_number
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'Only admins may change opening_balance, member_number or joined_at';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- 3. loan_documents mime types
DELETE FROM public.loan_documents
 WHERE mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
    OR mime_type IS NULL;
ALTER TABLE public.loan_documents DROP CONSTRAINT IF EXISTS loan_documents_mime_check;
ALTER TABLE public.loan_documents
  ADD CONSTRAINT loan_documents_mime_check
  CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp'));

CREATE OR REPLACE FUNCTION public.guard_loan_doc_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.bucket_id = 'loan-documents' THEN
    IF lower(NEW.name) ~ '\.svg($|\?)' OR lower(NEW.name) ~ '\.svgz($|\?)' THEN
      RAISE EXCEPTION 'SVG uploads are not permitted';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_loan_doc_upload ON storage.objects;
CREATE TRIGGER trg_guard_loan_doc_upload
BEFORE INSERT ON storage.objects
FOR EACH ROW EXECUTE FUNCTION public.guard_loan_doc_upload();

-- 4. loans staff update stage-aware
DROP POLICY IF EXISTS "loans staff update" ON public.loans;
CREATE POLICY "loans staff update" ON public.loans
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR (stage = 'submitted'        AND public.has_role(auth.uid(),'approver'))
  OR (stage = 'under_review'     AND public.has_role(auth.uid(),'approver'))
  OR (stage = 'branch_approval'  AND public.has_role(auth.uid(),'approver'))
  OR (stage = 'finance_approval' AND public.has_role(auth.uid(),'finance'))
  OR (stage = 'board_chair'      AND public.has_board_seat(auth.uid(),'chair'))
  OR (stage = 'board_member_1'   AND public.has_board_seat(auth.uid(),'member_1'))
  OR (stage = 'board_member_2'   AND public.has_board_seat(auth.uid(),'member_2'))
  OR (stage = 'manager_approval' AND public.has_role(auth.uid(),'manager'))
  OR (stage = 'disbursement'     AND public.has_role(auth.uid(),'manager'))
);

-- 5. Disbursement confirmation columns + transition guard
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS disbursement_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disbursement_confirmed_by UUID;

CREATE OR REPLACE FUNCTION public.enforce_loan_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
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

  IF NOT (allowed OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'You do not have authority for stage %', OLD.stage;
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
      IF NEW.disbursement_confirmed_at IS NULL OR NEW.disbursement_confirmed_by IS NULL THEN
        RAISE EXCEPTION 'Disbursement must be confirmed by a manager before completion';
      END IF;
      IF NOT public.has_role(NEW.disbursement_confirmed_by,'manager') THEN
        RAISE EXCEPTION 'Disbursement confirmation must come from a manager';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.apply_repayment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_new_balance NUMERIC;
BEGIN
  IF NEW.tx_type = 'repayment' THEN
    IF NEW.loan_id IS NULL THEN
      RAISE EXCEPTION 'loan_id is required for repayment transactions';
    END IF;
    SELECT GREATEST(0, outstanding_balance - NEW.amount) INTO v_new_balance
      FROM public.loans WHERE id = NEW.loan_id;
    UPDATE public.loans
       SET outstanding_balance = v_new_balance,
           status = CASE WHEN v_new_balance <= 0 THEN 'completed'::loan_status ELSE status END,
           stage  = CASE WHEN v_new_balance <= 0 THEN 'completed'::loan_stage  ELSE stage  END,
           disbursement_confirmed_at = CASE
             WHEN v_new_balance <= 0 AND disbursement_confirmed_at IS NULL THEN now()
             ELSE disbursement_confirmed_at END,
           disbursement_confirmed_by = CASE
             WHEN v_new_balance <= 0 AND disbursement_confirmed_by IS NULL THEN auth.uid()
             ELSE disbursement_confirmed_by END
     WHERE id = NEW.loan_id;
  END IF;
  RETURN NEW;
END $$;

-- 6. Audit triggers
DROP TRIGGER IF EXISTS trg_audit_loans          ON public.loans;
DROP TRIGGER IF EXISTS trg_audit_transactions   ON public.transactions;
DROP TRIGGER IF EXISTS trg_audit_loan_approvals ON public.loan_approvals;
DROP TRIGGER IF EXISTS trg_audit_loan_policies  ON public.loan_policies;
DROP TRIGGER IF EXISTS trg_audit_user_roles     ON public.user_roles;
CREATE TRIGGER trg_audit_loans          AFTER INSERT OR UPDATE OR DELETE ON public.loans          FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trg_audit_transactions   AFTER INSERT OR UPDATE OR DELETE ON public.transactions   FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trg_audit_loan_approvals AFTER INSERT OR UPDATE OR DELETE ON public.loan_approvals FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trg_audit_loan_policies  AFTER INSERT OR UPDATE OR DELETE ON public.loan_policies  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER trg_audit_user_roles     AFTER INSERT OR UPDATE OR DELETE ON public.user_roles     FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- 7. Notifications dedupe via trigger (avoid duplicate within 60s for same user/type/link)
CREATE OR REPLACE FUNCTION public.dedupe_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = NEW.user_id
       AND type = NEW.type
       AND COALESCE(link,'') = COALESCE(NEW.link,'')
       AND title = NEW.title
       AND created_at > now() - interval '60 seconds'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_dedupe_notification ON public.notifications;
CREATE TRIGGER trg_dedupe_notification
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.dedupe_notification();

-- 8. Admin RPC: register existing loan, bypasses eligibility
CREATE OR REPLACE FUNCTION public.enforce_loan_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE elig JSONB; rule public.loan_type_rules; cap NUMERIC;
BEGIN
  IF public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF NEW.member_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'You can only apply for your own account';
  END IF;
  SELECT * INTO rule FROM public.loan_type_rules WHERE loan_type = NEW.loan_type;
  IF rule.loan_type IS NOT NULL THEN
    IF NEW.term_months > rule.max_term_months THEN
      RAISE EXCEPTION 'Term exceeds max % months for % loan', rule.max_term_months, NEW.loan_type;
    END IF;
    IF NEW.amount_requested > rule.max_amount THEN
      RAISE EXCEPTION 'Amount exceeds max % for % loan', rule.max_amount, NEW.loan_type;
    END IF;
  END IF;
  elig := public.calculate_eligibility(NEW.member_id);
  IF (elig->>'eligible')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'Not eligible: %', elig->'reasons';
  END IF;
  cap := (elig->>'max_amount')::NUMERIC;
  IF rule.max_amount IS NOT NULL THEN cap := LEAST(cap, rule.max_amount); END IF;
  IF NEW.amount_requested > cap THEN
    RAISE EXCEPTION 'Amount exceeds your limit of TZS %', cap;
  END IF;
  NEW.eligibility_limit := cap;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_loan_eligibility ON public.loans;
CREATE TRIGGER trg_enforce_loan_eligibility
BEFORE INSERT ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.enforce_loan_eligibility();

CREATE OR REPLACE FUNCTION public.admin_register_existing_loan(
  _member_id uuid,
  _amount numeric,
  _outstanding numeric,
  _stage loan_stage,
  _loan_type loan_type,
  _term_months int,
  _purpose text DEFAULT 'Pre-existing loan migrated by admin'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  INSERT INTO public.loans (
    member_id, amount_requested, amount_approved, outstanding_balance,
    purpose, term_months, stage, status, loan_type, eligibility_limit,
    disbursement_confirmed_at, disbursement_confirmed_by
  ) VALUES (
    _member_id, _amount, _amount, _outstanding,
    _purpose, _term_months,
    CASE WHEN _outstanding <= 0 THEN 'completed'::loan_stage ELSE _stage END,
    CASE WHEN _outstanding <= 0 THEN 'completed'::loan_status ELSE 'disbursed'::loan_status END,
    _loan_type, _amount,
    now(), auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_register_existing_loan(uuid,numeric,numeric,loan_stage,loan_type,int,text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_register_existing_loan(uuid,numeric,numeric,loan_stage,loan_type,int,text) TO authenticated;
