import { useState, useEffect, useCallback } from "react";
import {
  sofaScoreService,
  SofaTeamStanding,
  SofaMatch,
  SofaLiveMatch,
  TodayMatch,
  PlayerSearchResult,
  PlayerDetail,
  OddsMatch,
  TeamPlayer,
  SofaTopPlayer,
} from "@/services/sofaScoreService";
import {
  getFallbackMatches,
  getFallbackPlayerDetail,
  getFallbackPlayerSearch,
  getFallbackStandings,
  getFallbackTeamPlayers,
  getFallbackTodayMatches,
  getFallbackTopPlayers,
} from "@/data/sportsFallback";

// Simple in-memory cache (TTL 5 min)
const cache: Record<string, { data: unknown; ts: number }> = {};
const TTL = 15 * 60 * 1000;
type FetchOptions = { force?: boolean };
type MatchFetchMode = "window" | "season";

const storageKey = (key: string) => `sportando.cache.${key}`;

function readStoredCache<T>(key: string): { data: T; ts: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(key)) || "null");
    if (!parsed || typeof parsed !== "object" || typeof parsed.ts !== "number") return null;
    return parsed as { data: T; ts: number };
  } catch {
    return null;
  }
}

function writeStoredCache(key: string, data: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // Cache storage is best-effort.
  }
}

function cached<T>(key: string, fn: () => Promise<T>, force = false): Promise<T> {
  const hit = cache[key];
  if (!force && hit && Date.now() - hit.ts < TTL) return Promise.resolve(hit.data as T);
  const stored = readStoredCache<T>(key);
  if (!force && stored && Date.now() - stored.ts < TTL) {
    cache[key] = stored;
    return Promise.resolve(stored.data);
  }
  return fn().then((data) => {
    cache[key] = { data, ts: Date.now() };
    writeStoredCache(key, data);
    return data;
  });
}

function readCachedArray<T>(key: string, force = false): T[] | null {
  const hit = cache[key];
  if (!force && hit && Date.now() - hit.ts < TTL && Array.isArray(hit.data)) {
    return hit.data as T[];
  }
  const stored = readStoredCache<T[]>(key);
  if (!force && stored && Date.now() - stored.ts < TTL && Array.isArray(stored.data)) {
    cache[key] = stored;
    return stored.data;
  }
  return null;
}

function writeArrayCache<T>(key: string, data: T[]) {
  cache[key] = { data, ts: Date.now() };
  writeStoredCache(key, data);
}

function isRealPlayerDetail(value: unknown): value is PlayerDetail {
  if (!value || typeof value !== "object") return false;
  const detail = value as PlayerDetail;
  return Boolean(detail.name && !/dados indisponiveis/i.test(detail.name) && Array.isArray(detail.seasons));
}

function hasPlayerSeasonStats(value: unknown): value is PlayerDetail {
  return isRealPlayerDetail(value) && value.seasons.length > 0;
}

type Status = "idle" | "loading" | "success" | "error";

function todayLocalIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function saoPauloIsoFromTimestamp(startTimestamp?: number | null) {
  if (!startTimestamp) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(startTimestamp * 1000));
}

// ─── Standings ──────────────────────────────────────────────────────────────
export function useStandings(leagueUrl: string, tableType: "total" | "home" | "away" = "total") {
  const standingsKey = `standings_v2_${tableType}_${leagueUrl}`;
  const [data, setData] = useState<SofaTeamStanding[]>(() => readStoredCache<{ teams?: SofaTeamStanding[] }>(standingsKey)?.data?.teams || []);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await cached(standingsKey, () =>
        sofaScoreService.getStandings(leagueUrl, tableType)
      );
      const teams = Array.isArray(res?.teams) ? res.teams : [];
      setData(teams.length > 0 ? teams : getFallbackStandings(leagueUrl));
      setStatus("success");
    } catch (e) {
      setData(getFallbackStandings(leagueUrl));
      setError(e instanceof Error ? e.message : "Erro ao carregar classificação");
      setStatus("error");
    }
  }, [leagueUrl, standingsKey, tableType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, status, error, refetch: fetchData };
}

