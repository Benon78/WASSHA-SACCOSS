
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_savings_balance(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_active_loan_balance(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_eligibility(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_savings_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_loan_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_eligibility(UUID) TO authenticated;
