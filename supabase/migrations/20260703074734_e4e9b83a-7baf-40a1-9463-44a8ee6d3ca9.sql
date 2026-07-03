
DROP VIEW IF EXISTS public.loan_sla_status;

CREATE VIEW public.loan_sla_status
WITH (security_invoker = true) AS
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
