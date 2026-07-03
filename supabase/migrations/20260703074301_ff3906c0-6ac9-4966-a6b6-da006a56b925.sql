
ALTER TABLE public.loan_policies
  ADD COLUMN IF NOT EXISTS emergency_rate numeric NOT NULL DEFAULT 18.0,
  ADD COLUMN IF NOT EXISTS emergency_multiplier numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS emergency_max_amount numeric NOT NULL DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS emergency_max_term_months integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS chapchap_rate numeric NOT NULL DEFAULT 15.0,
  ADD COLUMN IF NOT EXISTS late_penalty_rate numeric NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS processing_fee_rate numeric NOT NULL DEFAULT 1.0;
