const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SPORTS_DATA_URL = `${SUPABASE_URL}/functions/v1/sports-data`;

async function callSportsData(body: Record<string, unknown>) {
  const res = await fetch(SPORTS_DATA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export type SofaTeamStanding = {
  position: number;
  id: number;
  name: string;
  shortName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  conceded: number;
  points: number;
};

export type SofaMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startTimestamp: number;
  tournament: string;
  roundInfo: number | null;
};

export type SofaLiveMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  minute: string | null;
  tournament: string;
};

export type TodayMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  time: string | null;
  tournament: string;
};

export type PlayerSearchResult = {
  id: number;
  name: string;
  url: string;
  description: string;
  imageUrl?: string | null;
  team?: string;
  age?: number | null;
};

export type PlayerSeasonStats = {
  season: string;
  team: string;
  matchesPlayed: number;
  minutes: number;
  goals: number;
  assists: number;
  rating: number;
};

export type PlayerDetail = {
  name: string;
  team: string;
  position: string;
  nationality: string;
  age: number | null;
  height: string;
  foot: string;
  shirtNumber: number | null;
  seasons: PlayerSeasonStats[];
};

export type TeamPlayer = {
  id: number;
  name: string;
  position: string;
  shirtNumber: number | null;
  nationality: string;
  age: number | null;
  url: string;
};

export type OddsMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  bookmaker: string;
  date: string | null;
  tournament: string;
};

export const sofaScoreService = {
  async getStandings(leagueUrl: string): Promise<{ teams: SofaTeamStanding[] }> {
    return callSportsData({ action: "standings", leagueUrl });
  },

  async getLastMatches(leagueUrl: string): Promise<SofaMatch[]> {
    return callSportsData({ action: "matches_last", leagueUrl });
  },

  async getNextMatches(leagueUrl: string): Promise<SofaMatch[]> {
    return callSportsData({ action: "matches_next", leagueUrl });
  },

  async getLiveMatches(): Promise<SofaLiveMatch[]> {
    return callSportsData({ action: "live" });
  },

  async getTodayMatches(): Promise<TodayMatch[]> {
    return callSportsData({ action: "today_matches" });
  },

  async searchPlayer(query: string): Promise<PlayerSearchResult[]> {
    return callSportsData({ action: "player_search", query });
  },

  async getPlayerStats(playerUrl: string): Promise<PlayerDetail> {
    return callSportsData({ action: "player_stats", playerUrl });
  },

  async getOdds(): Promise<OddsMatch[]> {
    return callSportsData({ action: "odds" });
  },

  async getTeamPlayers(teamName: string): Promise<TeamPlayer[]> {
    return callSportsData({ action: "team_players", teamName });
  },
};
