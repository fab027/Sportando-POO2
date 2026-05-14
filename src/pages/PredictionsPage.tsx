import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Globe2, Instagram, Plus, RefreshCw, Rss, Search, Trash2, Twitter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useFavorites } from "@/contexts/FavoritesContext";

type SourceType = "site" | "rss" | "x" | "instagram";

type NewsSource = {
  id: string;
  type: SourceType;
  name: string;
  value: string;
  enabled: boolean;
};

type NewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  sourceUrl?: string | null;
  publishedAt: string | null;
  description: string;
};

const NEWS_SOURCES_KEY = "sportando.newsSources";

const defaultSources: NewsSource[] = [
  { id: "ge", type: "site", name: "ge / Globo Esporte", value: "ge.globo.com", enabled: true },
  { id: "lance", type: "site", name: "Lance!", value: "lance.com.br", enabled: true },
  { id: "espn", type: "site", name: "ESPN Brasil", value: "espn.com.br", enabled: true },
];

const sourceIcons = {
  site: Globe2,
  rss: Rss,
  x: Twitter,
  instagram: Instagram,
};

const readSources = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(NEWS_SOURCES_KEY) ?? "null") as NewsSource[] | null;
    const migrated = saved?.filter((source) => !source.id.startsWith("fabrizio-"));
    return migrated?.length ? migrated : defaultSources;
  } catch {
    return defaultSources;
  }
};

const writeSources = (sources: NewsSource[]) => {
  localStorage.setItem(NEWS_SOURCES_KEY, JSON.stringify(sources));
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const formatDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const normalizeDomain = (value: string) =>
  value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim();

const getUrlDomain = (value: string | null | undefined) => {
  if (!value) return "";
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    return normalizeDomain(value);
  }
};

