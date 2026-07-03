
CREATE OR REPLACE FUNCTION public.guard_admin_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('admin','super_admin') THEN
    -- allow the automatic 'member' seed from handle_new_user() and internal jobs
    IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only a Super Admin can assign the % role', NEW.role
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_admin_role_assignment ON public.user_roles;
CREATE TRIGGER trg_guard_admin_role_assignment
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_admin_role_assignment();
