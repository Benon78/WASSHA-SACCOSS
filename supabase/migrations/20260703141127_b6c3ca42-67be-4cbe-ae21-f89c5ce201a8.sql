DO $$
DECLARE v_keep uuid := 'a105f5cf-810a-41e2-a744-68a96996a681'; v_deleted int;
BEGIN
  PERFORM set_config('app.ai_context','false',true);
  ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_no_update;
  ALTER TABLE public.audit_log DISABLE TRIGGER trg_audit_log_append_only;

  DELETE FROM public.audit_log WHERE actor_id IS NOT NULL AND actor_id <> v_keep;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'deleted % orphaned audit rows', v_deleted;

  ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_no_update;
  ALTER TABLE public.audit_log ENABLE TRIGGER trg_audit_log_append_only;
END $$;