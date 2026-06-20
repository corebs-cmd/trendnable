-- Migration 041: auto-create public.users row on auth signup
--
-- A SECURITY DEFINER trigger on auth.users ensures a profile row always
-- exists the instant Supabase creates the auth record — before the client
-- session is established, so no RLS race condition is possible.
--
-- ON CONFLICT (id) DO NOTHING makes this safe to run even if the row
-- already exists (e.g. re-running on existing users).

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    name,
    is_premium,
    followed_fandoms,
    followed_categories,
    notification_digest_enabled,
    notification_digest_time
  ) VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    false,
    '{}'::text[],
    '{}'::text[],
    true,
    '08:00'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
