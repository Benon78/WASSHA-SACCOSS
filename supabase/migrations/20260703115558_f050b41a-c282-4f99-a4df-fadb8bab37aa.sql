
-- Harden profiles INSERT: block non-admin self-inserts from populating
-- opening_balance, member_number, or joined_at (these drive loan eligibility).
CREATE OR REPLACE FUNCTION public.guard_profile_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Admin / super_admin (and internal SECURITY DEFINER paths like handle_new_user
  -- where auth.uid() is null) may set anything.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.opening_balance IS NOT NULL AND NEW.opening_balance <> 0 THEN
    RAISE EXCEPTION 'Only admins may set opening_balance' USING ERRCODE = '42501';
  END IF;
  IF NEW.member_number IS NOT NULL THEN
    RAISE EXCEPTION 'Only admins may set member_number' USING ERRCODE = '42501';
  END IF;
  IF NEW.joined_at IS NOT NULL AND NEW.joined_at <> now() THEN
    -- allow default now() from handle_new_user; block user-chosen dates
    RAISE EXCEPTION 'Only admins may set joined_at' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_guard_profile_self_insert ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_insert();
