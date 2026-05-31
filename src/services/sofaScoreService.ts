/* eslint-disable @typescript-eslint/no-explicit-any */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SPORTS_DATA_URL = `${SUPABASE_URL}/functions/v1/sports-data`;
const SOFASCORE_PROXY_URL = "/sofascore-api";
const SCRAPERFC_DATA_URL = "/scraperfc-api/sports-data";
const SCRAPERFC_RAW_URL = "/scraperfc-api/sofascore";
const SPORTS_DATA_TIMEOUT_MS = 4000;
const SCRAPERFC_TIMEOUT_MS = 25000;
const SCRAPERFC_COOLDOWN_MS = 60_000;
let scraperFcUnavailableUntil = 0;

const teamImageUrl = (teamId?: number | null) =>
  teamId ? `https://api.sofascore.app/api/v1/team/${teamId}/image` : null;
const playerImageUrl = (playerId?: number | null) =>
  playerId ? `https://api.sofascore.app/api/v1/player/${playerId}/image` : null;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = SPORTS_DATA_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => window.clearTimeout(timeout));
}

export async function fetchSofaScoreJson(path: string) {
  try {
    const res = await fetch(`${SOFASCORE_PROXY_URL}${path}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`SofaScore HTTP ${res.status}`);
    return res.json();
  } catch (directError) {
    if (!import.meta.env.DEV || Date.now() < scraperFcUnavailableUntil) {
      throw directError;
    }

    try {
      const res = await fetchWithTimeout(
        `${SCRAPERFC_RAW_URL}?path=${encodeURIComponent(path)}`,
        { headers: { Accept: "application/json" } },
        SCRAPERFC_TIMEOUT_MS
      );
      if (!res.ok) throw new Error(`ScraperFC HTTP ${res.status}`);
      return res.json();
    } catch {
      scraperFcUnavailableUntil = Date.now() + SCRAPERFC_COOLDOWN_MS;
      throw directError;
    }
  }
}

async function sofaFetch(path: string) {
  return fetchSofaScoreJson(path);
}

async function callScraperFcSportsData(body: Record<string, unknown>) {
  if (!import.meta.env.DEV || Date.now() < scraperFcUnavailableUntil) {
    throw new Error("ScraperFC indisponivel");
  }

  try {
    const res = await fetchWithTimeout(
      SCRAPERFC_DATA_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      },
      SCRAPERFC_TIMEOUT_MS
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `ScraperFC HTTP ${res.status}`);
    }
    return res.json();
  } catch (error) {
    scraperFcUnavailableUntil = Date.now() + SCRAPERFC_COOLDOWN_MS;
    throw error;
  }
}

async function callLegacySportsData(body: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    try {
      return await callLocalSofaScore(body);
    } catch {
      // Some legacy actions still only exist in the Edge Function.
    }
  }

  const res = await fetchWithTimeout(SPORTS_DATA_URL, {
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

const periodLabel = (period?: number | null) => {
  if (period === 1) return "1T";
  if (period === 2) return "2T";
  return null;
};

const periodFromText = (value: string) => {
  const text = value.toLowerCase();
  if (/(^|\s)(2t|2o tempo|2nd half|second half|segundo tempo)(\s|$)/.test(text)) return 2;
  if (/(^|\s)(1t|1o tempo|1st half|first half|primeiro tempo)(\s|$)/.test(text)) return 1;
  return null;
};

const isHalftimeText = (value: string) =>
  /(^|\s)(ht|half[-\s]?time|interval|intervalo|break|pause)(\s|$)/.test(value.toLowerCase());

const formatFootballMinute = (totalSeconds: number, period?: number | null) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minute = Math.max(1, Math.floor(safeSeconds / 60) + 1);
  const regularLimit = period === 1 ? 45 : period === 2 || minute > 45 ? 90 : 45;
  const regularSeconds = regularLimit * 60;
  if (safeSeconds > regularSeconds) {
    return `${regularLimit}+${Math.floor((safeSeconds - regularSeconds) / 60) + 1}'`;
  }
  return `${minute}'`;
};

function mapEvent(event: any): SofaMatch {
  return {
    id: event.id,
    homeTeamId: event.homeTeam?.id || null,
    awayTeamId: event.awayTeam?.id || null,
    homeTeam: event.homeTeam?.name || event.homeTeam?.shortName || "Unknown",
    awayTeam: event.awayTeam?.name || event.awayTeam?.shortName || "Unknown",
    homeTeamImageUrl: teamImageUrl(event.homeTeam?.id),
    awayTeamImageUrl: teamImageUrl(event.awayTeam?.id),
    homeScore: typeof event.homeScore?.current === "number" ? event.homeScore.current : null,
    awayScore: typeof event.awayScore?.current === "number" ? event.awayScore.current : null,
    status: normalizeStatus(event),
    startTimestamp: event.startTimestamp || 0,
    tournament: event.tournament?.uniqueTournament?.name || event.tournament?.name || "Desconhecido",
    tournamentId: event.tournament?.uniqueTournament?.id || null,
    roundInfo: typeof event.roundInfo?.round === "number" ? event.roundInfo.round : null,
    roundName: event.roundInfo?.name || event.roundInfo?.slug || null,
    venue: event.venue?.stadium?.name || event.venue?.name || event.venue?.city?.name || null,
  };
}

function getLiveClock(event: any) {
  const description = String(event?.status?.description || "").trim();
  const normalizedDescription = description.toLowerCase();
  if (isHalftimeText(normalizedDescription)) {
    return { minute: null, period: "Intervalo" };
  }

  const time = event?.time || {};
  const statusTime = event?.statusTime || {};
  const timestamp = Number(
    time?.currentPeriodStartTimestamp ||
      statusTime?.currentPeriodStartTimestamp ||
      statusTime?.timestamp ||
      time?.timestamp ||
      0
  );
  const periodNumber = Number(time?.period ?? statusTime?.period ?? 0);
  const initialFromApi = Number(time?.initial ?? statusTime?.initial ?? 0);
  const played = Number(time?.played ?? statusTime?.played ?? 0);
  const extra = Number(time?.extra ?? statusTime?.extra ?? 0);
  const inferredPeriod =
    periodNumber ||
    periodFromText(description) ||
    (initialFromApi >= 45 * 60 ? 2 : event?.status?.type === "inprogress" ? 1 : null);
  const period = periodLabel(inferredPeriod) || description || null;

  if (played > 0) {
    const totalFromPlayed =
      initialFromApi > 0 && played <= 60 * 60
        ? initialFromApi + played + extra
        : played + extra;
    const periodFromPlayed = inferredPeriod || (totalFromPlayed > 45 * 60 ? 2 : 1);
    return {
      minute: formatFootballMinute(totalFromPlayed, periodFromPlayed),
      period: periodLabel(periodFromPlayed) || period,
    };
  }

  if (!timestamp) return { minute: null, period };

  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  const initial = initialFromApi || (inferredPeriod === 2 ? 45 * 60 : 0);
  const total = initial + elapsed;
  const periodFromElapsed = inferredPeriod || (total > 45 * 60 ? 2 : 1);
  return {
    minute: formatFootballMinute(total, periodFromElapsed),
    period: periodLabel(periodFromElapsed) || period,
  };
}

function eventCountry(event: any) {
  return (
    event?.tournament?.category?.name ||
    event?.tournament?.uniqueTournament?.category?.name ||
    event?.category?.name ||
    "Outros"
  );
}

function mapGoalIncident(incident: any): SofaGoalIncident {
  return {
    id: String(incident?.id ?? `${incident?.time ?? "goal"}-${incident?.homeScore ?? ""}-${incident?.awayScore ?? ""}`),
    playerName: incident?.player?.name || incident?.player?.shortName || incident?.playerName || "",
    teamSide: typeof incident?.isHome === "boolean" ? (incident.isHome ? "home" : "away") : null,
    homeScore: typeof incident?.homeScore === "number" ? incident.homeScore : null,
    awayScore: typeof incident?.awayScore === "number" ? incident.awayScore : null,
    time: typeof incident?.time === "number" ? incident.time : null,
    incidentClass: incident?.incidentClass || null,
  };
}

const mapPosition = (position?: string) => {
  const p = String(position || "").toUpperCase();
  const positions: Record<string, string> = {
    G: "Goleiro",
    GK: "Goleiro",
    D: "Defensor",
    CB: "Zagueiro",
    DC: "Zagueiro",
    LB: "Lateral Esquerdo",
    LE: "Lateral Esquerdo",
    RB: "Lateral Direito",
    LD: "Lateral Direito",
    LWB: "Ala Esquerdo",
    RWB: "Ala Direito",
    M: "Meio-campista",
    DM: "Volante",
    CDM: "Volante",
    CM: "Meia Central",
    AM: "Meia Ofensivo",
    CAM: "Meia Ofensivo",
    LM: "Meia Esquerdo",
    RM: "Meia Direito",
    F: "Atacante",
    ST: "Centroavante",
    CF: "Segundo Atacante",
    LW: "Ponta Esquerda",
    RW: "Ponta Direita",
  };
  if (positions[p]) return positions[p];
  if (p === "DEFENDER") return "Defensor";
  if (p === "MIDFIELDER") return "Meio-campista";
  if (p === "ATTACKER" || p === "FORWARD") return "Atacante";
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

const findFootballTeam = async (teamName: string) => {
  const searchData = await sofaFetch(`/search/teams?q=${encodeURIComponent(teamName)}&page=0`);
  return (Array.isArray(searchData?.results) ? searchData.results : [])
    .map((item: any) => item.entity)
    .find((entity: any) => entity?.sport?.slug === "football" && entity?.gender !== "F");
};

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

const seasonSortValue = (season: string) => {
  const years = season.match(/\d{2,4}/g)?.map((value) => Number(value.length === 2 ? `20${value}` : value)) || [];
  return years.length ? Math.max(...years) : 0;
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
    teamImageUrl: teamImageUrl(statsData?.team?.id || player.team?.id),
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
    .filter((season) => season.matchesPlayed > 0 || season.minutes > 0 || season.goals > 0 || season.assists > 0)
    .sort((a, b) => seasonSortValue(b.season) - seasonSortValue(a.season));
}

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

const isEventOnLocalDate = (event: any, localIsoDate: string) =>
  saoPauloIsoFromTimestamp(Number(event?.startTimestamp || 0)) === localIsoDate;

async function callLocalSofaScore(body: Record<string, unknown>) {
  const action = body.action;

  if (action === "standings") {
    const tournamentId = uniqueTournamentIdFromUrl(String(body.leagueUrl));
    const seasonId = await getCurrentSeasonId(tournamentId);
    const tableType = ["total", "home", "away"].includes(String(body.tableType)) ? String(body.tableType) : "total";
    const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/standings/${tableType}`);
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
        imageUrl: teamImageUrl(row.team?.id || row.id),
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
      .map((event: any): SofaLiveMatch => ({
        id: event.id,
        homeTeamId: event.homeTeam?.id || null,
        awayTeamId: event.awayTeam?.id || null,
        homeTeam: event.homeTeam?.name || event.homeTeam?.shortName || "Unknown",
        awayTeam: event.awayTeam?.name || event.awayTeam?.shortName || "Unknown",
        homeTeamImageUrl: teamImageUrl(event.homeTeam?.id),
        awayTeamImageUrl: teamImageUrl(event.awayTeam?.id),
        homeScore: event.homeScore?.current ?? 0,
        awayScore: event.awayScore?.current ?? 0,
        status: "Live",
        ...getLiveClock(event),
        tournament: event.tournament?.uniqueTournament?.name || event.tournament?.name || "Desconhecido",
        tournamentId: event.tournament?.uniqueTournament?.id || null,
        country: eventCountry(event),
      }));
  }

  if (action === "today_matches") {
    const todayIso = todayLocalIso();
    const data = await sofaFetch(`/sport/football/scheduled-events/${todayIso}`);
    const events = Array.isArray(data?.events) ? data.events : [];
    return events
      .filter((event: any) => isEventOnLocalDate(event, todayIso))
      .sort((a: any, b: any) => (a.startTimestamp || 0) - (b.startTimestamp || 0))
      .map((event: any): TodayMatch => {
        const mapped = mapEvent(event);
        const liveClock = getLiveClock(event);
        return {
          id: mapped.id,
          homeTeamId: mapped.homeTeamId,
          awayTeamId: mapped.awayTeamId,
          homeTeam: mapped.homeTeam,
          awayTeam: mapped.awayTeam,
          homeTeamImageUrl: mapped.homeTeamImageUrl,
          awayTeamImageUrl: mapped.awayTeamImageUrl,
          homeScore: mapped.homeScore,
          awayScore: mapped.awayScore,
          status: mapped.status,
          startTimestamp: mapped.startTimestamp,
          time:
            mapped.status === "Live"
              ? liveClock.minute || liveClock.period
              : new Date(mapped.startTimestamp * 1000).toLocaleTimeString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
          tournament: mapped.tournament,
          country: eventCountry(event),
          venue: mapped.venue,
        };
      });
  }

  if (action === "event_goal_incidents") {
    const eventId = Number(body.eventId);
    if (!eventId) throw new Error("eventId obrigatorio");
    const data = await sofaFetch(`/event/${eventId}/incidents`);
    const incidents = Array.isArray(data?.incidents) ? data.incidents : [];
    return incidents
      .filter((incident: any) => String(incident?.incidentType || "").toLowerCase() === "goal")
      .map(mapGoalIncident)
      .sort((a: SofaGoalIncident, b: SofaGoalIncident) => (b.time || 0) - (a.time || 0));
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
      imageUrl: playerImageUrl(item.player?.id || item.id),
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
    const team = await findFootballTeam(String(body.teamName));
    if (!team?.id) return [];
    const playersData = await sofaFetch(`/team/${team.id}/players`);
    return (Array.isArray(playersData?.players) ? playersData.players : []).map((row: any): TeamPlayer => {
      const player = row.player || row;
      return {
        id: player.id,
        name: player.name || player.shortName || "",
        imageUrl: playerImageUrl(player.id),
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

  if (action === "team_next_matches") {
    const teamIds = Array.isArray(body.teamIds)
      ? body.teamIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    const teamNames = Array.isArray(body.teamNames)
      ? body.teamNames.map((name) => String(name).trim()).filter(Boolean)
      : [];
    const teamsByName = await Promise.allSettled(teamNames.map((name) => findFootballTeam(name)));
    const resolvedIds = teamsByName
      .filter((entry): entry is PromiseFulfilledResult<any> => entry.status === "fulfilled")
      .map((entry) => Number(entry.value?.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const uniqueTeamIds = Array.from(new Set([...teamIds, ...resolvedIds])).slice(0, 6);
    if (uniqueTeamIds.length === 0) return [];

    const settled = await Promise.allSettled(
      uniqueTeamIds.map(async (teamId) => {
        const data = await sofaFetch(`/team/${teamId}/events/next/0`);
        return Array.isArray(data?.events) ? data.events.map(mapEvent) : [];
      })
    );
    const byId = new Map<number, SofaMatch>();
    settled.forEach((entry) => {
      if (entry.status !== "fulfilled") return;
      entry.value.forEach((match) => byId.set(match.id, match));
    });
    return Array.from(byId.values())
      .filter((match) => match.startTimestamp > 0)
      .sort((a, b) => a.startTimestamp - b.startTimestamp)
      .slice(0, 20);
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
      imageUrl: playerImageUrl(player.id),
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
  try {
    return await callLegacySportsData(body);
  } catch (error) {
    if (import.meta.env.DEV) return callScraperFcSportsData(body);
    throw error;
  }
}

export type SofaTeamStanding = {
  position: number;
  id: number;
  name: string;
  shortName: string;
  imageUrl?: string | null;
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
  homeTeamId?: number | null;
  awayTeamId?: number | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamImageUrl?: string | null;
  awayTeamImageUrl?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startTimestamp: number;
  tournament: string;
  tournamentId?: number | null;
  roundInfo: number | null;
  roundName?: string | null;
  venue?: string | null;
};

export type SofaLiveMatch = {
  id: number;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamImageUrl?: string | null;
  awayTeamImageUrl?: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
  minute: string | null;
  period?: string | null;
  tournament: string;
  tournamentId?: number | null;
  country?: string;
};

export type SofaGoalIncident = {
  id: string;
  playerName: string;
  teamSide: "home" | "away" | null;
  homeScore: number | null;
  awayScore: number | null;
  time: number | null;
  incidentClass?: string | null;
};

export type SofaTopPlayer = {
  id: number;
  name: string;
  fullName: string;
  team: string;
  teamImageUrl?: string | null;
  imageUrl?: string | null;
  value: number;
  goals: number;
  assists: number;
  appearances: number;
  rating: number;
};

export type TodayMatch = {
  id: number;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamImageUrl?: string | null;
  awayTeamImageUrl?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startTimestamp?: number;
  time: string | null;
  tournament: string;
  country?: string;
  venue?: string | null;
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
  teamImageUrl?: string | null;
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
  imageUrl?: string | null;
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
  imageUrl?: string | null;
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
  async getStandings(leagueUrl: string, tableType: "total" | "home" | "away" = "total"): Promise<{ teams: SofaTeamStanding[] }> {
    return callSportsData({ action: "standings", leagueUrl, tableType });
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

  async getGoalIncidents(eventId: number): Promise<SofaGoalIncident[]> {
    return callSportsData({ action: "event_goal_incidents", eventId });
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

  async getTeamNextMatches(teamIds: string[], teamNames: string[] = []): Promise<SofaMatch[]> {
    return callSportsData({ action: "team_next_matches", teamIds, teamNames });
  },
};
