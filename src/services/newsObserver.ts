import { supabase } from "@/integrations/supabase/client";

export type NewsItem = {
  id?: string;
  title: string;
  description?: string;
  source: string;
  sourceUrl?: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  sport?: string;
  teams?: string[];
  athletes?: string[];
  tags?: string[];
};

export type NewsSource = {
  id?: string;
  name: string;
  url: string;
  type: "rss" | "site" | "api" | "social";
  active: boolean;
};

export type NewsObserverOptions = {
  sources: NewsSource[];
  terms?: string[];
  sport?: string;
};

type RawNewsItem = Partial<NewsItem> & {
  link?: string;
  published_at?: string;
  source_url?: string;
  image_url?: string;
};

const NEWS_SOURCES_KEY = "sportando.newsSources.v2";

const htmlEntities: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  hellip: "...",
  ndash: "-",
  mdash: "-",
};

export const defaultNewsSources: NewsSource[] = [
  { id: "ge", name: "ge / Globo Esporte", url: "ge.globo.com", type: "site", active: true },
  { id: "lance", name: "Lance!", url: "lance.com.br", type: "site", active: true },
  { id: "espn", name: "ESPN Brasil", url: "espn.com.br", type: "site", active: true },
];

export const cleanNewsText = (text = "") =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const key = entity.toLowerCase();
      if (key.startsWith("#x")) return String.fromCharCode(Number.parseInt(key.slice(2), 16));
      if (key.startsWith("#")) return String.fromCharCode(Number.parseInt(key.slice(1), 10));
      return htmlEntities[key] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();

const normalizeDate = (value?: string | null) => {
  if (!value) return new Date(0).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripSourceSuffix = (title: string, source: string) => {
  const cleanSource = cleanNewsText(source);
  if (!cleanSource) return title;
  return title.replace(new RegExp(`\\s[-–—]\\s${escapeRegExp(cleanSource)}$`, "i"), "").trim();
};

const normalizeUrl = (value?: string | null) => {
  const url = cleanNewsText(value || "");
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
};

const normalizeDomain = (value: string) =>
  cleanNewsText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim();

const tagValue = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return cleanNewsText(match?.[1] || "");
};

const attrValue = (xml: string, tag: string, attr: string) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i"));
  return cleanNewsText(match?.[1] || "");
};

const imageFromXml = (xml: string) =>
  attrValue(xml, "media:content", "url") ||
  attrValue(xml, "media:thumbnail", "url") ||
  attrValue(xml, "enclosure", "url") ||
  "";

const attrFromTag = (tag: string, attr: string) => {
  const match = tag.match(new RegExp(`\\s${attr}=["']([^"']+)["']`, "i"));
  return cleanNewsText(match?.[1] || "");
};

const absoluteUrl = (value: string, base: string) => {
  try {
    return new URL(cleanNewsText(value), normalizeUrl(base)).toString();
  } catch {
    return normalizeUrl(value);
  }
};

const parseBrazilDateTime = (value?: string | null) => {
  const match = cleanNewsText(value || "").match(/(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2}):(\d{2})/);
  if (!match) return "";
  const [, day, month, year, hour, minute] = match;
  return normalizeDate(`${year}-${month}-${day}T${hour}:${minute}:00-03:00`);
};

const parseRelativePublishedAt = (value?: string | null) => {
  const text = cleanNewsText(value || "").toLowerCase();
  const now = Date.now();
  if (!text) return "";
  if (text === "agora" || text.includes("neste momento")) return new Date(now).toISOString();

  const compact = text.match(/^(\d+)\s*([mhd])$/i);
  if (compact) {
    const amount = Number(compact[1]);
    const unit = compact[2].toLowerCase();
    const ms = unit === "m" ? amount * 60_000 : unit === "h" ? amount * 60 * 60_000 : amount * 24 * 60 * 60_000;
    return new Date(now - ms).toISOString();
  }

  const verbose = text.match(/(?:ha|há)\s+(\d+)\s+(minuto|minutos|hora|horas|dia|dias)/i);
  if (!verbose) return "";
  const amount = Number(verbose[1]);
  const unit = verbose[2];
  const ms = unit.startsWith("minuto")
    ? amount * 60_000
    : unit.startsWith("hora")
      ? amount * 60 * 60_000
      : amount * 24 * 60 * 60_000;
  return new Date(now - ms).toISOString();
};