const socialHandle = (value: string) =>
  value
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(?:www\.)?/i, "")
    .replace(/\/$/, "")
    .replace(/^(x|twitter|instagram)\.com\//i, "")
    .split(/[/?#]/)[0]
    .toLowerCase();

const socialLabel = (value: string) =>
  value
    .replace(/^https?:\/\/(?:www\.)?/i, "")
    .replace(/\/$/, "")
    .replace(/^x\.com\//i, "@")
    .replace(/^twitter\.com\//i, "@")
    .replace(/^instagram\.com\//i, "@");

const sourceMatchesItem = (source: NewsSource, item: Pick<NewsItem, "link" | "source" | "sourceUrl">) => {
  if (source.type === "rss") return true;
  if (source.type === "site") {
    const expectedDomain = normalizeDomain(source.value);
    return getUrlDomain(item.sourceUrl).endsWith(expectedDomain) || getUrlDomain(item.link).endsWith(expectedDomain);
  }

  const expectedHandle = socialHandle(source.value);
  const allowedDomains = source.type === "instagram" ? ["instagram.com"] : ["x.com", "twitter.com"];
  return [item.link, item.sourceUrl].filter(Boolean).some((value) => {
    try {
      const url = new URL(value as string);
      const domain = normalizeDomain(url.hostname);
      const handle = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
      return allowedDomains.includes(domain) && handle === expectedHandle;
    } catch {
      return false;
    }
  });
};

const itemMatchesTerms = (item: NewsItem, terms: string[]) => {
  if (terms.length === 0) return true;
  const haystack = normalizeText(`${item.title} ${item.description} ${item.source}`);
  return terms.some((term) => haystack.includes(normalizeText(term)));
};

const parseFeedXml = (xml: string, source: NewsSource): NewsItem[] => {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return [...doc.querySelectorAll("item, entry")].slice(0, 12).map((item, index) => {
    const title = item.querySelector("title")?.textContent || "Post";
    const link =
      item.querySelector("link")?.getAttribute("href") ||
      item.querySelector("link")?.textContent ||
      source.value;
    const publishedAt =
      item.querySelector("pubDate")?.textContent ||
      item.querySelector("published")?.textContent ||
      item.querySelector("updated")?.textContent ||
      null;
    const description = stripHtml(
      item.querySelector("description")?.textContent ||
        item.querySelector("summary")?.textContent ||
        item.querySelector("content")?.textContent ||
        ""
    );
    return {
      id: `${source.id}-${index}-${link}`,
      title,
      link,
      source: source.name,
      sourceUrl: source.value,
      publishedAt,
      description,
    };
  });
};

async function fetchSocialFeed(source: NewsSource): Promise<NewsItem[]> {
  const handle = socialHandle(source.value);
  if (!handle) return [];
  const paths =
    source.type === "instagram"
      ? [
          `/rsshub/picnob.info/user/${encodeURIComponent(handle)}`,
          `/rsshub/picnob/user/${encodeURIComponent(handle)}`,
          `/rsshub/instagram/2/user/${encodeURIComponent(handle)}`,
          `/rsshub/instagram/user/${encodeURIComponent(handle)}`,
        ]
      : [
          `/rsshub/twitter/user/${encodeURIComponent(handle)}`,
          `/nitter-api/${encodeURIComponent(handle)}/rss`,
          `/xcancel-api/${encodeURIComponent(handle)}/rss`,
          `/rss-xcancel/${encodeURIComponent(handle)}`,
        ];

  for (const path of paths) {
    try {
      const res = await fetch(path, { headers: { Accept: "application/rss+xml,text/xml" } });
      if (!res.ok) continue;
      const feedItems = parseFeedXml(await res.text(), source);
      if (feedItems.length > 0) return feedItems;
    } catch {
      // Try the next bridge route.
    }
  }
  return [];
}

async function fetchGoogleNews(query: string, source: NewsSource): Promise<NewsItem[]> {
  const url = `/news-rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const res = await fetch(url, { headers: { Accept: "application/rss+xml,text/xml" } });
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return [...doc.querySelectorAll("item")].map((item, index) => {
    const title = item.querySelector("title")?.textContent || "Notícia";
    const link = item.querySelector("link")?.textContent || "#";
    const sourceUrl = item.querySelector("source")?.getAttribute("url") || null;
    const publishedAt = item.querySelector("pubDate")?.textContent || null;
    const description = stripHtml(item.querySelector("description")?.textContent || "");
    return {
      id: `${source.id}-${index}-${link}`,
      title,
      link,
      source: source.name,
      sourceUrl,
      publishedAt,
      description,
    };
  }).filter((item) => sourceMatchesItem(source, item)).slice(0, 8);
}

async function fetchDirectRss(source: NewsSource): Promise<NewsItem[]> {
  const res = await fetch(source.value, { headers: { Accept: "application/rss+xml,text/xml" } });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  return parseFeedXml(await res.text(), source).slice(0, 8);
/*
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return [...doc.querySelectorAll("item, entry")].slice(0, 8).map((item, index) => {
    const title = item.querySelector("title")?.textContent || "Notícia";
    const link =
      item.querySelector("link")?.getAttribute("href") ||
      item.querySelector("link")?.textContent ||
      source.value;
    const publishedAt =
      item.querySelector("pubDate")?.textContent ||
      item.querySelector("published")?.textContent ||
      item.querySelector("updated")?.textContent ||
      null;
    const description = stripHtml(
      item.querySelector("description")?.textContent ||
        item.querySelector("summary")?.textContent ||
        item.querySelector("content")?.textContent ||
        ""
    );
    return {
      id: `${source.id}-${index}-${link}`,
      title,
      link,
      source: source.name,
      sourceUrl: source.value,
      publishedAt,
      description,
    };
  });
*/
}

const PredictionsPage = () => {
  const { favorites } = useFavorites();
  const [sources, setSources] = useState<NewsSource[]>(readSources);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [selectedSource, setSelectedSource] = useState("all");
  const [customQuery, setCustomQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(true);
  const [form, setForm] = useState({ type: "site" as SourceType, name: "", value: "" });
  const requestIdRef = useRef(0);

  const favoriteTerms = useMemo(() => favorites.map((fav) => fav.nome).filter(Boolean).slice(0, 8), [favorites]);
  const searchTerms = useMemo(() => {
    const typed = customQuery.split(",").map((term) => term.trim()).filter(Boolean);
    return [...new Set([...(onlyFavorites ? favoriteTerms : []), ...typed])];
  }, [customQuery, favoriteTerms, onlyFavorites]);
  const enabledSources = useMemo(() => sources.filter((source) => source.enabled), [sources]);

  const buildQuery = useCallback(
    (source: NewsSource) => {
      const terms = searchTerms.length ? searchTerms : ["futebol brasileiro", "mercado da bola"];
      const termQuery = terms.map((term) => `"${term}"`).join(" OR ");
      if (source.type === "site") return `(${termQuery}) futebol site:${normalizeDomain(source.value)}`;
      if (source.type === "x" || source.type === "instagram") {
        const domain = source.type === "instagram" ? "instagram.com" : "x.com";
        return `(${termQuery}) futebol site:${domain}/${socialHandle(source.value)}`;
      }
      return `(${termQuery}) futebol`;
    },
    [searchTerms]
  );

  const refreshNews = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus("loading");
    try {
      const batches = await Promise.allSettled(
        enabledSources.map((source) =>
          source.type === "x" || source.type === "instagram"
            ? fetchSocialFeed(source)
            : source.type === "rss" && /^https?:\/\//i.test(source.value)
            ? fetchDirectRss(source)
            : fetchGoogleNews(buildQuery(source), source)
        )
      );
      const seen = new Set<string>();
      const nextItems = batches
        .flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []))
        .filter((item) => itemMatchesTerms(item, searchTerms))
        .filter((item) => {
          if (seen.has(item.link)) return false;
          seen.add(item.link);
          return true;
        })
        .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
      if (requestIdRef.current === requestId) {
        setItems(nextItems);
        setStatus("success");
      }
    } catch {
      if (requestIdRef.current === requestId) setStatus("error");
    }
  }, [buildQuery, enabledSources, searchTerms]);

  useEffect(() => {
    writeSources(sources);
  }, [sources]);

  useEffect(() => {
    refreshNews();
  }, [refreshNews]);

  const filteredItems = useMemo(() => {
    if (selectedSource === "all") return items;
    return items.filter((item) => item.source === selectedSource);
  }, [items, selectedSource]);
  const selectedSourceConfig = useMemo(
    () => sources.find((source) => source.name === selectedSource) || null,
    [selectedSource, sources]
  );
  const emptyMessage =
    selectedSourceConfig?.type === "x" || selectedSourceConfig?.type === "instagram"
      ? `Nenhum post direto encontrado para ${socialLabel(selectedSourceConfig.value)}. Foram tentadas pontes RSSHub/Nitter/XCancel; se continuar vazio, elas podem estar bloqueadas para esse perfil ou sem acesso ao X no momento.`
      : "Nenhuma notícia encontrada para os filtros atuais.";

  const addSource = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.value.trim()) return;
    setSources((current) => [
      ...current,
      {
        id: `${form.type}-${Date.now()}`,
        type: form.type,
        name: form.name.trim(),
        value: form.value.trim(),
        enabled: true,
      },
    ]);
    setForm({ type: "site", name: "", value: "" });
  };

  const socialSources = sources.filter((source) => source.type === "x" || source.type === "instagram");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Rss className="h-6 w-6 text-sport" />
            Notícias dos Favoritos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agregue notícias de times e atletas favoritados com fontes personalizadas.
          </p>
        </div>
        <button
          onClick={refreshNews}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={customQuery}
                  onChange={(event) => setCustomQuery(event.target.value)}
                  placeholder="Termos extras separados por vírgula"
                  className="pl-9"
                />
              </div>
              <select
                value={selectedSource}
                onChange={(event) => setSelectedSource(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todas as fontes</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={onlyFavorites}
                  onChange={(event) => setOnlyFavorites(event.target.checked)}
                  className="h-4 w-4 accent-sport"
                />
                Apenas favoritos
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(searchTerms.length ? searchTerms : ["futebol brasileiro", "mercado da bola"]).map((term) => (
                <span key={term} className="rounded-md bg-sport/10 px-2 py-1 text-xs font-medium text-sport">
                  {term}
                </span>
              ))}
            </div>
          </div>

          {status === "loading" && items.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-sport" />
              Buscando notícias...
            </div>
          )}

          {status === "error" && items.length === 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-muted-foreground">
              Não foi possível carregar notícias agora. Verifique a conexão e tente atualizar.
            </div>
          )}

          {status !== "loading" && filteredItems.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}

          <div className="space-y-3">
            {filteredItems.map((item) => (
              <a
                key={item.id}
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-sport">{item.source}</p>
                    <h2 className="mt-1 font-display text-lg font-semibold leading-snug text-foreground">{item.title}</h2>
                  </div>
                  <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </div>
                {item.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
                {item.publishedAt && <p className="mt-3 text-xs text-muted-foreground">{formatDate(item.publishedAt)}</p>}
              </a>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-semibold text-foreground">Fontes</h2>
            <div className="mt-3 space-y-2">
              {sources.map((source) => {
                const Icon = sourceIcons[source.type];
                return (
                  <div key={source.id} className="flex items-center gap-2 rounded-lg border border-border p-3">
                    <Icon className="h-4 w-4 text-sport" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{source.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{source.type === "site" ? normalizeDomain(source.value) : socialLabel(source.value)}</p>
                    </div>
                    <button
                      onClick={() =>
                        setSources((current) =>
                          current.map((item) => (item.id === source.id ? { ...item, enabled: !item.enabled } : item))
                        )
                      }
                      className={`h-6 rounded-md px-2 text-xs font-medium ${
                        source.enabled ? "bg-sport text-sport-foreground" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {source.enabled ? "ON" : "OFF"}
                    </button>
                    {!defaultSources.some((item) => item.id === source.id) && (
                      <button
                        onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                        aria-label="Remover fonte"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={addSource} className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-semibold text-foreground">Adicionar fonte</h2>
            <div className="mt-3 space-y-3">
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as SourceType }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="site">Site de notícias</option>
                <option value="rss">RSS</option>
                <option value="x">Perfil do X/Twitter</option>
                <option value="instagram">Perfil do Instagram</option>
              </select>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nome da fonte"
              />
              <Input
                value={form.value}
                onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                placeholder={form.type === "site" ? "ex: globo.com" : "URL ou @perfil"}
              />
              <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-sport px-4 py-2 text-sm font-medium text-sport-foreground hover:opacity-90">
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </form>

          {socialSources.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-sm font-semibold text-foreground">Perfis sociais</h2>
              <div className="mt-3 space-y-2">
                {socialSources.map((source) => (
                  <a
                    key={source.id}
                    href={source.value.startsWith("@") ? `https://x.com/${source.value.slice(1)}` : source.value}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm text-foreground hover:bg-secondary"
                  >
                    <span className="truncate">{source.name}</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default PredictionsPage;
