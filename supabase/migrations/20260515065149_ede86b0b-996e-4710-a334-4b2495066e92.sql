
CREATE TABLE IF NOT EXISTS public.loan_proxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  stage loan_stage NOT NULL,
  delegate_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_proxies_loan ON public.loan_proxies(loan_id, stage, delegate_id) WHERE consumed_at IS NULL;

ALTER TABLE public.loan_proxies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proxy admin write" ON public.loan_proxies;
CREATE POLICY "proxy admin write" ON public.loan_proxies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "proxy read" ON public.loan_proxies;
CREATE POLICY "proxy read" ON public.loan_proxies
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR delegate_id = auth.uid() OR EXISTS(
    SELECT 1 FROM public.loans l WHERE l.id = loan_proxies.loan_id AND l.member_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.has_active_proxy(_user_id uuid, _loan_id uuid, _stage loan_stage)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.loan_proxies
    WHERE delegate_id = _user_id
      AND loan_id = _loan_id
      AND stage = _stage
      AND consumed_at IS NULL
      AND expires_at > now()
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_active_proxy(uuid,uuid,loan_stage) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_active_proxy(uuid,uuid,loan_stage) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_loan_transition()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='loans') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.loans';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='transactions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions';
  END IF;
END $$;

ALTER TABLE public.loans REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
