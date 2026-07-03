
DO $$
DECLARE keeper uuid := 'a105f5cf-810a-41e2-a744-68a96996a681';
BEGIN
  ALTER TABLE public.transactions DISABLE TRIGGER trg_transactions_append_only;

  DELETE FROM public.loan_documents;
  DELETE FROM public.loan_approvals;
  DELETE FROM public.loan_proxies;
  DELETE FROM public.loan_board_members;
  DELETE FROM public.transactions;
  DELETE FROM public.loans;

  DELETE FROM public.ai_messages;
  DELETE FROM public.assistant_escalations;
  DELETE FROM public.notifications;
  DELETE FROM public.notification_preferences WHERE user_id <> keeper;

  DELETE FROM public.auth_events;
  DELETE FROM public.auth_lockouts;
  DELETE FROM public.user_sessions;
  DELETE FROM public.deletion_log;

  DELETE FROM public.user_custom_roles WHERE user_id <> keeper;
  DELETE FROM public.user_roles WHERE user_id <> keeper;
  DELETE FROM public.profiles WHERE user_id <> keeper;

  DELETE FROM auth.identities WHERE user_id <> keeper;
  DELETE FROM auth.sessions WHERE user_id <> keeper;
  DELETE FROM auth.refresh_tokens WHERE user_id::uuid <> keeper;
  DELETE FROM auth.mfa_factors WHERE user_id <> keeper;
  DELETE FROM auth.users WHERE id <> keeper;

  ALTER TABLE public.transactions ENABLE TRIGGER trg_transactions_append_only;
END $$;
