
-- 1. Trigger to auto-create profile on new auth user (including Google sign-ins)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill profiles for existing users that don't have one
INSERT INTO public.profiles (user_id, nome, sport_profile)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  COALESCE((u.raw_user_meta_data->>'sport_profile')::public.sport_profile, 'futebol'::public.sport_profile)
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL;

-- 3. updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_saved_dashboards_updated_at ON public.saved_dashboards;
CREATE TRIGGER update_saved_dashboards_updated_at
  BEFORE UPDATE ON public.saved_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Helpful indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_sport ON public.favorites(user_id, esporte);
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique ON public.favorites(user_id, tipo, referencia_id, esporte);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_session ON public.chat_history(user_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_saved_dashboards_user ON public.saved_dashboards(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique ON public.user_roles(user_id, role);