const parseDateFromUrl = (url: string) => {
  const match = url.match(/\/(?:noticia\/)?(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!match) return "";
  return normalizeDate(`${match[1]}-${match[2]}-${match[3]}T12:00:00-03:00`);
};

const nearbyImageUrl = (html: string, baseUrl: string) => {
  const srcSet = html.match(/\ssrcSet=["']([^"']+)["']/i)?.[1];
  if (srcSet) return absoluteUrl(srcSet.split(/\s+/)[0], baseUrl);
  const dataDefault = html.match(/\sdata-default-src=["']([^"']+)["']/i)?.[1];
  if (dataDefault) return absoluteUrl(dataDefault, baseUrl);
  const src = html.match(/\ssrc=["']([^"']+)["']/i)?.[1];
  return src ? absoluteUrl(src, baseUrl) : "";
};

const isProbablyNewsUrl = (url: string) =>
  !/\/(jogo|tempo-real|resultados|placar|tabela|agenda|video\/clip)\b/i.test(url);

const directNewsItem = (
  source: NewsSource,
  sport: string,
  item: { title: string; url: string; description?: string; imageUrl?: string; publishedAt?: string }
) =>
  normalizeNewsItem(
    {
      id: item.url,
      title: item.title,
      description: item.description || "",
      source: source.name,
      sourceUrl: source.url,
      url: item.url,
      imageUrl: item.imageUrl || "",
      publishedAt: item.publishedAt || parseDateFromUrl(item.url) || "",
      sport,
      tags: [sport],
    },
    source
  );

const getKnownSourceFetchUrl = (source: NewsSource, sport: string, dev = false) => {
  const domain = normalizeDomain(source.url);
  const isBasketball = sport === "basketball";

  if (domain.endsWith("lance.com.br")) return dev ? "/news-lance/" : "https://www.lance.com.br/";
  if (domain.endsWith("ge.globo.com")) return dev ? `/news-ge/${isBasketball ? "basquete" : "futebol"}/` : `https://ge.globo.com/${isBasketball ? "basquete" : "futebol"}/`;
  if (domain.endsWith("espn.com.br")) return dev ? `/news-espn/${isBasketball ? "nba" : "futebol"}/` : `https://www.espn.com.br/${isBasketball ? "nba" : "futebol"}/`;

  return "";
};

const parseGeLatest = (html: string, source: NewsSource, sport: string, baseUrl: string) => {
  const items: NewsItem[] = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*feed-post-link[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) && items.length < 32) {
    const url = absoluteUrl(match[1], baseUrl);
    const title = cleanNewsText(match[2]);
    if (!title || !isProbablyNewsUrl(url)) continue;

    const segment = html.slice(match.index, match.index + 2600);
    const description = cleanNewsText(segment.match(/feed-post-body-resumo[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "");
    const timeText = cleanNewsText(segment.match(/feed-post-datetime[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
    const publishedAt = parseRelativePublishedAt(timeText) || parseDateFromUrl(url);
    const imageUrl = nearbyImageUrl(segment, baseUrl);
    const item = directNewsItem(source, sport, { title, url, description, imageUrl, publishedAt });
    if (item) items.push(item);
  }

  return items;
};

const parseLanceLatest = (html: string, source: NewsSource, sport: string, baseUrl: string) => {
  const items: NewsItem[] = [];
  const anchorPattern = /<a\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) && items.length < 48) {
    const tag = match[0];
    const href = attrFromTag(tag, "href");
    const title = attrFromTag(tag, "aria-label") || attrFromTag(tag, "data-ga4-param-title") || attrFromTag(tag, "title");
    const url = absoluteUrl(href, baseUrl);
    if (!title || !/\.html(?:$|\?)/i.test(url) || !isProbablyNewsUrl(url)) continue;

    const segment = html.slice(match.index, match.index + 2600);
    const publishedAt = parseBrazilDateTime(segment.match(/(\d{2}\/\d{2}\/\d{4}\s*[-–]\s*\d{2}:\d{2})/)?.[1]) || parseDateFromUrl(url);
    const imageUrl = nearbyImageUrl(segment, baseUrl);
    const item = directNewsItem(source, sport, { title, url, imageUrl, publishedAt });
    if (item) items.push(item);
  }

  return items;
};

const parseEspnLatest = (html: string, source: NewsSource, sport: string, baseUrl: string) => {
  const items: NewsItem[] = [];
  const articlePattern = /<article\b[\s\S]*?<\/article>/gi;
  let match: RegExpExecArray | null;

  while ((match = articlePattern.exec(html)) && items.length < 32) {
    const article = match[0];
    const before = html.slice(Math.max(0, match.index - 260), match.index);
    const id = attrFromTag(article, "data-id") || before.match(/_(\d+)_(\d{4}-\d{2}-\d{2}T[^_]+)_/)?.[1] || "";
    const isoDate = before.match(/_(\d{4}-\d{2}-\d{2}T[^_]+)_/)?.[1] || "";
    const title = cleanNewsText(article.match(/<h[23][^>]*contentItem__title[^>]*>([\s\S]*?)<\/h[23]>/i)?.[1] || attrFromTag(article, "data-title"));
    if (!title) continue;

    const href = article.match(/\shref=["']([^"']+)["']/i)?.[1] || attrFromTag(article, "data-popup-href");
    const fallbackPath = article.includes("singleVideo") || href.includes("video")
      ? `/video/clip/_/id/${id}`
      : `/futebol/artigo/_/id/${id}`;
    const url = absoluteUrl(href || fallbackPath, baseUrl);
    const timeText = cleanNewsText(article.match(/contentMeta__timestamp[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
    const publishedAt = (isoDate ? normalizeDate(isoDate) : "") || parseRelativePublishedAt(timeText) || parseDateFromUrl(url);
    const imageUrl = nearbyImageUrl(article, baseUrl);
    const item = directNewsItem(source, sport, { title, url, imageUrl, publishedAt });
    if (item) items.push(item);
  }

  return items;
};

const parseKnownSourceLatest = (html: string, source: NewsSource, sport: string, baseUrl: string) => {
  const domain = normalizeDomain(source.url);
  if (domain.endsWith("ge.globo.com")) return parseGeLatest(html, source, sport, baseUrl);
  if (domain.endsWith("lance.com.br")) return parseLanceLatest(html, source, sport, baseUrl);
  if (domain.endsWith("espn.com.br")) return parseEspnLatest(html, source, sport, baseUrl);
  return [];
};

const sourceKey = (source: NewsSource) => `${source.name}:${source.url}`.toLowerCase();

export const readNewsSources = (): NewsSource[] => {
  if (typeof window === "undefined") return defaultNewsSources;
  try {
    const saved = JSON.parse(localStorage.getItem(NEWS_SOURCES_KEY) || "[]") as NewsSource[];
    const valid = Array.isArray(saved) ? saved.filter((source) => source?.name && source?.url && source?.type) : [];
    const byKey = new Map<string, NewsSource>();
    [...defaultNewsSources, ...valid].forEach((source) => byKey.set(source.id || sourceKey(source), normalizeNewsSource(source)));
    return Array.from(byKey.values());
  } catch {
    return defaultNewsSources;
  }
};

export const writeNewsSources = (sources: NewsSource[]) => {
  localStorage.setItem(NEWS_SOURCES_KEY, JSON.stringify(sources.map(normalizeNewsSource)));
};

export const normalizeNewsSource = (source: NewsSource): NewsSource => ({
  id: source.id || `${source.type}-${crypto.randomUUID()}`,
  name: cleanNewsText(source.name),
  url: cleanNewsText(source.url),
  type: source.type,
  active: Boolean(source.active),
});

export const validateNewsSource = (source: NewsSource): string | null => {
  const normalized = normalizeNewsSource(source);
  if (!normalized.name) return "Informe o nome da fonte.";
  if (!normalized.url) return "Informe a URL da fonte.";
  if (!["rss", "site", "api", "social"].includes(normalized.type)) return "Tipo de fonte invalido.";
  if ((normalized.type === "rss" || normalized.type === "api") && !/^https?:\/\//i.test(normalized.url)) {
    return "Fontes RSS/API precisam usar uma URL completa iniciada por http ou https.";
  }
  if (normalized.type === "social" && !/^(@|https?:\/\/)/i.test(normalized.url)) {
    return "Fontes sociais devem usar @perfil ou URL oficial do perfil.";
  }
  return null;
};

export const normalizeNewsItem = (raw: RawNewsItem, fallbackSource?: NewsSource): NewsItem | null => {
  const source = cleanNewsText(raw.source || fallbackSource?.name || "Fonte");
  const title = stripSourceSuffix(cleanNewsText(raw.title || ""), source);
  const url = normalizeUrl(raw.url || raw.link || "");
  if (!title || !url) return null;

  const sourceUrl = normalizeUrl(raw.sourceUrl || raw.source_url || fallbackSource?.url || "");
  const publishedAt = normalizeDate(raw.publishedAt || raw.published_at);

  return {
    id: raw.id || url,
    title,
    description: cleanNewsText(raw.description || ""),
    source,
    sourceUrl,
    url,
    imageUrl: normalizeUrl(raw.imageUrl || raw.image_url || ""),
    publishedAt,
    sport: cleanNewsText(raw.sport || ""),
    teams: (raw.teams || []).map(cleanNewsText).filter(Boolean),
    athletes: (raw.athletes || []).map(cleanNewsText).filter(Boolean),
    tags: (raw.tags || []).map(cleanNewsText).filter(Boolean),
  };
};

export const removeDuplicateNews = (items: NewsItem[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url || `${item.title}:${item.source}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const sortNewsByDate = (items: NewsItem[]) =>
  [...items].sort((a, b) => {
    const dateA = new Date(a.publishedAt).getTime();
    const dateB = new Date(b.publishedAt).getTime();
    return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
  });

const parseFeedXml = (xml: string, source: NewsSource, sport: string) => {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks
    .slice(0, 24)
    .map((block, index) =>
      normalizeNewsItem(
        {
          id: `${source.id || source.name}-${index}-${tagValue(block, "link")}`,
          title: tagValue(block, "title"),
          description: tagValue(block, "description") || tagValue(block, "summary") || tagValue(block, "content:encoded"),
          source: tagValue(block, "source") || source.name,
          sourceUrl: attrValue(block, "source", "url") || source.url,
          url: attrValue(block, "link", "href") || tagValue(block, "link") || source.url,
          imageUrl: imageFromXml(block),
          publishedAt: tagValue(block, "pubDate") || tagValue(block, "published") || tagValue(block, "updated"),
          sport,
          tags: [sport],
        },
        source
      )
    )
    .filter((item: NewsItem | null): item is NewsItem => Boolean(item));
};

const fetchDevDirectSiteNews = async (source: NewsSource, sport: string) => {
  const url = getKnownSourceFetchUrl(source, sport, true);
  if (!url) return [];
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) throw new Error(`Site HTTP ${res.status}`);
  return parseKnownSourceLatest(await res.text(), source, sport, url);
};

const fetchDevGoogleSiteNews = async (source: NewsSource, terms: string[], sport: string) => {
  const domain = normalizeDomain(source.url);
  const query = terms.length
    ? `(${terms.map((term) => `"${cleanNewsText(term)}"`).join(" OR ")}) site:${domain}`
    : `site:${domain} when:2d`;
  const res = await fetch(`/news-google/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, {
    cache: "no-store",
    headers: { Accept: "application/rss+xml,text/xml" },
  });
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  return parseFeedXml(await res.text(), source, sport).filter((item) =>
    normalizeDomain(item.sourceUrl || item.url).endsWith(domain)
  );
};

const fetchDevSiteNews = async (source: NewsSource, terms: string[], sport: string) => {
  const batches = await Promise.allSettled([
    fetchDevDirectSiteNews(source, sport),
    fetchDevGoogleSiteNews(source, terms, sport),
  ]);
  return sortNewsByDate(removeDuplicateNews(batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []))));
};

const fetchNewsFromSourcesDevFallback = async ({ sources, terms = [], sport = "football" }: NewsObserverOptions) => {
  const activeSources = sources.map(normalizeNewsSource).filter((source) => source.active && source.type === "site");
  if (activeSources.length === 0) return [];
  const batches = await Promise.allSettled(activeSources.map((source) => fetchDevSiteNews(source, terms, sport)));
  return sortNewsByDate(
    removeDuplicateNews(batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : [])))
  );
};

export const fetchNewsFromSources = async ({ sources, terms = [], sport = "football" }: NewsObserverOptions) => {
  const activeSources = sources.map(normalizeNewsSource).filter((source) => source.active);
  if (activeSources.length === 0) return [];

  try {
    const { data, error } = await supabase.functions.invoke("news-observer", {
      body: { sources: activeSources, terms, sport },
    });

    if (error) throw new Error(error.message || "Nao foi possivel atualizar noticias.");

    const rawItems = Array.isArray(data?.news) ? data.news : [];
    const normalized = rawItems
      .map((item: RawNewsItem) => normalizeNewsItem(item))
      .filter((item: NewsItem | null): item is NewsItem => Boolean(item));

    return sortNewsByDate(removeDuplicateNews(normalized));
  } catch (error) {
    if (import.meta.env.DEV) {
      const fallbackItems = await fetchNewsFromSourcesDevFallback({ sources: activeSources, terms, sport });
      return fallbackItems;
    }
    throw new Error(
      error instanceof Error
        ? "O servico de noticias nao respondeu. Verifique se a Edge Function news-observer esta deployada."
        : "Nao foi possivel atualizar noticias. Verifique se a Edge Function news-observer esta deployada."
    );
  }
};

export const refreshNews = (options: NewsObserverOptions) => fetchNewsFromSources(options);

export const startNewsObserver = ({
  sources,
  terms = [],
  sport = "football",
  intervalMs = 15 * 60 * 1000,
  onUpdate,
  onError,
}: NewsObserverOptions & {
  intervalMs?: number;
  onUpdate: (items: NewsItem[]) => void;
  onError?: (error: Error) => void;
}) => {
  let stopped = false;
  const run = async () => {
    try {
      const items = await refreshNews({ sources, terms, sport });
      if (!stopped) onUpdate(items);
    } catch (error) {
      if (!stopped && onError) onError(error instanceof Error ? error : new Error("Erro ao atualizar noticias."));
    }
  };

  void run();
  const timer = window.setInterval(run, intervalMs);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
};
