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
const TTL = 5 * 60 * 1000;

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache[key];
  if (hit && Date.now() - hit.ts < TTL) return Promise.resolve(hit.data as T);
  return fn().then((data) => {
    cache[key] = { data, ts: Date.now() };
    return data;
  });
}

type Status = "idle" | "loading" | "success" | "error";

// ─── Standings ──────────────────────────────────────────────────────────────
export function useStandings(leagueUrl: string, tableType: "total" | "home" | "away" = "total") {
  const [data, setData] = useState<SofaTeamStanding[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await cached(`standings_${tableType}_${leagueUrl}`, () =>
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
  }, [leagueUrl, tableType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, status, error, refetch: fetchData };
}

// ─── Matches ─────────────────────────────────────────────────────────────────
export function useMatches(leagueUrl: string) {
  const [lastMatches, setLastMatches] = useState<SofaMatch[]>([]);
  const [nextMatches, setNextMatches] = useState<SofaMatch[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const [lastRaw, nextRaw] = await Promise.all([
        cached(`last_v6_${leagueUrl}`, () => sofaScoreService.getLastMatches(leagueUrl)),
        cached(`next_v6_${leagueUrl}`, () => sofaScoreService.getNextMatches(leagueUrl)),
      ]);
      const last = Array.isArray(lastRaw) ? lastRaw : [];
      const next = Array.isArray(nextRaw) ? nextRaw : [];
      const nowSec = Math.floor(Date.now() / 1000);
      const cleanLast = last
        .filter((m) => m.startTimestamp && m.startTimestamp < nowSec)
        .sort((a, b) => b.startTimestamp - a.startTimestamp);
      const cleanNext = next
        .filter((m) => m.startTimestamp && m.startTimestamp >= nowSec - 3600)
        .sort((a, b) => a.startTimestamp - b.startTimestamp);
      const fallback = getFallbackMatches(leagueUrl);
      setLastMatches(cleanLast.length > 0 ? cleanLast : fallback.lastMatches);
      setNextMatches(cleanNext.length > 0 ? cleanNext : fallback.nextMatches);
      setStatus("success");
    } catch (e) {
      const fallback = getFallbackMatches(leagueUrl);
      setLastMatches(fallback.lastMatches);
      setNextMatches(fallback.nextMatches);
      setError(e instanceof Error ? e.message : "Erro ao carregar partidas");
      setStatus("error");
    }
  }, [leagueUrl]);

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
export function useLiveMatches() {
  const [data, setData] = useState<SofaLiveMatch[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const key = "live_v9_all";
      const hit = cache[key];
      let res: SofaLiveMatch[];
      if (hit && Date.now() - hit.ts < 15_000) {
        res = hit.data as SofaLiveMatch[];
      } else {
        res = await sofaScoreService.getLiveMatches();
        cache[key] = { data: res, ts: Date.now() };
      }
      setData(Array.isArray(res) ? res : []);
      setStatus("success");
    } catch {
      setData([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { data, status, refetch: fetchData };
}

// ─── Today Matches ───────────────────────────────────────────────────────────
export function useTodayMatches() {
  const [data, setData] = useState<TodayMatch[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await cached("today_matches_v3", () => sofaScoreService.getTodayMatches());
      setData(Array.isArray(res) && res.length > 0 ? res : getFallbackTodayMatches());
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
  const [data, setData] = useState<SofaTopPlayer[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await cached(`top_players_v1_${leagueUrl}_${metric}`, () =>
        sofaScoreService.getTopPlayers(leagueUrl, metric)
      );
      setData(Array.isArray(res) && res.length > 0 ? res : getFallbackTopPlayers(metric));
      setStatus("success");
    } catch (e) {
      setData(getFallbackTopPlayers(metric));
      setError(e instanceof Error ? e.message : "Erro ao carregar ranking de jogadores");
      setStatus("error");
    }
  }, [leagueUrl, metric]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, status, error, refetch: fetchData };
}

export function usePlayerSearch() {
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const search = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    setStatus("loading");
    try {
      const res = await cached(`player_search_v8_${query}`, () =>
        sofaScoreService.searchPlayer(query)
      );
      setResults(Array.isArray(res) && res.length > 0 ? res : getFallbackPlayerSearch(query));
      setStatus("success");
    } catch {
      setResults(getFallbackPlayerSearch(query));
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
    cached(`player_stats_v4_${playerUrl}`, () => sofaScoreService.getPlayerStats(playerUrl))
      .then((res) => {
        setData(res ?? getFallbackPlayerDetail(playerUrl));
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
export function useTeamPlayers(teamName: string | null) {
  const [data, setData] = useState<TeamPlayer[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!teamName) {
      setData([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    cached(`team_players_v7_${teamName}`, () => sofaScoreService.getTeamPlayers(teamName))
      .then((res) => {
        setData(Array.isArray(res) && res.length > 0 ? res : getFallbackTeamPlayers(teamName));
        setStatus("success");
      })
      .catch(() => {
        setData(getFallbackTeamPlayers(teamName));
        setStatus("error");
      });
  }, [teamName]);

  return { data, status };
}
