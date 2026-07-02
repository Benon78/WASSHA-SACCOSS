-- Fix infinite recursion: the WITH CHECK subquery on profiles re-triggered
-- RLS on profiles. The guard_profile_self_update trigger already enforces
-- that members cannot change opening_balance / member_number / joined_at,
-- so the RLS policy no longer needs to compare with a subquery.
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Prevent shifting a loan to 'completed' while there is still an outstanding
-- balance. Only the repayment trigger (which sets balance to 0 first) may.
CREATE OR REPLACE FUNCTION public.enforce_loan_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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