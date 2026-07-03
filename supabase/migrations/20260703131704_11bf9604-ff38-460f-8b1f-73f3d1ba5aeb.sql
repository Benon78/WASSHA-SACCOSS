-- Add updated_at column to profiles so trg_profiles_updated_at trigger works.
-- Without this, updates to profiles (e.g. admin setting member_number / joined_at
-- for a new signup) fail with: record "new" has no field "updated_at".

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill for existing rows (DEFAULT already covers new inserts).
UPDATE public.profiles SET updated_at = COALESCE(updated_at, created_at, now());