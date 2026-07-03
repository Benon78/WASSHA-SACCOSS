
-- =====================================================================
-- Phase 2: Suspended enforcement + login protection + MFA gate helpers
-- =====================================================================

-- Suspended / deleted status helpers -----------------------------------
CREATE OR REPLACE FUNCTION public.is_account_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT suspended_at IS NULL AND deleted_at IS NULL
     FROM public.profiles WHERE user_id = _user_id),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.is_account_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO authenticated, service_role;

-- BEFORE INSERT/UPDATE guard: blocks writes from suspended/deleted user.
CREATE OR REPLACE FUNCTION public.block_inactive_account_writes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_status record;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;                   -- system/service_role
  IF public.is_super_admin(v_uid) THEN RETURN NEW; END IF;    -- rescue path
  SELECT suspended_at, deleted_at, COALESCE(suspended_reason,'account suspended') AS reason
    INTO v_status FROM public.profiles WHERE user_id = v_uid;
  IF v_status.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'account_deleted' USING ERRCODE='42501',
      DETAIL='Your account has been removed. Contact an administrator.';
  END IF;
  IF v_status.suspended_at IS NOT NULL THEN
    RAISE EXCEPTION 'account_suspended' USING ERRCODE='42501',
      DETAIL=format('Your account is suspended: %s', v_status.reason);
  END IF;
  RETURN NEW;
END $$;

-- Attach to write paths members hit directly.
DROP TRIGGER IF EXISTS trg_block_inactive_loans        ON public.loans;
DROP TRIGGER IF EXISTS trg_block_inactive_tx           ON public.transactions;
DROP TRIGGER IF EXISTS trg_block_inactive_loandocs     ON public.loan_documents;
DROP TRIGGER IF EXISTS trg_block_inactive_ai           ON public.ai_messages;
DROP TRIGGER IF EXISTS trg_block_inactive_profiles     ON public.profiles;

CREATE TRIGGER trg_block_inactive_loans
  BEFORE INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_account_writes();

CREATE TRIGGER trg_block_inactive_tx
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_account_writes();

CREATE TRIGGER trg_block_inactive_loandocs
  BEFORE INSERT OR UPDATE ON public.loan_documents
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_account_writes();

CREATE TRIGGER trg_block_inactive_ai
  BEFORE INSERT ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_account_writes();

-- Profiles: only block self-updates from a suspended user; admins still ok.
CREATE OR REPLACE FUNCTION public.block_inactive_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR v_uid <> NEW.user_id THEN RETURN NEW; END IF;
  IF public.is_super_admin(v_uid) THEN RETURN NEW; END IF;
  IF NOT public.is_account_active(v_uid) THEN
    RAISE EXCEPTION 'account_inactive' USING ERRCODE='42501',
      DETAIL='Suspended or deleted accounts cannot modify their profile.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_block_inactive_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_profile_self_update();

-- =====================================================================
-- Login protection: sliding-window lockout table + helpers
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.auth_lockouts (
  email text PRIMARY KEY,
  fail_count int NOT NULL DEFAULT 0,
  first_failure_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.auth_lockouts TO authenticated;
GRANT ALL ON public.auth_lockouts TO service_role;
ALTER TABLE public.auth_lockouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lockouts super admin read" ON public.auth_lockouts;
CREATE POLICY "lockouts super admin read" ON public.auth_lockouts
  FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.record_failed_login(_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_row public.auth_lockouts; v_window interval := interval '15 minutes';
        v_threshold int := 5; v_lock_duration interval := interval '15 minutes';
BEGIN
  IF _email IS NULL OR length(trim(_email))=0 THEN
    RETURN jsonb_build_object('locked', false);
  END IF;
  _email := lower(trim(_email));
  INSERT INTO public.auth_lockouts(email, fail_count, first_failure_at)
    VALUES (_email, 1, now())
    ON CONFLICT (email) DO UPDATE
      SET fail_count = CASE
            WHEN public.auth_lockouts.first_failure_at < now() - v_window
              THEN 1
            ELSE public.auth_lockouts.fail_count + 1 END,
          first_failure_at = CASE
            WHEN public.auth_lockouts.first_failure_at < now() - v_window
              THEN now()
            ELSE public.auth_lockouts.first_failure_at END,
          updated_at = now()
    RETURNING * INTO v_row;
  IF v_row.fail_count >= v_threshold
     AND (v_row.locked_until IS NULL OR v_row.locked_until < now()) THEN
    UPDATE public.auth_lockouts
       SET locked_until = now() + v_lock_duration, updated_at = now()
     WHERE email = _email
     RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object(
    'locked', v_row.locked_until IS NOT NULL AND v_row.locked_until > now(),
    'locked_until', v_row.locked_until,
    'fail_count', v_row.fail_count
  );
END $$;
REVOKE ALL ON FUNCTION public.record_failed_login(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_email_locked(_email text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'locked', COALESCE(locked_until > now(), false),
    'locked_until', locked_until
  ) FROM public.auth_lockouts WHERE email = lower(trim(_email))
$$;
REVOKE ALL ON FUNCTION public.is_email_locked(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_email_locked(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clear_login_lockout(_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.auth_lockouts WHERE email = lower(trim(_email));
END $$;
REVOKE ALL ON FUNCTION public.clear_login_lockout(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_login_lockout(text) TO authenticated, service_role;

-- =====================================================================
-- MFA enforcement helper: returns whether the caller needs an MFA gate.
-- Uses the JWT AAL claim (aal2 = second factor completed).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.mfa_gate_for_current_user()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_aal text;
  v_required boolean;
  v_verified boolean;
  v_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('required', false, 'verified', false, 'privileged', false);
  END IF;
  v_privileged := public.is_super_admin(v_uid) OR public.has_role(v_uid, 'admin');
  BEGIN v_aal := current_setting('request.jwt.claims', true)::jsonb ->> 'aal'; EXCEPTION WHEN OTHERS THEN v_aal := NULL; END;
  v_verified := v_aal = 'aal2';
  v_required := v_privileged;
  RETURN jsonb_build_object(
    'required', v_required,
    'verified', v_verified,
    'privileged', v_privileged,
    'aal', v_aal
  );
END $$;
REVOKE ALL ON FUNCTION public.mfa_gate_for_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_gate_for_current_user() TO authenticated, service_role;
