
REVOKE EXECUTE ON FUNCTION public.block_audit_mutation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_notification_prefs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_admin_role_assignment() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_profile_self_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
