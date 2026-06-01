import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NewsSource = {
  id?: string;
  name: string;
  url: string;
  type: "rss" | "site" | "api" | "social";
  active: boolean;
};

type NewsItem = {
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store",
};

const defaultSources: NewsSource[] = [
  { id: "ge", name: "ge / Globo Esporte", url: "ge.globo.com", type: "site", active: true },
  { id: "lance", name: "Lance!", url: "lance.com.br", type: "site", active: true },
  { id: "espn", name: "ESPN Brasil", url: "espn.com.br", type: "site", active: true },
];

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

const cleanNewsText = (text = "") =>
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

const normalizeDomain = (value: string) =>
  cleanNewsText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim();

const normalizeUrl = (value?: string | null) => {
  const url = cleanNewsText(value || "");
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
};

const normalizeDate = (value?: string | null) => {
  if (!value) return new Date(0).toISOString();
  const date = new Date(cleanNewsText(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

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

const elementBlockAt = (html: string, index: number, closeTag: string, maxLength = 3200) => {
  const end = html.indexOf(closeTag, index);
  if (end < 0 || end - index > maxLength) return html.slice(index, index + maxLength);
  return html.slice(index, end + closeTag.length);
};

const titleFromAnchorBlock = (block: string) =>
  cleanNewsText(block.replace(/<svg[\s\S]*?<\/svg>/gi, " ").replace(/<picture[\s\S]*?<\/picture>/gi, " "));

const directNewsItem = (
  source: NewsSource,
  sport: string,
  item: { title: string; url: string; description?: string; imageUrl?: string; publishedAt?: string },
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
    source,
    sport,
  );

const getKnownSourceFetchUrl = (source: NewsSource, sport: string) => {
  const domain = normalizeDomain(source.url);
  const isBasketball = sport === "basketball";

  if (domain.endsWith("lance.com.br")) return "https://www.lance.com.br/";
  if (domain.endsWith("ge.globo.com")) return `https://ge.globo.com/${isBasketball ? "basquete" : "futebol"}/`;
  if (domain.endsWith("espn.com.br")) return `https://www.espn.com.br/${isBasketball ? "nba" : "futebol"}/`;

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
    const block = elementBlockAt(html, match.index, "</a>");
    const href = attrFromTag(tag, "href");
    const title =
      attrFromTag(tag, "aria-label") ||
      attrFromTag(tag, "data-ga4-param-title") ||
      attrFromTag(tag, "title") ||
      titleFromAnchorBlock(block);
    const url = absoluteUrl(href, baseUrl);
    if (!title || title.length < 24 || !/lance\.com\.br\/.+/i.test(url) || !isProbablyNewsUrl(url)) continue;
    if (/\/(futebol(?:-nacional|-internacional)?|brasileir[aã]o|times?|videos?|galerias?|colunas?|mais-esportes?)\/?$/i.test(url)) continue;

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

  const espnAnchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  while ((match = espnAnchorPattern.exec(html)) && items.length < 48) {
    const href = match[1];
    if (!/(\/futebol\/(?:artigo|video)|\/(?:futebol|video)\/.+\/_\/id\/)/i.test(href)) continue;

    const block = elementBlockAt(html, match.index, "</a>");
    const title =
      attrFromTag(match[0], "aria-label") ||
      attrFromTag(match[0], "title") ||
      cleanNewsText(block.match(/contentItem__title[^>]*>([\s\S]*?)<\/h[23]>/i)?.[1] || "") ||
      titleFromAnchorBlock(block);
    if (!title || title.length < 24) continue;

    const url = absoluteUrl(href, baseUrl);
    const segment = html.slice(match.index, match.index + 1800);
    const timeText = cleanNewsText(segment.match(/contentMeta__timestamp[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
    const publishedAt = parseRelativePublishedAt(timeText) || parseDateFromUrl(url);
    const imageUrl = nearbyImageUrl(segment, baseUrl);
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

const normalizeNewsItem = (raw: Partial<NewsItem>, source: NewsSource, sport: string): NewsItem | null => {
  const title = cleanNewsText(raw.title || "");
  const url = normalizeUrl(raw.url);
  if (!title || !url) return null;

  const description = cleanNewsText(raw.description || "");
  const tags = [...(raw.tags || []), sport].map(cleanNewsText).filter(Boolean);

  return {
    id: raw.id || url,
    title,
    description,
    source: cleanNewsText(raw.source || source.name),
    sourceUrl: normalizeUrl(raw.sourceUrl || source.url),
    url,
    imageUrl: normalizeUrl(raw.imageUrl),
    publishedAt: normalizeDate(raw.publishedAt),
    sport,
    teams: (raw.teams || []).map(cleanNewsText).filter(Boolean),
    athletes: (raw.athletes || []).map(cleanNewsText).filter(Boolean),
    tags,
  };
};

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" ? (value as JsonRecord) : {};

const textValue = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const espnArticleUrl = (article: JsonRecord) => {
  const links = asRecord(article.links);
  const web = asRecord(links.web);
  return textValue(web.href || article.link || article.url);
};

const espnArticleImageUrl = (article: JsonRecord) => {
  const images = Array.isArray(article.images) ? article.images : [];
  const image = images.map(asRecord).find((item) => textValue(item.url));
  return textValue(image?.url || article.imageUrl);
};

const parseEspnApiNews = (data: unknown, source: NewsSource, sport: string) => {
  const payload = asRecord(data);
  const articles = Array.isArray(payload.articles) ? payload.articles : [];
  return articles
    .map((rawArticle) => {
      const article = asRecord(rawArticle);
      const articleUrl = espnArticleUrl(article);
      const articleId = textValue(article.id);
      return (
      normalizeNewsItem(
        {
          id: articleId ? `${source.id || source.name}-${articleId}` : articleUrl,
          title: textValue(article.headline || article.title),
          description: textValue(article.description || article.story),
          source: source.name,
          sourceUrl: source.url,
          url: articleUrl,
          imageUrl: espnArticleImageUrl(article),
          publishedAt: textValue(article.published || article.lastModified),
          sport,
          tags: [sport],
        },
        source,
        sport,
      )
      );
    })
    .filter((item): item is NewsItem => Boolean(item));
};

const removeDuplicateNews = (items: NewsItem[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const urlKey = item.url;
    const titleKey = `${normalizeDomain(item.sourceUrl || item.url)}:${cleanNewsText(item.title).toLowerCase()}`;
    if ((urlKey && seen.has(urlKey)) || seen.has(titleKey)) return false;
    if (urlKey) seen.add(urlKey);
    seen.add(titleKey);
    return true;
  });
};

const sortNewsByDate = (items: NewsItem[]) =>
  [...items].sort((a, b) => {
    const dateA = new Date(a.publishedAt).getTime();
    const dateB = new Date(b.publishedAt).getTime();
    return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
  });

const parseFeedXml = (xml: string, source: NewsSource, sport: string) => {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks
    .slice(0, 24)
    .map((block, index) => {
      const link = attrValue(block, "link", "href") || tagValue(block, "link");
      const sourceName = tagValue(block, "source") || source.name;
      const sourceUrl = attrValue(block, "source", "url") || source.url;
      return normalizeNewsItem(
        {
          id: `${source.id || source.name}-${index}-${link}`,
          title: tagValue(block, "title"),
          description: tagValue(block, "description") || tagValue(block, "summary") || tagValue(block, "content:encoded"),
          source: sourceName,
          sourceUrl,
          url: link || source.url,
          imageUrl: imageFromXml(block),
          publishedAt: tagValue(block, "pubDate") || tagValue(block, "published") || tagValue(block, "updated"),
        },
        source,
        sport,
      );
    })
    .filter((item): item is NewsItem => Boolean(item));
};

const fetchXml = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      Accept: "application/rss+xml,text/xml,application/xml",
      "User-Agent": "SportandoNewsObserver/1.0",
    },
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  return res.text();
};

const fetchHtml = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "SportandoNewsObserver/1.0",
    },
  });
  if (!res.ok) throw new Error(`Site HTTP ${res.status}`);
  return res.text();
};

const fetchDirectSiteNews = async (source: NewsSource, sport: string) => {
  const url = getKnownSourceFetchUrl(source, sport);
  if (!url) return [];
  return parseKnownSourceLatest(await fetchHtml(url), source, sport, url);
};

const fetchEspnApiNews = async (source: NewsSource, sport: string) => {
  if (!normalizeDomain(source.url).endsWith("espn.com.br")) return [];
  const paths =
    sport === "basketball"
      ? ["https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=50&region=br&lang=pt"]
      : [
          "https://site.api.espn.com/apis/site/v2/sports/soccer/all/news?limit=50&region=br&lang=pt",
          "https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/news?limit=50&region=br&lang=pt",
        ];

  const batches = await Promise.allSettled(
    paths.map(async (path) => {
      const res = await fetch(path, {
        headers: {
          Accept: "application/json",
          "User-Agent": "SportandoNewsObserver/1.0",
        },
      });
      if (!res.ok) throw new Error(`ESPN API HTTP ${res.status}`);
      return parseEspnApiNews(await res.json(), source, sport);
    })
  );

  return sortNewsByDate(removeDuplicateNews(batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []))));
};

