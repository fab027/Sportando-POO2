import type {
  PlayerDetail,
  PlayerSearchResult,
  SofaMatch,
  SofaTeamStanding,
  SofaTopPlayer,
  TeamPlayer,
  TodayMatch,
} from "@/services/sofaScoreService";

export const getFallbackStandings = (_leagueUrl?: string): SofaTeamStanding[] => [];

export const getFallbackMatches = (_leagueUrl?: string): { lastMatches: SofaMatch[]; nextMatches: SofaMatch[] } => ({
  lastMatches: [],
  nextMatches: [],
});

export const getFallbackPlayerSearch = (_query?: string): PlayerSearchResult[] => [];

const fallbackPlayerId = (playerUrl?: string) => {
  const match = playerUrl?.match(/\/player\/[^/]+\/(\d+)/i) || playerUrl?.match(/\/(\d+)(?:[/?#].*)?$/);
  return match ? Number(match[1]) : null;
};

export const getFallbackPlayerDetail = (playerUrl?: string): PlayerDetail => ({
  id: fallbackPlayerId(playerUrl),
  name: "Dados indisponiveis",
  team: "",
  position: "",
  nationality: "",
  age: null,
  height: "",
  foot: "",
  shirtNumber: null,
  seasons: [],
});

export const getFallbackTeamPlayers = (_teamName?: string): TeamPlayer[] => [];

export const getFallbackTodayMatches = (): TodayMatch[] => [];

export const getFallbackTopPlayers = (_metric?: "goals" | "assists"): SofaTopPlayer[] => [];
