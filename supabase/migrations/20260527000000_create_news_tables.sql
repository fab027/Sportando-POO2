CREATE TABLE IF NOT EXISTS public.news_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('rss', 'site', 'api', 'social')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  url TEXT NOT NULL UNIQUE,
  image_url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  sport TEXT,
  teams TEXT[] NOT NULL DEFAULT '{}',
  athletes TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_published_at_idx ON public.news (published_at DESC);
CREATE INDEX IF NOT EXISTS news_source_idx ON public.news (source);
CREATE INDEX IF NOT EXISTS news_sources_active_idx ON public.news_sources (active);

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read news" ON public.news;
CREATE POLICY "Anyone can read news"
  ON public.news FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can read public and own news sources" ON public.news_sources;
CREATE POLICY "Users can read public and own news sources"
  ON public.news_sources FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own news sources" ON public.news_sources;
CREATE POLICY "Users can insert own news sources"
  ON public.news_sources FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own news sources" ON public.news_sources;
CREATE POLICY "Users can update own news sources"
  ON public.news_sources FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own news sources" ON public.news_sources;
CREATE POLICY "Users can delete own news sources"
  ON public.news_sources FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_news_sources_updated_at ON public.news_sources;
CREATE TRIGGER update_news_sources_updated_at
  BEFORE UPDATE ON public.news_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.news_sources (name, url, type, active)
VALUES
  ('ge / Globo Esporte', 'ge.globo.com', 'site', true),
  ('Lance!', 'lance.com.br', 'site', true),
  ('ESPN Brasil', 'espn.com.br', 'site', true)
ON CONFLICT (url) DO UPDATE
SET name = EXCLUDED.name,
    type = EXCLUDED.type,
    active = EXCLUDED.active;

