
-- 1. stage_entered_at on loans
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows to a reasonable start point
UPDATE public.loans SET stage_entered_at = COALESCE(updated_at, created_at) WHERE stage_entered_at IS NULL;

-- 2. trigger to bump stage_entered_at on stage change
CREATE OR REPLACE FUNCTION public.touch_stage_entered_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_entered_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_stage_entered_at ON public.loans;
CREATE TRIGGER trg_touch_stage_entered_at
  BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.touch_stage_entered_at();

-- 3. sla_config table
CREATE TABLE IF NOT EXISTS public.sla_config (
  stage public.loan_stage PRIMARY KEY,
  max_hours integer NOT NULL DEFAULT 48,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_config TO authenticated;
GRANT ALL ON public.sla_config TO service_role;

ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read sla_config" ON public.sla_config;
CREATE POLICY "Staff can read sla_config" ON public.sla_config
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage sla_config" ON public.sla_config;
CREATE POLICY "Admins manage sla_config" ON public.sla_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed defaults (idempotent)
INSERT INTO public.sla_config (stage, max_hours) VALUES
  ('submitted', 24),
  ('under_review', 48),
  ('finance_approval', 48),
  ('board_chair', 72),
  ('board_member_1', 72),
  ('board_member_2', 72),
  ('manager_approval', 48),
  ('disbursement', 24)
ON CONFLICT (stage) DO NOTHING;

-- 4. SLA view of open loans
CREATE OR REPLACE VIEW public.loan_sla_status AS
SELECT
  l.id,
  l.loan_number,
  l.member_id,
  l.amount_requested,
  l.amount_approved,
  l.stage,
  l.status,
  l.stage_entered_at,
  EXTRACT(EPOCH FROM (now() - l.stage_entered_at))/3600.0 AS hours_in_stage,
  s.max_hours AS sla_max_hours,
  CASE
    WHEN s.max_hours IS NULL THEN false
    ELSE EXTRACT(EPOCH FROM (now() - l.stage_entered_at))/3600.0 > s.max_hours
  END AS overdue
FROM public.loans l
LEFT JOIN public.sla_config s ON s.stage = l.stage
WHERE l.stage NOT IN ('completed','rejected');

GRANT SELECT ON public.loan_sla_status TO authenticated;
