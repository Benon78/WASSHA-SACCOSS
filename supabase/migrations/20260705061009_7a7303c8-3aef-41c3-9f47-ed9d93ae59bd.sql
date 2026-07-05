CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('approver','finance','manager','admin','super_admin')
  ) OR EXISTS (
    SELECT 1 FROM public.loan_board_members WHERE user_id = _user_id
  )
$function$;