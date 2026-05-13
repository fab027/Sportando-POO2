/* eslint-disable @typescript-eslint/no-explicit-any */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SPORTS_DATA_URL = `${SUPABASE_URL}/functions/v1/sports-data`;
const SOFASCORE_PROXY_URL = "/sofascore-api";
const SPORTS_DATA_TIMEOUT_MS = 4000;

const TOP_FOOTBALL_TOURNAMENTS = new Set([17, 8, 23, 35, 34, 325, 390, 373, 384, 480]);

async function sofaFetch(path: string) {
  const res = await fetch(`${SOFASCORE_PROXY_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SofaScore HTTP ${res.status}`);
  return res.json();
}

function uniqueTournamentIdFromUrl(leagueUrl: string) {
  const match = leagueUrl.match(/\/(\d+)(?:[/?#].*)?$/);
  if (!match) throw new Error("URL de liga inválida");
  return Number(match[1]);
}

async function getCurrentSeasonId(uniqueTournamentId: number) {
  const data = await sofaFetch(`/unique-tournament/${uniqueTournamentId}/seasons`);
  const season = data?.seasons?.[0];
  if (!season?.id) throw new Error("Temporada não encontrada");
  return Number(season.id);
}

function normalizeStatus(event: any) {
  if (event?.status?.type === "finished") return "Finished";
  if (event?.status?.type === "inprogress") return "Live";
  if (event?.status?.type === "notstarted") return "Scheduled";
  return event?.status?.description || "Scheduled";
}

function mapEvent(event: any): SofaMatch {
  return {
    id: event.id,
    homeTeam: event.homeTeam?.name || event.homeTeam?.shortName || "Unknown",
    awayTeam: event.awayTeam?.name || event.awayTeam?.shortName || "Unknown",
    homeScore: typeof event.homeScore?.current === "number" ? event.homeScore.current : null,
    awayScore: typeof event.awayScore?.current === "number" ? event.awayScore.current : null,
    status: normalizeStatus(event),
    startTimestamp: event.startTimestamp || 0,
    tournament: event.tournament?.uniqueTournament?.name || event.tournament?.name || "Desconhecido",
    tournamentId: event.tournament?.uniqueTournament?.id || null,
    roundInfo: typeof event.roundInfo?.round === "number" ? event.roundInfo.round : null,
    roundName: event.roundInfo?.name || event.roundInfo?.slug || null,
  };
}

function getLiveMinute(event: any) {
  const description = String(event?.status?.description || "").toLowerCase();
  if (description.includes("half")) return "HT";
  const time = event?.statusTime || event?.time;
  const timestamp = Number(time?.timestamp || time?.currentPeriodStartTimestamp || 0);
  const initial = Number(time?.initial || 0);
  const max = Number(time?.max || 0);
  if (!timestamp) return event?.status?.description || null;
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  const total = initial + elapsed;
  const minute = Math.max(1, Math.floor(total / 60) + 1);
  const normalMinute = max ? Math.floor(max / 60) : 90;
  if (max && total > max) return `${normalMinute}+${Math.floor((total - max) / 60) + 1}'`;
  return `${minute}'`;
}

function eventCountry(event: any) {
  return (
    event?.tournament?.category?.name ||
    event?.tournament?.uniqueTournament?.category?.name ||
    event?.category?.name ||
    "Outros"
  );
}

const mapPosition = (position?: string) => {
  const p = String(position || "").toUpperCase();
  if (p === "G") return "Goalkeeper";
  if (p === "D") return "Defender";
  if (p === "M") return "Midfielder";
  if (p === "F") return "Forward";
  return position || "";
};

const playerUrl = (player: any) =>
  player?.slug && player?.id ? `https://www.sofascore.com/player/${player.slug}/${player.id}` : "";

const extractPlayerId = (url: string) => {
  const match = url.match(/\/player\/[^/]+\/(\d+)/i) || url.match(/\/(\d+)(?:[/?#].*)?$/);
  return match ? Number(match[1]) : null;
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const playerAge = (player: any) =>
  player?.dateOfBirthTimestamp
    ? Math.floor((Date.now() - player.dateOfBirthTimestamp * 1000) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

const isMaleFootballPlayer = (player: any) =>
  player?.id &&
  (player?.sport?.slug === "football" || player?.team?.sport?.slug === "football") &&
  player?.gender !== "F" &&
  player?.team?.gender !== "F";

const mapSearchPlayer = (player: any, query: string): PlayerSearchResult => ({
  id: player.id,
  name: player.name || player.shortName || query,
  url: playerUrl(player),
  description: [mapPosition(player.position), player.team?.name, player.country?.name].filter(Boolean).join(" - "),
  imageUrl: `https://api.sofascore.app/api/v1/player/${player.id}/image`,
  team: player.team?.name || "",
  age: playerAge(player),
});

const searchPlayerScore = (player: any, query: string) => {
  const q = normalizeText(query);
  const name = normalizeText(player.name || player.shortName || "");
  let score = Number(player.userCount || 0);
  if (name === q) score += 100000;
  else if (name.startsWith(q)) score += 50000;
  else if (name.includes(q)) score += 20000;
  for (const token of q.split(/\s+/).filter(Boolean)) {
    if (name.includes(token)) score += 5000;
  }
  if (player.team?.name) score += 500;
  return score;
};

const extractPlayersFromSearch = (data: any, query: string) => {
  const items = Array.isArray(data?.results) ? data.results : [];
  return items
    .map((item: any) => (item?.type === "player" ? item.entity : item?.entity || item?.player || item))
    .filter(isMaleFootballPlayer)
    .filter((player: any) => playerUrl(player))
    .map((player: any) => ({ player, score: searchPlayerScore(player, query) }));
};

const playerSeasonPairs = (seasonsData: any, limit = 12) => {
  const groups = Array.isArray(seasonsData?.uniqueTournamentSeasons)
    ? seasonsData.uniqueTournamentSeasons
    : [];
  const seen = new Set<string>();
  const pairs: { uniqueTournament: any; season: any }[] = [];

  for (const group of groups) {
    const uniqueTournament = group?.uniqueTournament;
    const seasons = Array.isArray(group?.seasons) ? group.seasons : group?.season ? [group.season] : [];
    for (const season of seasons.slice(0, 3)) {
      if (!uniqueTournament?.id || !season?.id) continue;
      const key = `${uniqueTournament.id}:${season.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ uniqueTournament, season });
      if (pairs.length >= limit) return pairs;
    }
  }

  return pairs;
};

const mapSeasonStats = (statsData: any, pair: { uniqueTournament: any; season: any }, player: any): PlayerSeasonStats | null => {
  const stats = statsData?.statistics;
  if (!stats) return null;
  const matchesPlayed = Number(stats.appearances ?? stats.matchesStarted ?? stats.countRating ?? 0);
  const minutes = Number(stats.minutesPlayed ?? 0);
  const goals = Number(stats.goals ?? 0);
  const assists = Number(stats.assists ?? 0);

  return {
    season: pair.season?.year || pair.season?.name || "",
    tournament: pair.uniqueTournament?.name || "",
    team: statsData?.team?.name || player.team?.name || "",
    matchesPlayed,
    starts: Number(stats.matchesStarted ?? 0),
    minutes,
    goals,
    assists,
    rating: Number(stats.rating ?? 0),
    yellowCards: Number(stats.yellowCards ?? 0),
    redCards: Number(stats.redCards ?? 0),
    shotsOnTarget: Number(stats.shotsOnTarget ?? 0),
    totalShots: Number(stats.totalShots ?? 0),
    keyPasses: Number(stats.keyPasses ?? 0),
    passAccuracy: Number(stats.accuratePassesPercentage ?? 0),
    expectedGoals: Number(stats.expectedGoals ?? 0),
    expectedAssists: Number(stats.expectedAssists ?? 0),
  };
};

async function getPlayerSeasons(playerId: number, player: any) {
  const seasonsData = await sofaFetch(`/player/${playerId}/statistics/seasons`).catch(() => ({
    uniqueTournamentSeasons: [],
  }));
  const pairs = playerSeasonPairs(seasonsData);
  const settled = await Promise.allSettled(
    pairs.map(async (pair) => {
      const statsData = await sofaFetch(
        `/player/${playerId}/unique-tournament/${pair.uniqueTournament.id}/season/${pair.season.id}/statistics/overall`
      );
      return mapSeasonStats(statsData, pair, player);
    })
  );

  return settled
    .filter((entry): entry is PromiseFulfilledResult<PlayerSeasonStats | null> => entry.status === "fulfilled")
    .map((entry) => entry.value)
    .filter((season): season is PlayerSeasonStats => Boolean(season))
    .filter((season) => season.matchesPlayed > 0 || season.minutes > 0 || season.goals > 0 || season.assists > 0);
}

function todayLocalIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function callLocalSofaScore(body: Record<string, unknown>) {
  const action = body.action;

  if (action === "standings") {
    const tournamentId = uniqueTournamentIdFromUrl(String(body.leagueUrl));
    const seasonId = await getCurrentSeasonId(tournamentId);
    const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`);
    const standings = Array.isArray(data?.standings) ? data.standings : [];
    const rows = standings.flatMap((standing: any) => {
      const groupName = standing?.name || standing?.groupName || standing?.tournament?.name || null;
      return (Array.isArray(standing?.rows) ? standing.rows : []).map((row: any) => ({ row, groupName }));
    });
    return {
      format: standings.length > 1 ? "groups" : "table",
      groups: standings.map((standing: any) => standing?.name || standing?.groupName).filter(Boolean),
      teams: rows.map(({ row, groupName }: any, i: number): SofaTeamStanding => ({
        position: row.position || i + 1,
        id: row.team?.id || row.id || i + 1000,
        name: row.team?.name || "Unknown",
        shortName: row.team?.shortName || row.team?.nameCode || (row.team?.name || "UNK").slice(0, 3),
        groupName,
        played: row.matches || 0,
        wins: row.wins || 0,
        draws: row.draws || 0,
        losses: row.losses || 0,
        scored: row.scoresFor || 0,
        conceded: row.scoresAgainst || 0,
        points: row.points || 0,
      })),
    };
  }

  if (action === "matches_last" || action === "matches_next") {
    const tournamentId = uniqueTournamentIdFromUrl(String(body.leagueUrl));
    const seasonId = await getCurrentSeasonId(tournamentId);
    const endpoint = action === "matches_last" ? "last" : "next";
    const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/events/${endpoint}/0`);
    const events = Array.isArray(data?.events) ? data.events : [];
    return events
      .map(mapEvent)
      .sort((a, b) => (endpoint === "last" ? b.startTimestamp - a.startTimestamp : a.startTimestamp - b.startTimestamp));
  }

  if (action === "live") {
    const data = await sofaFetch("/sport/football/events/live");
    const events = Array.isArray(data?.events) ? data.events : [];
    return events
      .filter((event: any) => event?.status?.type === "inprogress")
      .filter((event: any) => TOP_FOOTBALL_TOURNAMENTS.has(event?.tournament?.uniqueTournament?.id))
      .map((event: any): SofaLiveMatch => ({
        id: event.id,
        homeTeam: event.homeTeam?.name || event.homeTeam?.shortName || "Unknown",
        awayTeam: event.awayTeam?.name || event.awayTeam?.shortName || "Unknown",
        homeScore: event.homeScore?.current ?? 0,
        awayScore: event.awayScore?.current ?? 0,
        status: "Live",
        minute: getLiveMinute(event),
        tournament: event.tournament?.uniqueTournament?.name || event.tournament?.name || "Desconhecido",
        tournamentId: event.tournament?.uniqueTournament?.id || null,
        country: eventCountry(event),
      }));
  }

  if (action === "today_matches") {
    const data = await sofaFetch(`/sport/football/scheduled-events/${todayLocalIso()}`);
    const events = Array.isArray(data?.events) ? data.events : [];
    return events
      .filter((event: any) => TOP_FOOTBALL_TOURNAMENTS.has(event?.tournament?.uniqueTournament?.id))
      .sort((a: any, b: any) => (a.startTimestamp || 0) - (b.startTimestamp || 0))
      .map((event: any): TodayMatch => {
        const mapped = mapEvent(event);
        return {
          id: mapped.id,
          homeTeam: mapped.homeTeam,
          awayTeam: mapped.awayTeam,
          homeScore: mapped.homeScore,
          awayScore: mapped.awayScore,
          status: mapped.status,
          time:
            mapped.status === "Live"
              ? getLiveMinute(event)
              : new Date(mapped.startTimestamp * 1000).toLocaleTimeString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
          tournament: mapped.tournament,
        };
      });
  }

  if (action === "top_players") {
    const tournamentId = uniqueTournamentIdFromUrl(String(body.leagueUrl));
    const seasonId = await getCurrentSeasonId(tournamentId);
    const metric = String(body.metric || "goals");
    const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/top-players/overall`);
    const players = Array.isArray(data?.topPlayers?.[metric]) ? data.topPlayers[metric] : [];
    return players.slice(0, 12).map((item: any): SofaTopPlayer => ({
      id: item.player?.id || item.id,
      name: item.player?.shortName || item.player?.name || "Jogador",
      fullName: item.player?.name || item.player?.shortName || "Jogador",
      team: item.team?.shortName || item.team?.name || "",
      value: Number(item.statistics?.[metric] ?? 0),
      goals: Number(item.statistics?.goals ?? 0),
      assists: Number(item.statistics?.assists ?? 0),
      appearances: Number(item.statistics?.appearances ?? item.statistics?.matchesStarted ?? item.statistics?.countRating ?? 0),
      rating: Number(item.statistics?.rating ?? 0),
    }));
  }

  if (action === "player_search") {
    const query = String(body.query);
    const [playersData, allData] = await Promise.all([
      sofaFetch(`/search/players?q=${encodeURIComponent(query)}&page=0`).catch(() => ({ results: [] })),
      sofaFetch(`/search/all?q=${encodeURIComponent(query)}&page=0`).catch(() => ({ results: [] })),
    ]);
    const byId = new Map<number, { player: any; score: number }>();
    for (const item of [...extractPlayersFromSearch(playersData, query), ...extractPlayersFromSearch(allData, query)]) {
      const current = byId.get(item.player.id);
      if (!current || item.score > current.score) byId.set(item.player.id, item);
    }
    return [...byId.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ player }) => mapSearchPlayer(player, query));
  }

  if (action === "team_players") {
    const searchData = await sofaFetch(`/search/teams?q=${encodeURIComponent(String(body.teamName))}&page=0`);
    const team = (Array.isArray(searchData?.results) ? searchData.results : [])
      .map((item: any) => item.entity)
      .find((entity: any) => entity?.sport?.slug === "football" && entity?.gender !== "F");
    if (!team?.id) return [];
    const playersData = await sofaFetch(`/team/${team.id}/players`);
    return (Array.isArray(playersData?.players) ? playersData.players : []).map((row: any): TeamPlayer => {
      const player = row.player || row;
      return {
        id: player.id,
        name: player.name || player.shortName || "",
        position: mapPosition(player.position),
        shirtNumber: player.jerseyNumber ? Number(player.jerseyNumber) : null,
        nationality: player.country?.name || "",
        age: player.dateOfBirthTimestamp
          ? Math.floor((Date.now() - player.dateOfBirthTimestamp * 1000) / (365.25 * 24 * 60 * 60 * 1000))
          : null,
        url: playerUrl(player),
      };
    });
  }

  if (action === "player_stats") {
    const playerId = extractPlayerId(String(body.playerUrl));
    if (!playerId) throw new Error("URL de jogador inválida");
    const detail = await sofaFetch(`/player/${playerId}`);
    const player = detail?.player || {};
    const seasons = await getPlayerSeasons(playerId, player);
    return {
      name: player.name || player.shortName || "",
      team: player.team?.name || "",
      position: mapPosition(player.position),
      nationality: player.country?.name || "",
      age: playerAge(player),
      height: player.height ? `${player.height} cm` : "",
      foot: player.preferredFoot || "",
      shirtNumber: player.jerseyNumber ? Number(player.jerseyNumber) : null,
      seasons,
    } satisfies PlayerDetail;
  }

  throw new Error("Ação sem fallback local");
}

async function callSportsData(body: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    try {
      return await callLocalSofaScore(body);
    } catch {
      // Some legacy actions still only exist in the Edge Function.
    }
  }

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SPORTS_DATA_TIMEOUT_MS);
    const res = await fetch(SPORTS_DATA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timeout));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (error) {
    if (import.meta.env.DEV) return callLocalSofaScore(body);
    throw error;
  }
}

export type SofaTeamStanding = {
  position: number;
  id: number;
  name: string;
  shortName: string;
  groupName?: string | null;
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
  tournamentId?: number | null;
  roundInfo: number | null;
  roundName?: string | null;
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
  tournamentId?: number | null;
  country?: string;
};

export type SofaTopPlayer = {
  id: number;
  name: string;
  fullName: string;
  team: string;
  value: number;
  goals: number;
  assists: number;
  appearances: number;
  rating: number;
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
  tournament?: string;
  team: string;
  matchesPlayed: number;
  starts?: number;
  minutes: number;
  goals: number;
  assists: number;
  rating: number;
  yellowCards?: number;
  redCards?: number;
  shotsOnTarget?: number;
  totalShots?: number;
  keyPasses?: number;
  passAccuracy?: number;
  expectedGoals?: number;
  expectedAssists?: number;
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

  async getTopPlayers(leagueUrl: string, metric: "goals" | "assists"): Promise<SofaTopPlayer[]> {
    return callSportsData({ action: "top_players", leagueUrl, metric });
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
