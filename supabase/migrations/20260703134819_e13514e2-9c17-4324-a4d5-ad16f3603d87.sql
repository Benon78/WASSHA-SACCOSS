
DO $$
DECLARE keeper uuid := 'a105f5cf-810a-41e2-a744-68a96996a681';
BEGIN
  -- Disable append-only guard on transactions so we can wipe them
  ALTER TABLE public.transactions DISABLE TRIGGER trg_transactions_append_only;

  -- Loan-related child data
  DELETE FROM public.loan_documents;
  DELETE FROM public.loan_approvals;
  DELETE FROM public.loan_proxies;
  DELETE FROM public.loan_board_members;
  DELETE FROM public.transactions;
  DELETE FROM public.loans;

  -- Assistant / messaging / notifications
  DELETE FROM public.ai_messages;
  DELETE FROM public.assistant_escalations;
  DELETE FROM public.notifications;
  DELETE FROM public.notification_preferences WHERE user_id <> keeper;

  -- Auth telemetry
  DELETE FROM public.auth_events;
  DELETE FROM public.auth_lockouts;
  DELETE FROM public.user_sessions;

  -- Deletion log (fresh slate)
  DELETE FROM public.deletion_log;

  -- Custom role assignments (keep custom_roles definitions)
  DELETE FROM public.user_custom_roles WHERE user_id <> keeper;

  -- Roles: keep keeper's roles only
  DELETE FROM public.user_roles WHERE user_id <> keeper;

  -- Profiles: keep keeper only
  DELETE FROM public.profiles WHERE user_id <> keeper;

  -- Finally remove the auth users (cascade will clean any auth.* leftovers)
  DELETE FROM auth.users WHERE id <> keeper;

  -- Re-enable append-only guard
  ALTER TABLE public.transactions ENABLE TRIGGER trg_transactions_append_only;
END $$;
