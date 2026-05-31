import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ExternalLink, Globe2, Plus, RefreshCw, Rss, Search, Trash2, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useSport } from "@/contexts/SportContext";
import {
  NewsItem,
  NewsSource,
  cleanNewsText,
  defaultNewsSources,
  readNewsSources,
  refreshNews,
  sortNewsByDate,
  validateNewsSource,
  writeNewsSources,
} from "@/services/newsObserver";

type SourceForm = {
  type: NewsSource["type"];
  name: string;
  url: string;
};

type Status = "idle" | "loading" | "success" | "error";

const NEWS_REFRESH_INTERVAL_STORAGE_KEY = "sportando.news.refreshIntervalMs";
const NEWS_REFRESH_INTERVAL_OPTIONS = [
  { value: 0, label: "Manual" },
  { value: 60_000, label: "1 min" },
  { value: 5 * 60_000, label: "5 min" },
  { value: 15 * 60_000, label: "15 min" },
  { value: 30 * 60_000, label: "30 min" },
] as const;

const sourceIcons: Record<NewsSource["type"], typeof Globe2> = {
  site: Globe2,
  rss: Rss,
  api: Globe2,
  social: Globe2,
};

const normalizeText = (value: string) =>
  cleanNewsText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const splitTerms = (value: string) =>
  value
    .split(",")
    .map((term) => cleanNewsText(term))
    .filter(Boolean);

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "Data nao informada";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatTime = (value: number) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const readNewsRefreshInterval = () => {
  if (typeof window === "undefined") return 60_000;
  const raw = localStorage.getItem(NEWS_REFRESH_INTERVAL_STORAGE_KEY);
  if (!raw) return 60_000;
  const parsed = Number(raw);
  return NEWS_REFRESH_INTERVAL_OPTIONS.some((option) => option.value === parsed) ? parsed : 60_000;
};

const normalizeDomain = (value = "") =>
  value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .trim();

const sourceValueLabel = (source: NewsSource) => {
  if (source.type === "site") return normalizeDomain(source.url);
  if (source.type === "social") return source.url.startsWith("@") ? source.url : source.url.replace(/^https?:\/\/(?:www\.)?/i, "");
  return source.url;
};

const itemHaystack = (item: NewsItem) =>
  normalizeText(
    [
      item.title,
      item.description,
      item.source,
      item.sourceUrl,
      item.sport,
      ...(item.tags || []),
      ...(item.teams || []),
      ...(item.athletes || []),
    ].join(" ")
  );

const itemMatchesTerms = (item: NewsItem, terms: string[]) => {
  if (terms.length === 0) return true;
  const haystack = itemHaystack(item);
  return terms.some((term) => haystack.includes(normalizeText(term)));
};

const sourceMatchesItem = (source: NewsSource, item: NewsItem) => {
  if (item.source === source.name) return true;
  if (source.type === "site") {
    const expected = normalizeDomain(source.url);
    return normalizeDomain(item.sourceUrl || item.url).endsWith(expected);
  }
  return item.sourceUrl === source.url || item.url.includes(source.url);
};

const defaultSourceIds = new Set(defaultNewsSources.map((source) => source.id));

