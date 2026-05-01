-- ============ 1. ENUM de papéis ============
CREATE TYPE public.app_role AS ENUM ('analista', 'apostador', 'administrador');

-- ============ 2. Tabela user_roles ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função SECURITY DEFINER para evitar recursão em policies
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

-- ============ 3. Favoritos ============
CREATE TYPE public.favorite_type AS ENUM ('atleta', 'equipe');
CREATE TYPE public.sport_kind AS ENUM ('football', 'basketball');

CREATE TABLE public.favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo public.favorite_type NOT NULL,
  referencia_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  esporte public.sport_kind NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, tipo, referencia_id)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_favorites_user ON public.favorites(user_id);

CREATE POLICY "Users can view their own favorites"
  ON public.favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own favorites"
  ON public.favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own favorites"
  ON public.favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============ 4. Dashboards salvos ============
CREATE TABLE public.saved_dashboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  dashboard_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_dashboards ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_saved_dashboards_user ON public.saved_dashboards(user_id);

CREATE POLICY "Users can view their own dashboards"
  ON public.saved_dashboards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dashboards"
  ON public.saved_dashboards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dashboards"
  ON public.saved_dashboards FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dashboards"
  ON public.saved_dashboards FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_saved_dashboards_updated_at
  BEFORE UPDATE ON public.saved_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 5. Histórico de chat ============
CREATE TYPE public.chat_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE public.chat_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  role public.chat_role NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_chat_history_user_session ON public.chat_history(user_id, session_id, created_at);

CREATE POLICY "Users can view their own chat history"
  ON public.chat_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat history"
  ON public.chat_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat history"
  ON public.chat_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============ 6. Cache de dados esportivos ============
CREATE TABLE public.cache_sports_data (
  cache_key TEXT NOT NULL PRIMARY KEY,
  payload JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cache_sports_data ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cache_sports_expires ON public.cache_sports_data(expires_at);

-- Leitura pública (dados esportivos não são sensíveis)
CREATE POLICY "Anyone can read cache"
  ON public.cache_sports_data FOR SELECT
  TO anon, authenticated
  USING (expires_at > now());

-- Sem policies de INSERT/UPDATE/DELETE: somente service_role (edge functions) escreve

-- ============ 7. Hardening em profiles ============
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);