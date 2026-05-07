
-- 1) profiles: adicionar SELECT (próprio + público leitura básica) e INSERT
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 2) favorites: CRUD do próprio usuário
CREATE POLICY "Users can view their own favorites"
  ON public.favorites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites"
  ON public.favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own favorites"
  ON public.favorites FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites"
  ON public.favorites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3) chat_history: CRUD do próprio usuário
CREATE POLICY "Users can view their own chat history"
  ON public.chat_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat history"
  ON public.chat_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat history"
  ON public.chat_history FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 4) saved_dashboards: completar INSERT/UPDATE/DELETE
CREATE POLICY "Users can insert their own dashboards"
  ON public.saved_dashboards FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dashboards"
  ON public.saved_dashboards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dashboards"
  ON public.saved_dashboards FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 5) user_roles: SELECT do próprio usuário (admin gerencia via service role)
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 6) Função has_role (para checagens futuras sem recursão)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 7) cache_sports_data: somente service role acessa (sem policies → bloqueado para usuários,
-- e edge functions usam SERVICE_ROLE_KEY que bypassa RLS). Garantimos com REVOKE explícito.
REVOKE ALL ON public.cache_sports_data FROM anon, authenticated;

-- 8) Trigger para criar profile automaticamente em novos signups (caso ainda não exista)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9) Trigger updated_at em profiles e saved_dashboards
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_saved_dashboards_updated_at ON public.saved_dashboards;
CREATE TRIGGER update_saved_dashboards_updated_at
  BEFORE UPDATE ON public.saved_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