const News = () => {
  const { favorites } = useFavorites();
  const { sport, sportLabel } = useSport();
  const [sources, setSources] = useState<NewsSource[]>(readNewsSources);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState("all");
  const [customQuery, setCustomQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [form, setForm] = useState<SourceForm>({ type: "site", name: "", url: "" });
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(readNewsRefreshInterval);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const observerTermsRef = useRef<string[]>([]);

  const favoriteTerms = useMemo(() => favorites.map((favorite) => favorite.nome).filter(Boolean), [favorites]);
  const extraTerms = useMemo(() => splitTerms(customQuery), [customQuery]);
  const enabledSources = useMemo(() => sources.filter((source) => source.active), [sources]);

  useEffect(() => {
    observerTermsRef.current = onlyFavorites ? [...favoriteTerms, ...extraTerms] : extraTerms;
  }, [extraTerms, favoriteTerms, onlyFavorites]);

  const updateNews = useCallback(
    async (silent = false) => {
      if (enabledSources.length === 0) {
        setItems([]);
        setError("Ative pelo menos uma fonte para buscar noticias.");
        setStatus("error");
        return;
      }

      if (!silent) setStatus("loading");
      setError(null);

      try {
        const news = await refreshNews({
          sources,
          terms: observerTermsRef.current,
          sport,
        });
        setItems(news);
        setLastUpdatedAt(Date.now());
        setStatus("success");
      } catch (err) {
        setStatus("error");
        const message = err instanceof Error ? err.message : "";
        setError(
          /failed to send|edge function/i.test(message)
            ? "O servico de noticias nao respondeu. Em ambiente local, reinicie o servidor; em producao, faca deploy da funcao news-observer."
            : message || "Nao foi possivel atualizar as noticias agora."
        );
      }
    },
    [enabledSources.length, sources, sport]
  );

  useEffect(() => {
    writeNewsSources(sources);
  }, [sources]);

  useEffect(() => {
    localStorage.setItem(NEWS_REFRESH_INTERVAL_STORAGE_KEY, String(refreshIntervalMs));
  }, [refreshIntervalMs]);

  useEffect(() => {
    void updateNews();
  }, [updateNews]);

  useEffect(() => {
    if (refreshIntervalMs <= 0) return undefined;
    const interval = window.setInterval(() => void updateNews(true), refreshIntervalMs);
    return () => window.clearInterval(interval);
  }, [refreshIntervalMs, updateNews]);

  const selectedSourceConfig = useMemo(
    () => sources.find((source) => source.id === selectedSource) || null,
    [selectedSource, sources]
  );

  const filteredItems = useMemo(() => {
    const bySource = selectedSourceConfig
      ? items.filter((item) => sourceMatchesItem(selectedSourceConfig, item))
      : items;
    const byFavorites = onlyFavorites
      ? bySource.filter((item) => favoriteTerms.length > 0 && itemMatchesTerms(item, favoriteTerms))
      : bySource;
    const byExtraTerms = byFavorites.filter((item) => itemMatchesTerms(item, extraTerms));
    return sortNewsByDate(byExtraTerms);
  }, [extraTerms, favoriteTerms, items, onlyFavorites, selectedSourceConfig]);

  const emptyMessage = useMemo(() => {
    if (enabledSources.length === 0) return "Nenhuma fonte ativa. Ative ou adicione uma fonte para buscar noticias.";
    if (onlyFavorites && favoriteTerms.length === 0) return "Voce ainda nao tem favoritos. Desative o filtro ou adicione times/atletas favoritos.";
    if (onlyFavorites) return "Nenhuma noticia relacionada aos favoritos foi encontrada.";
    if (extraTerms.length > 0) return "Nenhuma noticia encontrada para os termos informados.";
    return "Nenhuma noticia encontrada nas fontes ativas.";
  }, [enabledSources.length, extraTerms.length, favoriteTerms.length, onlyFavorites]);

  const addSource = (event: FormEvent) => {
    event.preventDefault();
    const nextSource: NewsSource = {
      id: `${form.type}-${Date.now()}`,
      type: form.type,
      name: form.name,
      url: form.url,
      active: true,
    };
    const validationError = validateNewsSource(nextSource);
    if (validationError) {
      setSourceError(validationError);
      return;
    }

    const normalizedUrl = normalizeDomain(nextSource.url).toLowerCase();
    if (sources.some((source) => normalizeDomain(source.url).toLowerCase() === normalizedUrl)) {
      setSourceError("Esta fonte ja foi adicionada.");
      return;
    }

    setSources((current) => [...current, { ...nextSource, name: cleanNewsText(nextSource.name), url: cleanNewsText(nextSource.url) }]);
    setForm({ type: "site", name: "", url: "" });
    setSourceError(null);
  };

  const isInitialLoading = status === "loading" && items.length === 0;
  const isRefreshing = status === "loading";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
            <Rss className="h-6 w-6 text-sport" />
            Noticias
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Noticias recentes para {sportLabel.toLowerCase()} e do esporte em geral.
            {lastUpdatedAt && (
              <span className="block sm:inline sm:ml-2">
                Ultima atualizacao: {formatTime(lastUpdatedAt)}.
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={refreshIntervalMs}
            onChange={(event) => setRefreshIntervalMs(Number(event.target.value))}
            aria-label="Atualizacao automatica de noticias"
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-secondary focus:border-sport"
          >
            {NEWS_REFRESH_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Auto: {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void updateNews()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
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
                  placeholder="Termos extras separados por virgula"
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
                  <option key={source.id} value={source.id}>
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
              {[...(onlyFavorites ? favoriteTerms : []), ...extraTerms].map((term) => (
                <span key={term} className="rounded-md bg-sport/10 px-2 py-1 text-xs font-medium text-sport">
                  {term}
                </span>
              ))}
            </div>
          </div>

          {isInitialLoading && (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-sport" />
              Buscando noticias recentes...
            </div>
          )}

          {status === "error" && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-muted-foreground">
              <WifiOff className="mt-0.5 h-4 w-4 text-destructive" />
              <span>{error || "Nao foi possivel carregar noticias agora. Tente atualizar novamente."}</span>
            </div>
          )}

          {!isInitialLoading && filteredItems.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}

          <div className="space-y-3">
            {filteredItems.map((item) => (
              <a
                key={item.id || item.url}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex gap-4">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="hidden h-24 w-32 rounded-lg object-cover sm:block"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium text-sport">{item.source}</p>
                        <h2 className="mt-1 font-display text-lg font-semibold leading-snug text-foreground">{item.title}</h2>
                      </div>
                      <ExternalLink className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    </div>
                    {item.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(item.publishedAt)}</span>
                      {item.tags?.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded bg-secondary px-1.5 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
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
                  <div key={source.id || source.url} className="flex items-center gap-2 rounded-lg border border-border p-3">
                    <Icon className="h-4 w-4 text-sport" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{source.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{sourceValueLabel(source)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSources((current) =>
                          current.map((item) => (item.id === source.id ? { ...item, active: !item.active } : item))
                        )
                      }
                      className={`h-6 rounded-md px-2 text-xs font-medium ${
                        source.active ? "bg-sport text-sport-foreground" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {source.active ? "ON" : "OFF"}
                    </button>
                    {!defaultSourceIds.has(source.id) && (
                      <button
                        type="button"
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
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as NewsSource["type"] }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="site">Site de noticias</option>
                <option value="rss">RSS</option>
                <option value="api">API JSON</option>
                <option value="social">Perfil social</option>
              </select>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nome da fonte"
              />
              <Input
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder={form.type === "site" ? "ex: globo.com" : "URL ou @perfil"}
              />
              {form.type === "social" && (
                <div className="flex gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0 text-sport" />
                  Perfis sociais ficam cadastrados para integracao futura com APIs oficiais; o app nao faz scraping dessas redes.
                </div>
              )}
              {sourceError && <p className="text-xs text-destructive">{sourceError}</p>}
              <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-sport px-4 py-2 text-sm font-medium text-sport-foreground hover:opacity-90">
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
};

export default News;
