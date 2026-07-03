
-- ============================================================
-- SUPER ADMIN FOUNDATION
-- ============================================================

-- ---------- 1. permissions catalog ----------
CREATE TABLE public.permissions (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.permissions (code, category, description) VALUES
  ('loan.read','loan','View loans'),
  ('loan.create','loan','Create loans'),
  ('loan.update','loan','Update loans'),
  ('loan.approve','loan','Approve loans'),
  ('loan.reject','loan','Reject loans'),
  ('loan.disburse','loan','Disburse loans'),
  ('member.read','member','View members'),
  ('member.update','member','Edit members'),
  ('user.read','user','View users'),
  ('user.create','user','Create users'),
  ('user.update','user','Edit users'),
  ('user.delete','user','Soft delete users'),
  ('user.suspend','user','Suspend/reactivate users'),
  ('user.reset_password','user','Reset user password'),
  ('user.unlock','user','Unlock user account'),
  ('user.assign_role','user','Change user roles'),
  ('user.assign_branch','user','Assign users to branches'),
  ('role.manage','role','Create/edit/delete custom roles'),
  ('branch.read','branch','View branches'),
  ('branch.manage','branch','Manage branches'),
  ('policy.manage','policy','Manage loan policies'),
  ('settings.read','settings','View system settings'),
  ('settings.update','settings','Update system settings'),
  ('audit.view','audit','View audit log'),
  ('security.view','security','View security center'),
  ('security.act','security','Force logout / terminate sessions'),
  ('backup.trigger','backup','Trigger backups'),
  ('backup.restore','backup','Restore backups'),
  ('backup.view','backup','View backup history'),
  ('monitoring.view','monitoring','View system monitoring'),
  ('statement.export','statement','Export statements'),
  ('reports.view','reports','View reports'),
  ('ai.configure','ai','Configure AI settings'),
  ('notifications.templates','notifications','Manage notification templates');

-- ---------- 2. role_permissions (built-in roles) ----------
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission_code TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, permission_code)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage role_permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Seed built-in role → permission mapping (inheritance encoded)
INSERT INTO public.role_permissions (role, permission_code)
SELECT r.role::app_role, p.code
FROM (VALUES
  ('member', ARRAY['loan.read','member.read']),
  ('approver', ARRAY['loan.read','loan.approve','loan.reject','member.read']),
  ('finance', ARRAY['loan.read','loan.approve','loan.reject','member.read','statement.export','reports.view']),
  ('manager', ARRAY['loan.read','loan.approve','loan.reject','loan.disburse','loan.update',
                    'member.read','member.update','user.read','statement.export','reports.view','branch.read']),
  ('admin', ARRAY['loan.read','loan.create','loan.update','loan.approve','loan.reject','loan.disburse',
                  'member.read','member.update','user.read','user.create','user.update','user.suspend',
                  'user.reset_password','user.unlock','user.assign_role','user.assign_branch',
                  'branch.read','branch.manage','policy.manage','settings.read','audit.view',
                  'reports.view','statement.export','notifications.templates']),
  ('super_admin', ARRAY(SELECT code FROM public.permissions))
) AS r(role, codes)
CROSS JOIN LATERAL unnest(r.codes) AS p(code);

-- ---------- 3. custom roles ----------
CREATE TABLE public.custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read custom_roles" ON public.custom_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage custom_roles" ON public.custom_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.custom_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_role_id UUID NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (custom_role_id, permission_code)
);
GRANT SELECT ON public.custom_role_permissions TO authenticated;
GRANT ALL ON public.custom_role_permissions TO service_role;
ALTER TABLE public.custom_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read custom_role_permissions" ON public.custom_role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage custom_role_permissions" ON public.custom_role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.user_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_role_id UUID NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, custom_role_id)
);
GRANT SELECT ON public.user_custom_roles TO authenticated;
GRANT ALL ON public.user_custom_roles TO service_role;
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own custom_roles" ON public.user_custom_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "super_admin manage user_custom_roles" ON public.user_custom_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- 4. branches ----------
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  manager_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read branches" ON public.branches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage branches" ON public.branches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ---------- 5. user_sessions ----------
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  ip INET,
  user_agent TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  location TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.user_sessions (user_id, last_seen DESC);
GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "users insert own sessions" ON public.user_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own sessions" ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- ---------- 6. auth_events ----------
CREATE TABLE public.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN
    ('login','logout','failed_login','password_change','password_reset',
     'account_locked','account_unlocked','mfa_enrolled','mfa_challenge','email_verified')),
  ip INET,
  user_agent TEXT,
  session_id TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.auth_events (user_id, created_at DESC);
CREATE INDEX ON public.auth_events (event_type, created_at DESC);
GRANT SELECT, INSERT ON public.auth_events TO authenticated;
GRANT ALL ON public.auth_events TO service_role;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own auth_events" ON public.auth_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "auth insert own auth_events" ON public.auth_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ---------- 7. system_settings (versioned) ----------
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX system_settings_current_key ON public.system_settings(key) WHERE is_current;
CREATE INDEX ON public.system_settings (key, version DESC);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read system_settings" ON public.system_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage system_settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- 8. backups ----------
CREATE TABLE public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID REFERENCES auth.users(id),
  kind TEXT NOT NULL DEFAULT 'metadata' CHECK (kind IN ('metadata','full','restore')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  notes TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin manage backups" ON public.backups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- 9. deletion_log ----------
CREATE TABLE public.deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,
  entity_id UUID NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  reason TEXT,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deletion_log TO authenticated;
GRANT ALL ON public.deletion_log TO service_role;
ALTER TABLE public.deletion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin read deletion_log" ON public.deletion_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- ---------- 10. audit_log — additive columns + immutability ----------
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS ip INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS prev_value JSONB,
  ADD COLUMN IF NOT EXISTS new_value JSONB;

-- Enforce append-only: revoke UPDATE/DELETE, add hard-stop trigger for defense in depth.
REVOKE UPDATE, DELETE ON public.audit_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% on audit_log is not permitted (immutable ledger)', TG_OP
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- Expand audit_log read policy: keep existing (super_admin already covered via has_role admin fallback);
-- add explicit permission-based read.
DROP POLICY IF EXISTS "audit.view permission read" ON public.audit_log;
CREATE POLICY "audit.view permission read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- ---------- 11. helper functions ----------
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _code TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- super_admin has everything
    public.is_super_admin(_user_id)
    -- built-in role permission
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission_code = _code
    )
    -- custom role permission (active only)
    OR EXISTS (
      SELECT 1
      FROM public.user_custom_roles ucr
      JOIN public.custom_roles cr ON cr.id = ucr.custom_role_id AND cr.is_active
      JOIN public.custom_role_permissions crp ON crp.custom_role_id = cr.id
      WHERE ucr.user_id = _user_id AND crp.permission_code = _code
    )
$$;

-- ---------- 12. updated_at triggers on new tables ----------
CREATE TRIGGER trg_custom_roles_updated
  BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_branches_updated
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