// ─── Matches ─────────────────────────────────────────────────────────────────
function uniqueMatches(matches: SofaMatch[]) {
  const byId = new Map<number, SofaMatch>();
  matches.forEach((match) => {
    if (typeof match?.id === "number") byId.set(match.id, match);
  });
  return Array.from(byId.values());
}

async function fetchMatchWindow(leagueUrl: string) {
  const [last, next] = await Promise.all([
    sofaScoreService.getLastMatches(leagueUrl),
    sofaScoreService.getNextMatches(leagueUrl),
  ]);
  return uniqueMatches([...(Array.isArray(last) ? last : []), ...(Array.isArray(next) ? next : [])]);
}

function splitMatches(matches: SofaMatch[], leagueUrl: string, includeFallback = false) {
  const nowSec = Math.floor(Date.now() / 1000);
  const cleanLast = matches
    .filter((m) => m.startTimestamp && m.startTimestamp < nowSec)
    .sort((a, b) => b.startTimestamp - a.startTimestamp);
  const cleanNext = matches
    .filter((m) => m.startTimestamp && m.startTimestamp >= nowSec - 3600)
    .sort((a, b) => a.startTimestamp - b.startTimestamp);

  if (!includeFallback || cleanLast.length > 0 || cleanNext.length > 0) {
    return { last: cleanLast, next: cleanNext, hasData: cleanLast.length > 0 || cleanNext.length > 0 };
  }

  const fallback = getFallbackMatches(leagueUrl);
  return {
    last: fallback.lastMatches,
    next: fallback.nextMatches,
    hasData: fallback.lastMatches.length > 0 || fallback.nextMatches.length > 0,
  };
}

function getStoredMatchSeed(mode: MatchFetchMode, leagueUrl: string) {
  const seasonKey = `season_v4_${leagueUrl}`;
  const windowKey = `window_v3_${leagueUrl}`;
  const previousSeasonKey = `season_v3_${leagueUrl}`;
  const previousWindowKey = `window_v2_${leagueUrl}`;
  const legacySeasonKey = `season_v2_${leagueUrl}`;
  const legacyWindowKey = `window_v1_${leagueUrl}`;
  const keys = mode === "season"
    ? [seasonKey, windowKey, previousSeasonKey, previousWindowKey, legacySeasonKey, legacyWindowKey]
    : [windowKey, previousWindowKey, legacyWindowKey];

  for (const key of keys) {
    const stored = readStoredCache<SofaMatch[]>(key);
    if (Array.isArray(stored?.data) && stored.data.length > 0) return stored.data;
  }

  return [];
}

