
-- 1. Enum for digest mode
DO $$ BEGIN
  CREATE TYPE public.notif_digest_mode AS ENUM ('instant','hourly','daily');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notif_priority AS ENUM ('low','normal','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend notification_preferences
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_start time NOT NULL DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end   time NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  ADD COLUMN IF NOT EXISTS digest_mode public.notif_digest_mode NOT NULL DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS mute_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_digest_at timestamptz;

-- 3. Extend notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS deferred_until timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at   timestamptz,
  ADD COLUMN IF NOT EXISTS priority public.notif_priority NOT NULL DEFAULT 'normal';

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, read, created_at DESC)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_deferred
  ON public.notifications (deferred_until)
  WHERE deferred_until IS NOT NULL AND delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_cleanup
  ON public.notifications (read, created_at);

-- 5. Auto-provision preferences row for new profiles
CREATE OR REPLACE FUNCTION public.ensure_notification_prefs()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
    VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_notification_prefs ON public.profiles;
CREATE TRIGGER trg_ensure_notification_prefs
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_notification_prefs();

-- Backfill for existing profiles
INSERT INTO public.notification_preferences (user_id)
SELECT p.user_id FROM public.profiles p
LEFT JOIN public.notification_preferences np ON np.user_id = p.user_id
WHERE np.user_id IS NULL;

-- 6. Helper: is user in quiet hours right now?
CREATE OR REPLACE FUNCTION public.in_quiet_hours(_prefs public.notification_preferences)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE local_t time; qs time; qe time;
BEGIN
  IF _prefs.user_id IS NULL THEN RETURN false; END IF;
  local_t := (now() AT TIME ZONE COALESCE(_prefs.timezone,'UTC'))::time;
  qs := _prefs.quiet_hours_start;
  qe := _prefs.quiet_hours_end;
  IF qs = qe THEN RETURN false; END IF;
  IF qs < qe THEN
    RETURN local_t >= qs AND local_t < qe;
  ELSE
    -- wraps midnight
    RETURN local_t >= qs OR local_t < qe;
  END IF;
END $$;

-- 7. Rewrite dedupe trigger to enforce mute + quiet hours + digest
CREATE OR REPLACE FUNCTION public.dedupe_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.notification_preferences;
  recent_count int;
  local_t time; qend time; defer timestamptz;
BEGIN
  -- Dedupe: same user/type/link/title within 5 minutes
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = NEW.user_id
       AND type = NEW.type
       AND COALESCE(link,'') = COALESCE(NEW.link,'')
       AND title = NEW.title
       AND created_at > now() - interval '5 minutes'
  ) THEN
    RETURN NULL;
  END IF;

  -- Storm guard: max 30/10min
  SELECT count(*) INTO recent_count
    FROM public.notifications
    WHERE user_id = NEW.user_id AND created_at > now() - interval '10 minutes';
  IF recent_count >= 30 THEN
    RETURN NULL;
  END IF;

  -- Load prefs (may not exist for legacy users)
  SELECT * INTO p FROM public.notification_preferences WHERE user_id = NEW.user_id;

  -- Mute list: drop unless critical
  IF p.user_id IS NOT NULL
     AND NEW.priority <> 'critical'
     AND NEW.type::text = ANY(p.mute_types) THEN
    RETURN NULL;
  END IF;

  -- Critical always delivers immediately
  IF NEW.priority = 'critical' THEN
    RETURN NEW;
  END IF;

  -- Digest windows defer non-high-priority
  IF p.user_id IS NOT NULL AND NEW.priority IN ('low','normal') THEN
    IF p.digest_mode = 'hourly' THEN
      NEW.deferred_until := date_trunc('hour', now()) + interval '1 hour';
    ELSIF p.digest_mode = 'daily' THEN
      -- next 08:00 in user's timezone
      NEW.deferred_until := (date_trunc('day', (now() AT TIME ZONE COALESCE(p.timezone,'UTC'))) + interval '1 day 8 hour')
                            AT TIME ZONE COALESCE(p.timezone,'UTC');
    END IF;
  END IF;

  -- Quiet hours defer everything except high/critical
  IF p.user_id IS NOT NULL AND NEW.priority IN ('low','normal')
     AND public.in_quiet_hours(p) THEN
    local_t := (now() AT TIME ZONE COALESCE(p.timezone,'UTC'))::time;
    qend := p.quiet_hours_end;
    IF qend > local_t THEN
      defer := (date_trunc('day', (now() AT TIME ZONE COALESCE(p.timezone,'UTC'))) + qend)
               AT TIME ZONE COALESCE(p.timezone,'UTC');
    ELSE
      defer := (date_trunc('day', (now() AT TIME ZONE COALESCE(p.timezone,'UTC'))) + interval '1 day' + qend)
               AT TIME ZONE COALESCE(p.timezone,'UTC');
    END IF;
    IF NEW.deferred_until IS NULL OR defer > NEW.deferred_until THEN
      NEW.deferred_until := defer;
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- 8. Client-facing filter: mark instantly-delivered rows as delivered_at=now() when not deferred
CREATE OR REPLACE FUNCTION public.stamp_notification_delivered()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.deferred_until IS NULL AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_notification_delivered ON public.notifications;
CREATE TRIGGER trg_stamp_notification_delivered
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.stamp_notification_delivered();
