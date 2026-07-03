
-- =====================================================================
-- Phase 1 hardening: audited SECURITY DEFINER RPCs + lock direct writes
-- =====================================================================

-- ---------- 14. Audit helper (actor context + reason) ----------------
CREATE OR REPLACE FUNCTION public.record_privileged_audit(
  _action text,
  _entity text,
  _entity_id uuid,
  _before jsonb,
  _after jsonb,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_no text;
  v_actor_roles text;
  v_ip text;
  v_ua text;
BEGIN
  SELECT p.full_name, p.member_number INTO v_actor_name, v_actor_no
    FROM public.profiles p WHERE p.user_id = v_actor;
  SELECT string_agg(role::text, ',') INTO v_actor_roles
    FROM public.user_roles WHERE user_id = v_actor;
  BEGIN v_ip := current_setting('request.headers', true)::jsonb->>'x-forwarded-for'; EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;
  BEGIN v_ua := current_setting('request.headers', true)::jsonb->>'user-agent'; EXCEPTION WHEN OTHERS THEN v_ua := NULL; END;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (
    v_actor,
    'privileged:'||_action,
    _entity,
    _entity_id,
    jsonb_build_object(
      'actor_name', COALESCE(v_actor_name,'Unknown'),
      'actor_member_no', v_actor_no,
      'actor_roles', v_actor_roles,
      'reason', _reason,
      'ip', v_ip,
      'user_agent', v_ua,
      'before', _before,
      'after', _after,
      'summary', format('%s performed %s on %s', COALESCE(v_actor_name,'Unknown'), _action, _entity)
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.record_privileged_audit(text,text,uuid,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_privileged_audit(text,text,uuid,jsonb,jsonb,text) TO service_role;

-- Common guard: require auth + a permission code, or super_admin.
CREATE OR REPLACE FUNCTION public.require_permission(_code text)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501', DETAIL = 'You must be signed in.';
  END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), _code)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501',
      DETAIL = format('Missing permission: %s', _code);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.require_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_permission(text) TO authenticated, service_role;

-- =====================================================================
-- 1. USER ROLES
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_assign_user_role(
  _user_id uuid, _role app_role, _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.require_permission('user.assign_role');
  IF _role IN ('admin','super_admin') AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a Super Admin can assign the % role', _role USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.user_roles(user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING
    RETURNING id INTO v_id;
  PERFORM public.record_privileged_audit(
    'assign_user_role','user_roles', _user_id, NULL,
    jsonb_build_object('role', _role), _reason);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_remove_user_role(
  _user_id uuid, _role app_role, _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_permission('user.assign_role');
  IF _role IN ('admin','super_admin') AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a Super Admin can remove the % role', _role USING ERRCODE='42501';
  END IF;
  DELETE FROM public.user_roles WHERE user_id=_user_id AND role=_role;
  PERFORM public.record_privileged_audit(
    'remove_user_role','user_roles', _user_id,
    jsonb_build_object('role', _role), NULL, _reason);
END $$;

-- Suspend / reactivate (profiles.suspended_at is the source of truth)
CREATE OR REPLACE FUNCTION public.rpc_suspend_user(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb;
BEGIN
  PERFORM public.require_permission('user.suspend');
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot suspend yourself' USING ERRCODE='22023';
  END IF;
  IF public.is_super_admin(_user_id) AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a Super Admin can suspend a Super Admin' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(p) INTO v_before FROM public.profiles p WHERE user_id=_user_id;
  UPDATE public.profiles
     SET suspended_at = now(), suspended_reason = _reason
   WHERE user_id = _user_id;
  PERFORM public.record_privileged_audit(
    'suspend_user','profiles', _user_id, v_before,
    jsonb_build_object('suspended_at', now(), 'suspended_reason', _reason), _reason);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_reactivate_user(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb;
BEGIN
  PERFORM public.require_permission('user.unlock');
  SELECT to_jsonb(p) INTO v_before FROM public.profiles p WHERE user_id=_user_id;
  UPDATE public.profiles
     SET suspended_at = NULL, suspended_reason = NULL
   WHERE user_id = _user_id;
  PERFORM public.record_privileged_audit(
    'reactivate_user','profiles', _user_id, v_before,
    jsonb_build_object('suspended_at', NULL), _reason);
END $$;

-- Assign branch to user
CREATE OR REPLACE FUNCTION public.rpc_assign_user_branch(
  _user_id uuid, _branch_id uuid, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb;
BEGIN
  PERFORM public.require_permission('user.assign_branch');
  IF _branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id=_branch_id) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(p) INTO v_before FROM public.profiles p WHERE user_id=_user_id;
  UPDATE public.profiles SET branch_id = _branch_id WHERE user_id = _user_id;
  PERFORM public.record_privileged_audit(
    'assign_user_branch','profiles', _user_id, v_before,
    jsonb_build_object('branch_id', _branch_id), _reason);
END $$;

-- =====================================================================
-- 2. LOAN POLICIES
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_publish_loan_policy(_payload jsonb, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_next int; v_id uuid;
BEGIN
  PERFORM public.require_permission('policy.manage');
  SELECT COALESCE(MAX(version),0)+1 INTO v_next FROM public.loan_policies;
  INSERT INTO public.loan_policies (
    version, interest_rate, min_savings, savings_multiplier,
    min_membership_months, max_term_months, notes, created_by,
    emergency_rate, emergency_multiplier, emergency_max_amount, emergency_max_term_months,
    chapchap_rate, late_penalty_rate, processing_fee_rate
  ) VALUES (
    v_next,
    (_payload->>'interest_rate')::numeric,
    (_payload->>'min_savings')::numeric,
    (_payload->>'savings_multiplier')::numeric,
    (_payload->>'min_membership_months')::int,
    (_payload->>'max_term_months')::int,
    NULLIF(_payload->>'notes',''),
    auth.uid(),
    COALESCE((_payload->>'emergency_rate')::numeric, 18),
    COALESCE((_payload->>'emergency_multiplier')::numeric, 1.5),
    COALESCE((_payload->>'emergency_max_amount')::numeric, 1000000),
    COALESCE((_payload->>'emergency_max_term_months')::int, 6),
    COALESCE((_payload->>'chapchap_rate')::numeric, 15),
    COALESCE((_payload->>'late_penalty_rate')::numeric, 2),
    COALESCE((_payload->>'processing_fee_rate')::numeric, 1)
  ) RETURNING id INTO v_id;
  PERFORM public.record_privileged_audit(
    'publish_loan_policy','loan_policies', v_id, NULL,
    jsonb_build_object('version', v_next, 'payload', _payload), _reason);
  RETURN v_id;
END $$;

-- =====================================================================
-- 3. SYSTEM SETTINGS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_update_system_setting(
  _key text, _value jsonb, _reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_prev record; v_next int; v_id uuid;
BEGIN
  PERFORM public.require_permission('settings.update');
  SELECT id, version, value INTO v_prev FROM public.system_settings
    WHERE key=_key AND is_current=true;
  v_next := COALESCE(v_prev.version,0)+1;
  IF v_prev.id IS NOT NULL THEN
    UPDATE public.system_settings SET is_current=false WHERE id=v_prev.id;
  END IF;
  INSERT INTO public.system_settings(key, value, version, is_current, updated_by)
    VALUES (_key, _value, v_next, true, auth.uid())
    RETURNING id INTO v_id;
  PERFORM public.record_privileged_audit(
    'update_system_setting','system_settings', v_id,
    to_jsonb(v_prev), jsonb_build_object('key',_key,'value',_value,'version',v_next),
    _reason);
  RETURN v_id;
END $$;

-- =====================================================================
-- 4. BRANCHES
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_branch(
  _code text, _name text, _address text DEFAULT NULL, _manager_id uuid DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.require_permission('branch.manage');
  IF _code IS NULL OR length(trim(_code))=0 THEN RAISE EXCEPTION 'Branch code is required' USING ERRCODE='22023'; END IF;
  IF _name IS NULL OR length(trim(_name))=0 THEN RAISE EXCEPTION 'Branch name is required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.branches(code, name, address, manager_id, status)
    VALUES (upper(trim(_code)), trim(_name), NULLIF(trim(_address),''), _manager_id, 'active')
    RETURNING id INTO v_id;
  PERFORM public.record_privileged_audit(
    'create_branch','branches', v_id, NULL,
    jsonb_build_object('code',_code,'name',_name,'manager_id',_manager_id), _reason);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_update_branch(
  _id uuid, _patch jsonb, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb;
BEGIN
  PERFORM public.require_permission('branch.manage');
  SELECT to_jsonb(b) INTO v_before FROM public.branches b WHERE id=_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Branch not found' USING ERRCODE='22023'; END IF;
  UPDATE public.branches SET
    name       = COALESCE(NULLIF(_patch->>'name',''),        name),
    address    = COALESCE(NULLIF(_patch->>'address',''),     address),
    manager_id = COALESCE(NULLIF(_patch->>'manager_id','')::uuid, manager_id),
    status     = COALESCE(NULLIF(_patch->>'status',''),      status),
    updated_at = now()
  WHERE id=_id;
  PERFORM public.record_privileged_audit(
    'update_branch','branches', _id, v_before, _patch, _reason);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_disable_branch(_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb;
BEGIN
  PERFORM public.require_permission('branch.manage');
  SELECT to_jsonb(b) INTO v_before FROM public.branches b WHERE id=_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Branch not found' USING ERRCODE='22023'; END IF;
  UPDATE public.branches SET status='inactive', updated_at=now() WHERE id=_id;
  PERFORM public.record_privileged_audit(
    'disable_branch','branches', _id, v_before,
    jsonb_build_object('status','inactive'), _reason);
END $$;

-- =====================================================================
-- 5. CUSTOM ROLES / ROLE PERMISSIONS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_custom_role(
  _name text, _description text DEFAULT NULL, _permissions text[] DEFAULT '{}', _reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid; c text;
BEGIN
  PERFORM public.require_permission('role.manage');
  IF _name IS NULL OR length(trim(_name))=0 THEN RAISE EXCEPTION 'Role name is required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.custom_roles(name, description, is_active, created_by)
    VALUES (trim(_name), NULLIF(trim(_description),''), true, auth.uid())
    RETURNING id INTO v_id;
  FOREACH c IN ARRAY COALESCE(_permissions,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code=c) THEN
      RAISE EXCEPTION 'Unknown permission %', c USING ERRCODE='22023';
    END IF;
    INSERT INTO public.custom_role_permissions(custom_role_id, permission_code)
      VALUES (v_id, c) ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM public.record_privileged_audit(
    'create_custom_role','custom_roles', v_id, NULL,
    jsonb_build_object('name',_name,'permissions',_permissions), _reason);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_update_custom_role(
  _id uuid, _patch jsonb, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb;
BEGIN
  PERFORM public.require_permission('role.manage');
  SELECT to_jsonb(cr) INTO v_before FROM public.custom_roles cr WHERE id=_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Custom role not found' USING ERRCODE='22023'; END IF;
  UPDATE public.custom_roles SET
    name        = COALESCE(NULLIF(_patch->>'name',''), name),
    description = COALESCE(_patch->>'description', description),
    is_active   = COALESCE((_patch->>'is_active')::boolean, is_active),
    updated_at  = now()
  WHERE id=_id;
  PERFORM public.record_privileged_audit(
    'update_custom_role','custom_roles', _id, v_before, _patch, _reason);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_delete_custom_role(_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb;
BEGIN
  PERFORM public.require_permission('role.manage');
  SELECT to_jsonb(cr) INTO v_before FROM public.custom_roles cr WHERE id=_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Custom role not found' USING ERRCODE='22023'; END IF;
  DELETE FROM public.custom_role_permissions WHERE custom_role_id=_id;
  DELETE FROM public.user_custom_roles WHERE custom_role_id=_id;
  DELETE FROM public.custom_roles WHERE id=_id;
  PERFORM public.record_privileged_audit(
    'delete_custom_role','custom_roles', _id, v_before, NULL, _reason);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_set_role_permissions(
  _role app_role, _permissions text[], _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb; c text;
BEGIN
  PERFORM public.require_permission('role.manage');
  SELECT jsonb_agg(permission_code) INTO v_before FROM public.role_permissions WHERE role=_role;
  DELETE FROM public.role_permissions WHERE role=_role;
  FOREACH c IN ARRAY COALESCE(_permissions,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code=c) THEN
      RAISE EXCEPTION 'Unknown permission %', c USING ERRCODE='22023';
    END IF;
    INSERT INTO public.role_permissions(role, permission_code) VALUES (_role, c);
  END LOOP;
  PERFORM public.record_privileged_audit(
    'set_role_permissions','role_permissions', NULL, v_before,
    to_jsonb(_permissions) || jsonb_build_object('role', _role), _reason);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_set_custom_role_permissions(
  _custom_role_id uuid, _permissions text[], _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb; c text;
BEGIN
  PERFORM public.require_permission('role.manage');
  IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE id=_custom_role_id) THEN
    RAISE EXCEPTION 'Custom role not found' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_agg(permission_code) INTO v_before FROM public.custom_role_permissions WHERE custom_role_id=_custom_role_id;
  DELETE FROM public.custom_role_permissions WHERE custom_role_id=_custom_role_id;
  FOREACH c IN ARRAY COALESCE(_permissions,'{}') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code=c) THEN
      RAISE EXCEPTION 'Unknown permission %', c USING ERRCODE='22023';
    END IF;
    INSERT INTO public.custom_role_permissions(custom_role_id, permission_code)
      VALUES (_custom_role_id, c);
  END LOOP;
  PERFORM public.record_privileged_audit(
    'set_custom_role_permissions','custom_role_permissions', _custom_role_id, v_before,
    to_jsonb(_permissions), _reason);
END $$;

-- =====================================================================
-- 6. BACKUPS / AUDIT ARCHIVE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_trigger_backup(
  _kind text, _notes text DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.require_permission('backup.trigger');
  IF _kind NOT IN ('manual','scheduled','pre_restore','test') THEN
    RAISE EXCEPTION 'Invalid backup kind' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.backups(triggered_by, kind, status, notes, meta)
    VALUES (auth.uid(), _kind, 'queued', _notes, '{}'::jsonb)
    RETURNING id INTO v_id;
  PERFORM public.record_privileged_audit(
    'trigger_backup','backups', v_id, NULL,
    jsonb_build_object('kind',_kind,'notes',_notes), _reason);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_record_backup_restore(
  _backup_id uuid, _status text, _notes text DEFAULT NULL, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_before jsonb;
BEGIN
  PERFORM public.require_permission('backup.restore');
  IF _status NOT IN ('success','failed','partial') THEN
    RAISE EXCEPTION 'Invalid restore status' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(b) INTO v_before FROM public.backups b WHERE id=_backup_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Backup not found' USING ERRCODE='22023'; END IF;
  UPDATE public.backups
     SET meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object(
                  'last_restore_at', now(),
                  'last_restore_by', auth.uid(),
                  'last_restore_status', _status,
                  'last_restore_notes', _notes)
   WHERE id = _backup_id;
  PERFORM public.record_privileged_audit(
    'record_backup_restore','backups', _backup_id, v_before,
    jsonb_build_object('status',_status,'notes',_notes), _reason);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_archive_audit_log(_retain_days int DEFAULT 365, _reason text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_moved int;
BEGIN
  PERFORM public.require_permission('audit.view');
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'super_admin only' USING ERRCODE='42501';
  END IF;
  v_moved := public.archive_audit_log(_retain_days);
  PERFORM public.record_privileged_audit(
    'archive_audit_log','audit_log', NULL, NULL,
    jsonb_build_object('retain_days',_retain_days,'moved_rows',v_moved), _reason);
  RETURN v_moved;
END $$;

-- =====================================================================
-- GRANTS on new RPCs
-- =====================================================================
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        'rpc_assign_user_role','rpc_remove_user_role','rpc_suspend_user',
        'rpc_reactivate_user','rpc_assign_user_branch','rpc_publish_loan_policy',
        'rpc_update_system_setting','rpc_create_branch','rpc_update_branch',
        'rpc_disable_branch','rpc_create_custom_role','rpc_update_custom_role',
        'rpc_delete_custom_role','rpc_set_role_permissions',
        'rpc_set_custom_role_permissions','rpc_trigger_backup',
        'rpc_record_backup_restore','rpc_archive_audit_log'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- =====================================================================
-- LOCK DIRECT WRITES on the 9 privileged tables (authenticated role)
-- service_role keeps ALL; SELECT is preserved for reads.
-- =====================================================================
REVOKE INSERT, UPDATE, DELETE ON public.user_roles              FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.loan_policies           FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions        FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.custom_roles            FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.custom_role_permissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_custom_roles       FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.branches                FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.system_settings         FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.backups                 FROM authenticated;
