
REVOKE EXECUTE ON FUNCTION public.guard_loan_immutable_fields()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_mutation_append_only()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_ai_writes()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_loan_proxy()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dedupe_notification()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_loan_doc_upload()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_context_active()             FROM PUBLIC, anon;
-- ai_context_active is used by RLS/triggers at runtime; authenticated may keep it (stable, no side effects)
GRANT   EXECUTE ON FUNCTION public.ai_context_active()             TO authenticated;