export function useMatches(leagueUrl: string, mode: MatchFetchMode = "window") {
  const seasonCacheKey = `season_v4_${leagueUrl}`;
  const windowCacheKey = `window_v3_${leagueUrl}`;
  const [lastMatches, setLastMatches] = useState<SofaMatch[]>(() => splitMatches(getStoredMatchSeed(mode, leagueUrl), leagueUrl).last);
  const [nextMatches, setNextMatches] = useState<SofaMatch[]>(() => splitMatches(getStoredMatchSeed(mode, leagueUrl), leagueUrl).next);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (options?: FetchOptions) => {
    let appliedAny = false;
    setError(null);

    const applyMatches = (raw: SofaMatch[], includeFallback = false, preserveOnEmpty = false) => {
      const split = splitMatches(Array.isArray(raw) ? raw : [], leagueUrl, includeFallback);
      if (!split.hasData && preserveOnEmpty) return false;
      setLastMatches(split.last);
      setNextMatches(split.next);
      appliedAny = appliedAny || split.hasData;
      return split.hasData;
    };

    const loadWindow = () => cached(windowCacheKey, () => fetchMatchWindow(leagueUrl), options?.force);

    if (mode !== "season") {
      setStatus("loading");
      try {
        applyMatches(await loadWindow(), true);
        setStatus("success");
      } catch (e) {
        applyMatches([], true);
        setError(e instanceof Error ? e.message : "Erro ao carregar partidas");
        setStatus("error");
      }
      return;
    }

    const storedSeed = options?.force ? [] : getStoredMatchSeed(mode, leagueUrl);
    if (storedSeed.length > 0) {
      applyMatches(storedSeed);
      setStatus("success");
    } else {
      setStatus("loading");
      try {
        applyMatches(await loadWindow());
        setStatus("success");
      } catch {
        // The full-season request below can still recover the page.
      }
    }

    try {
      const seasonMatches = await cached(seasonCacheKey, () => sofaScoreService.getSeasonMatches(leagueUrl), options?.force);
      applyMatches(seasonMatches, !appliedAny, appliedAny);
      setStatus("success");
    } catch (e) {
      if (appliedAny) {
        setError(e instanceof Error ? e.message : "Erro ao carregar temporada completa");
        setStatus("success");
        return;
      }

      try {
        applyMatches(await loadWindow(), true);
        setStatus("success");
      } catch (windowError) {
        applyMatches([], true);
        setError(windowError instanceof Error ? windowError.message : "Erro ao carregar partidas");
        setStatus("error");
      }
    }
  }, [leagueUrl, mode, seasonCacheKey, windowCacheKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const allMatches: Array<SofaMatch & { _type: "past" | "upcoming" }> = [
    ...lastMatches.map((m) => ({ ...m, _type: "past" as const })),
    ...nextMatches.map((m) => ({ ...m, _type: "upcoming" as const })),
  ];

  return { lastMatches, nextMatches, allMatches, status, error, refetch: fetchData };
}

// ─── Live Matches ─────────────────────────────────────────────────────────────
export function useLiveMatches(pollIntervalMs = 30_000) {
  const [data, setData] = useState<SofaLiveMatch[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const fetchData = useCallback(async (options?: FetchOptions) => {
    void options;
    setStatus("loading");
    try {
      const res = await sofaScoreService.getLiveMatches();
      setData(Array.isArray(res) ? res : []);
      setStatus("success");
    } catch {
      setData([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchData();
    if (pollIntervalMs <= 0) return undefined;
    const interval = window.setInterval(() => void fetchData(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchData, pollIntervalMs]);

  return { data, status, refetch: fetchData };
}

// ─── Today Matches ───────────────────────────────────────────────────────────
export function useTodayMatches() {
  const [data, setData] = useState<TodayMatch[]>(() => readStoredCache<TodayMatch[]>("today_matches_v5")?.data || []);
  const [status, setStatus] = useState<Status>("idle");

  const fetchData = useCallback(async (options?: FetchOptions) => {
    setStatus("loading");
    try {
      const res = await cached("today_matches_v5", () => sofaScoreService.getTodayMatches(), options?.force);
      const todayIso = todayLocalIso();
      const matches = Array.isArray(res)
        ? res.filter((match) => saoPauloIsoFromTimestamp(match.startTimestamp) === todayIso)
        : [];
      setData(matches.length > 0 ? matches : getFallbackTodayMatches());
      setStatus("success");
    } catch {
      setData(getFallbackTodayMatches());
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, status, refetch: fetchData };
}

// ─── Player Search ────────────────────────────────────────────────────────────
export function useTopPlayers(leagueUrl: string, metric: "goals" | "assists") {
  const topPlayersKey = `top_players_v5_${leagueUrl}_${metric}`;
  const [data, setData] = useState<SofaTopPlayer[]>(() => {
    const stored = readStoredCache<SofaTopPlayer[]>(topPlayersKey)?.data;
    return Array.isArray(stored) ? stored : [];
  });
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (options?: FetchOptions) => {
    setStatus("loading");
    try {
      const cachedPlayers = readCachedArray<SofaTopPlayer>(topPlayersKey, options?.force);
      if (cachedPlayers && cachedPlayers.length > 0) {
        setData(cachedPlayers);
        setStatus("success");
        return;
      }
      const res = await sofaScoreService.getTopPlayers(leagueUrl, metric);
      const players = Array.isArray(res) ? res : [];
      if (players.length > 0) writeArrayCache(topPlayersKey, players);
      setData(players.length > 0 ? players : getFallbackTopPlayers(metric));
      setStatus("success");
    } catch (e) {
      setData(getFallbackTopPlayers(metric));
      setError(e instanceof Error ? e.message : "Erro ao carregar ranking de jogadores");
      setStatus("error");
    }
  }, [leagueUrl, metric, topPlayersKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, status, error, refetch: fetchData };
}

export function usePlayerSearch() {
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const search = useCallback(async (query: string) => {
    const safeQuery = query.trim();
    if (!safeQuery || safeQuery.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const playerSearchKey = `player_search_v9_${safeQuery.toLowerCase()}`;
    const storedResults = readCachedArray<PlayerSearchResult>(playerSearchKey);
    if (storedResults && storedResults.length > 0) {
      setResults(storedResults);
      setStatus("success");
      return;
    }
    setStatus("loading");
    try {
      const res = await sofaScoreService.searchPlayer(safeQuery);
      const players = Array.isArray(res) ? res : [];
      if (players.length > 0) writeArrayCache(playerSearchKey, players);
      setResults(players.length > 0 ? players : getFallbackPlayerSearch(safeQuery));
      setStatus("success");
    } catch {
      setResults(getFallbackPlayerSearch(safeQuery));
      setStatus("error");
    }
  }, []);

  return { results, status, search };
}

// ─── Player Stats ─────────────────────────────────────────────────────────────
export function usePlayerStats(playerUrl: string | null) {
  const [data, setData] = useState<PlayerDetail | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!playerUrl) {
      setData(null);
      return;
    }
    setStatus("loading");
    const playerStatsKey = `player_stats_v6_${playerUrl}`;
    const stored = readStoredCache<PlayerDetail>(playerStatsKey)?.data;
    if (hasPlayerSeasonStats(stored)) {
      cache[playerStatsKey] = { data: stored, ts: Date.now() };
      setData(stored);
      setStatus("success");
      return;
    }

    sofaScoreService.getPlayerStats(playerUrl)
      .then((res) => {
        if (hasPlayerSeasonStats(res)) {
          cache[playerStatsKey] = { data: res, ts: Date.now() };
          writeStoredCache(playerStatsKey, res);
        }
        setData(isRealPlayerDetail(res) ? res : getFallbackPlayerDetail(playerUrl));
        setStatus("success");
      })
      .catch(() => {
        setData(getFallbackPlayerDetail(playerUrl));
        setStatus("error");
      });
  }, [playerUrl]);

  return { data, status };
}

// ─── Odds ─────────────────────────────────────────────────────────────────────
export function useOdds() {
  const [data, setData] = useState<OddsMatch[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await cached("odds", () => sofaScoreService.getOdds());
      setData(res);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, status, refetch: fetchData };
}

// ─── Team Players ─────────────────────────────────────────────────────────────
export function useTeamPlayers(teamName: string | null, teamId?: number | null) {
  const [data, setData] = useState<TeamPlayer[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!teamName && !teamId) {
      setData([]);
      setStatus("idle");
      return;
    }
    const safeTeamName = teamName || "";
    const cacheKey = teamId ? `id_${teamId}` : `name_${safeTeamName}`;
    setStatus("loading");
    cached(`team_players_v9_${cacheKey}`, () => sofaScoreService.getTeamPlayers(safeTeamName, teamId))
      .then((res) => {
        setData(Array.isArray(res) && res.length > 0 ? res : getFallbackTeamPlayers(safeTeamName));
        setStatus("success");
      })
      .catch(() => {
        setData(getFallbackTeamPlayers(safeTeamName));
        setStatus("error");
      });
  }, [teamName, teamId]);

  return { data, status };
}
