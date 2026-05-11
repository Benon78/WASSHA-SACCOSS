
-- Lock down all SECURITY DEFINER functions: revoke from anon/public,
-- grant only what authenticated users actually need.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Grant back only the user-callable ones
GRANT EXECUTE ON FUNCTION public.get_savings_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_loan_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_policy() TO authenticated;
