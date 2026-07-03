
-- Drop both existing triggers, keep only one canonical trigger.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;

-- Idempotent version: safe against double-fire, missing metadata, and reruns.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id,
          COALESCE(NEW.raw_user_meta_data->>'full_name',
                   NEW.raw_user_meta_data->>'name', ''),
          NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (NEW.id, 'system', 'Welcome to WASSHA SACCOS',
            'Your member account is ready. An admin will assign your member number shortly.');
  EXCEPTION WHEN OTHERS THEN
    -- Never break signup because a welcome notification failed.
    NULL;
  END;

  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
