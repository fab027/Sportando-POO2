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
} from "@/services/sofaScoreService";

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
export function useStandings(leagueUrl: string) {
  const [data, setData] = useState<SofaTeamStanding[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await cached(`standings_${leagueUrl}`, () =>
        sofaScoreService.getStandings(leagueUrl)
      );
      setData(res.teams);
      setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar classificação");
      setStatus("error");
    }
  }, [leagueUrl]);

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
      const [last, next] = await Promise.all([
        cached(`last_v6_${leagueUrl}`, () => sofaScoreService.getLastMatches(leagueUrl)),
        cached(`next_v6_${leagueUrl}`, () => sofaScoreService.getNextMatches(leagueUrl)),
      ]);
      const nowSec = Math.floor(Date.now() / 1000);
      // Defensive client-side sanity filter (case an old cache slipped through)
      const cleanLast = last
        .filter((m) => m.startTimestamp && m.startTimestamp < nowSec)
        .sort((a, b) => b.startTimestamp - a.startTimestamp);
      const cleanNext = next
        .filter((m) => m.startTimestamp && m.startTimestamp >= nowSec - 3600)
        .sort((a, b) => a.startTimestamp - b.startTimestamp);
      setLastMatches(cleanLast);
      setNextMatches(cleanNext);
      setStatus("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar partidas");
      setStatus("error");
    }
  }, [leagueUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const allMatches: SofaMatch[] = [
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
      const key = "live_v6_all";
      const hit = cache[key];
      let res: SofaLiveMatch[];
      if (hit && Date.now() - hit.ts < 15_000) {
        res = hit.data as SofaLiveMatch[];
      } else {
        res = await sofaScoreService.getLiveMatches();
        cache[key] = { data: res, ts: Date.now() };
      }
      setData(res);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 25_000);
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
      const res = await cached("today_matches", () => sofaScoreService.getTodayMatches());
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

// ─── Player Search ────────────────────────────────────────────────────────────
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
      const res = await cached(`player_search_v3_${query}`, () =>
        sofaScoreService.searchPlayer(query)
      );
      setResults(res);
      setStatus("success");
    } catch {
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
    cached(`player_${playerUrl}`, () => sofaScoreService.getPlayerStats(playerUrl))
      .then((res) => {
        setData(res);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
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
        setData(res);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [teamName]);

  return { data, status };
}
