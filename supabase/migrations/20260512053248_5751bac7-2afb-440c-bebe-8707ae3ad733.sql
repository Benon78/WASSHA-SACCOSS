
CREATE OR REPLACE FUNCTION public.enforce_loan_transition()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE required_role app_role;
BEGIN
  IF OLD.stage = NEW.stage AND OLD.status = NEW.status THEN
    IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
    RETURN NEW;
  END IF;
  required_role := CASE OLD.stage
    WHEN 'submitted'        THEN 'approver'::app_role
    WHEN 'under_review'     THEN 'approver'::app_role
    WHEN 'branch_approval'  THEN 'approver'::app_role
    WHEN 'finance_approval' THEN 'finance'::app_role
    WHEN 'manager_approval' THEN 'manager'::app_role
    WHEN 'disbursement'     THEN 'manager'::app_role
    ELSE NULL END;
  IF required_role IS NULL THEN
    RAISE EXCEPTION 'Loan at stage % cannot be modified', OLD.stage;
  END IF;
  IF NOT (public.has_role(auth.uid(), required_role) OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Role % required to act on stage %', required_role, OLD.stage;
  END IF;
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
END $fn$;
