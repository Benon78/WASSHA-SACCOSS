
-- has_role: treat super_admin as satisfying an admin check
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'admin' AND role = 'super_admin')
      )
  )
$$;

-- is_staff: super_admin is staff too
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('approver','finance','manager','admin','super_admin')
  )
$$;

-- protect_last_admin: prevent removing the last admin/super_admin
CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE remaining INT;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role IN ('admin','super_admin')) OR
     (TG_OP = 'UPDATE' AND OLD.role IN ('admin','super_admin') AND NEW.role NOT IN ('admin','super_admin')) THEN
    SELECT COUNT(*) INTO remaining FROM public.user_roles
      WHERE role IN ('admin','super_admin') AND id <> OLD.id;
    IF remaining = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last admin';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