const fetchSiteNews = async (source: NewsSource, terms: string[], sport: string) => {
  const domain = normalizeDomain(source.url);
  const query = terms.length
    ? `(${terms.map((term) => `"${cleanNewsText(term)}"`).join(" OR ")}) site:${domain}`
    : `site:${domain} when:2d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const batches = await Promise.allSettled([
    fetchEspnApiNews(source, sport),
    fetchDirectSiteNews(source, sport),
    fetchXml(url).then((xml) =>
      parseFeedXml(xml, source, sport).filter((item) => normalizeDomain(item.sourceUrl || item.url).endsWith(domain))
    ),
  ]);
  return sortNewsByDate(removeDuplicateNews(batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []))));
};

const fetchApiNews = async (source: NewsSource, sport: string) => {
  const res = await fetch(source.url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();
  const rows = Array.isArray(data) ? data : data.news || data.items || data.articles || [];
  return rows
    .slice(0, 24)
    .map((row: Record<string, unknown>) =>
      normalizeNewsItem(
        {
          title: String(row.title || row.name || ""),
          description: String(row.description || row.summary || ""),
          source: String(row.source || source.name),
          sourceUrl: String(row.sourceUrl || row.source_url || source.url),
          url: String(row.url || row.link || ""),
          imageUrl: String(row.imageUrl || row.image_url || row.urlToImage || ""),
          publishedAt: String(row.publishedAt || row.published_at || row.date || ""),
          tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
          teams: Array.isArray(row.teams) ? row.teams.map(String) : [],
          athletes: Array.isArray(row.athletes) ? row.athletes.map(String) : [],
        },
        source,
        sport,
      )
    )
    .filter((item): item is NewsItem => Boolean(item));
};

const fetchNewsFromSource = async (source: NewsSource, terms: string[], sport: string) => {
  if (!source.active) return [];
  if (source.type === "social") return [];
  if (source.type === "api") return fetchApiNews(source, sport);
  if (source.type === "rss") return parseFeedXml(await fetchXml(source.url), source, sport);
  return fetchSiteNews(source, terms, sport);
};

const persistNews = async (sources: NewsSource[], news: NewsItem[]) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  const client = createClient(url, key);
  await client.from("news_sources").upsert(
    sources.map((source) => ({
      name: source.name,
      url: source.url,
      type: source.type,
      active: source.active,
    })),
    { onConflict: "url" },
  );

  if (news.length === 0) return;

  await client.from("news").upsert(
    news.map((item) => ({
      title: item.title,
      description: item.description || null,
      source: item.source,
      source_url: item.sourceUrl || null,
      url: item.url,
      image_url: item.imageUrl || null,
      published_at: item.publishedAt,
      sport: item.sport || null,
      teams: item.teams || [],
      athletes: item.athletes || [],
      tags: item.tags || [],
    })),
    { onConflict: "url" },
  );
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sources = Array.isArray(body.sources) && body.sources.length ? body.sources as NewsSource[] : defaultSources;
    const terms = Array.isArray(body.terms) ? body.terms.map((term: unknown) => cleanNewsText(String(term))).filter(Boolean) : [];
    const sport = cleanNewsText(String(body.sport || "football"));
    const activeSources = sources.filter((source) => source.active);

    const batches = await Promise.allSettled(activeSources.map((source) => fetchNewsFromSource(source, terms, sport)));
    const news = sortNewsByDate(removeDuplicateNews(batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []))));

    await persistNews(activeSources, news).catch((error) => console.warn("news persist failed", error));

    return new Response(JSON.stringify({ news }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro ao buscar noticias." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
