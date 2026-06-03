/* eslint-disable @typescript-eslint/no-explicit-any, no-useless-escape */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const openAIChatCompletionsUrl = "https://api.openai.com/v1/chat/completions";

function requireFirecrawlKey(): string {
  // Prefer the new connector-managed key; fall back to legacy secret if present.
  const key =
    Deno.env.get("FIRECRAWL_API_KEY_1") ||
    Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY_1 not configured");
  return key;
}

const openAIChatCompletion = async (
  messages: Array<{ role: "system" | "user"; content: string }>,
  options: { responseFormat?: "json_object"; model?: string } = {}
) => {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not configured");

  return fetch(openAIChatCompletionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model || Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      messages,
      ...(options.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
    }),
  });
};

const scrapeExtract = async (
  url: string,
  prompt: string,
  schema: Record<string, unknown>,
  retries = 2
): Promise<any> => {
  const key = requireFirecrawlKey();

  for (let attempt = 0; attempt <= retries; attempt++) {
    console.log(`Scraping (attempt ${attempt + 1}): ${url}`);
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["extract"],
          extract: { schema, prompt },
          waitFor: 3000,
          timeout: 45000,
        }),
      });

      if (res.status === 408 && attempt < retries) {
        console.warn(`Timeout 408, retrying...`);
        await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Firecrawl HTTP ${res.status}:`, errText);
        throw new Error(`Firecrawl error: ${res.status}`);
      }

      const result = await res.json();
      const extracted = result.data?.extract || result.extract;
      console.log("Extracted keys:", extracted ? Object.keys(extracted) : "null");
      return extracted;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      throw err;
    }
  }
};

// Scrape markdown via Firecrawl, then ask OpenAI to structure it.
// Used when Firecrawl's native "extract" returns empty silently.
const scrapeMarkdownThenAI = async (
  url: string,
  prompt: string,
  schema: Record<string, unknown>
): Promise<any> => {
  const fcKey = requireFirecrawlKey();

  console.log(`Scraping markdown: ${url}`);
  const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 2000, timeout: 45000 }),
  });
  if (!fcRes.ok) throw new Error(`Firecrawl ${fcRes.status}`);
  const fcData = await fcRes.json();
  const markdown: string = fcData.data?.markdown || "";
  console.log(`Markdown length: ${markdown.length}`);
  if (!markdown || markdown.length < 200) return { matches: [] };

  // Truncate to keep prompt manageable
  const trimmed = markdown.slice(0, 18000);

  const aiRes = await openAIChatCompletion(
    [
      { role: "system", content: "You extract structured data from web page content. Output ONLY valid JSON matching the requested schema. Use ONLY information present in the provided content - never invent placeholders." },
      { role: "user", content: `${prompt}\n\nSchema (JSON):\n${JSON.stringify(schema)}\n\nPage content (markdown):\n${trimmed}` },
    ],
    { responseFormat: "json_object" }
  );
  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error(`OpenAI ${aiRes.status}:`, errText);
    throw new Error(`AI error: ${aiRes.status}`);
  }
  const aiData = await aiRes.json();
  const content = aiData.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    console.log(`AI extracted keys: ${Object.keys(parsed).join(",")}, matches: ${parsed.matches?.length ?? 0}`);
    return parsed;
  } catch {
    console.error("Failed to parse AI JSON:", content.slice(0, 500));
    return { matches: [] };
  }
};

const firecrawlSearch = async (query: string, limit = 5): Promise<any[]> => {
  const key = requireFirecrawlKey();

  console.log(`Searching: "${query}" (limit ${limit})`);
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Search error ${res.status}:`, errText);
    throw new Error(`Search error: ${res.status}`);
  }
  const data = await res.json();
  console.log(`Search returned ${(data.data || []).length} results`);
  return data.data || [];
};

const standingsSchema = {
  type: "object",
  properties: {
    teams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "number" },
          name: { type: "string" },
          shortName: { type: "string" },
          played: { type: "number" },
          wins: { type: "number" },
          draws: { type: "number" },
          losses: { type: "number" },
          scored: { type: "number" },
          conceded: { type: "number" },
          points: { type: "number" },
        },
      },
    },
  },
};

const todayMatchesSchema = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          homeTeam: { type: "string" },
          awayTeam: { type: "string" },
          homeScore: { type: "number" },
          awayScore: { type: "number" },
          status: { type: "string" },
          time: { type: "string" },
          tournament: { type: "string" },
        },
      },
    },
  },
};

const squadSchema = {
  type: "object",
  properties: {
    players: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          position: { type: "string" },
          shirtNumber: { type: "number" },
          nationality: { type: "string" },
          age: { type: "number" },
          url: { type: "string" },
        },
      },
    },
  },
};

const SOFASCORE_BASE_URL = "https://www.sofascore.com/api/v1";
const SEASON_EVENTS_PAGE_LIMIT = 7;
const WINDOW_EVENTS_PAGE_LIMIT = 2;
const SEASON_ROUND_BATCH_SIZE = 6;
const PLAYER_SEASON_BATCH_SIZE = 6;
const sofaFetch = async (path: string): Promise<any> => {
  const res = await fetch(`${SOFASCORE_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Referer: "https://www.sofascore.com/",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SofaScore ${res.status}: ${text.slice(0, 160)}`);
  }

  return res.json();
};

const uniqueTournamentIdFromUrl = (leagueUrl: string): number => {
  const match = leagueUrl.match(/\/(\d+)(?:[/?#].*)?$/);
  if (!match) throw new Error("Could not read SofaScore tournament id from leagueUrl");
  return Number(match[1]);
};

const getCurrentSeasonId = async (uniqueTournamentId: number): Promise<number> => {
  const data = await sofaFetch(`/unique-tournament/${uniqueTournamentId}/seasons`);
  const seasons = Array.isArray(data?.seasons) ? data.seasons : [];
  if (!seasons.length) throw new Error(`No seasons found for tournament ${uniqueTournamentId}`);
  return Number(seasons[0].id);
};

const collectRoundNumbers = (value: unknown, rounds = new Set<number>()) => {
  if (!value || typeof value !== "object") return rounds;
  if (Array.isArray(value)) {
    value.forEach((item) => collectRoundNumbers(item, rounds));
    return rounds;
  }

  const object = value as Record<string, unknown>;
  if (typeof object.round === "number") rounds.add(object.round);
  Object.values(object).forEach((item) => collectRoundNumbers(item, rounds));
  return rounds;
};

const getSeasonRoundNumbers = async (tournamentId: number, seasonId: number) => {
  const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/rounds`);
  return Array.from(collectRoundNumbers(data)).sort((a, b) => a - b);
};

const getEventsByRounds = async (tournamentId: number, seasonId: number) => {
  const roundNumbers = await getSeasonRoundNumbers(tournamentId, seasonId);
  if (!roundNumbers.length) throw new Error("No season rounds found");

  const byId = new Map<number, any>();
  for (let i = 0; i < roundNumbers.length; i += SEASON_ROUND_BATCH_SIZE) {
    const batch = roundNumbers.slice(i, i + SEASON_ROUND_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((round) => sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/events/round/${round}`))
    );
    settled.forEach((entry) => {
      if (entry.status !== "fulfilled") return;
      const events = Array.isArray(entry.value?.events) ? entry.value.events : [];
      events.forEach((event: any) => {
        if (typeof event?.id === "number") byId.set(event.id, event);
      });
    });
  }

  if (!byId.size) throw new Error("No events by round found");
  return Array.from(byId.values());
};

const getPagedSeasonEvents = async (tournamentId: number, seasonId: number, endpoint: "last" | "next", pageLimit = SEASON_EVENTS_PAGE_LIMIT) => {
  const byId = new Map<number, any>();
  for (let page = 0; page < pageLimit; page += 1) {
    let data: any;
    try {
      data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/events/${endpoint}/${page}`);
    } catch {
      break;
    }
    const events = Array.isArray(data?.events) ? data.events : [];
    if (!events.length) break;
    events.forEach((event: any) => {
      if (typeof event?.id === "number") byId.set(event.id, event);
    });
  }
  return Array.from(byId.values());
};

const getSeasonEvents = async (tournamentId: number, seasonId: number, endpoint?: "last" | "next") => {
  if (endpoint) return getPagedSeasonEvents(tournamentId, seasonId, endpoint, SEASON_EVENTS_PAGE_LIMIT);

  try {
    const [lastEvents, nextEvents] = await Promise.all([
      getPagedSeasonEvents(tournamentId, seasonId, "last", SEASON_EVENTS_PAGE_LIMIT),
      getPagedSeasonEvents(tournamentId, seasonId, "next", SEASON_EVENTS_PAGE_LIMIT),
    ]);
    const byId = new Map<number, any>();
    [...lastEvents, ...nextEvents].forEach((event) => {
      if (typeof event?.id === "number") byId.set(event.id, event);
    });
    if (byId.size > 0) return Array.from(byId.values());
  } catch {
    // If the paged endpoints change, rounds are still a viable fallback.
  }

  return getEventsByRounds(tournamentId, seasonId);
};

const normalizeEventStatus = (event: any): string => {
  const type = event?.status?.type;
  if (type === "finished") return "Finished";
  if (type === "inprogress") return "Live";
  if (type === "notstarted") return "Scheduled";
  return event?.status?.description || "Scheduled";
};

const teamImageUrl = (teamId?: number | null) =>
  teamId ? `https://api.sofascore.app/api/v1/team/${teamId}/image` : null;

const playerImageUrl = (playerId?: number | null) =>
  playerId ? `https://api.sofascore.app/api/v1/player/${playerId}/image` : null;

const scoreNumber = (value: unknown) => (typeof value === "number" ? value : null);

const scorePair = (homeScore: any, awayScore: any, preferCurrent = false) => {
  const homePenaltyScore = scoreNumber(homeScore?.penalties);
  const awayPenaltyScore = scoreNumber(awayScore?.penalties);
  const mainKeys = preferCurrent
    ? ["current", "display", "afterExtraTime", "normaltime"]
    : ["afterExtraTime", "normaltime", "current", "display"];

  const pickMain = (score: any) => {
    for (const key of mainKeys) {
      const value = scoreNumber(score?.[key]);
      if (value !== null) return value;
    }
    return null;
  };

  return {
    homeScore: pickMain(homeScore),
    awayScore: pickMain(awayScore),
    homePenaltyScore,
    awayPenaltyScore,
  };
};

const mapSofaEvent = (event: any) => {
  const scores = scorePair(event.homeScore, event.awayScore, event?.status?.type === "inprogress");
  return {
    id: event.id,
    homeTeamId: event.homeTeam?.id || null,
    awayTeamId: event.awayTeam?.id || null,
    homeTeam: event.homeTeam?.name || event.homeTeam?.shortName || "Unknown",
    awayTeam: event.awayTeam?.name || event.awayTeam?.shortName || "Unknown",
    homeTeamImageUrl: teamImageUrl(event.homeTeam?.id),
    awayTeamImageUrl: teamImageUrl(event.awayTeam?.id),
    homeScore: scores.homeScore,
    awayScore: scores.awayScore,
    homePenaltyScore: scores.homePenaltyScore,
    awayPenaltyScore: scores.awayPenaltyScore,
    status: normalizeEventStatus(event),
    startTimestamp: event.startTimestamp || 0,
    tournament:
      event.tournament?.uniqueTournament?.name || event.tournament?.name || "Desconhecido",
    roundInfo:
      typeof event.roundInfo?.round === "number" ? event.roundInfo.round : null,
    venue: event.venue?.stadium?.name || event.venue?.name || event.venue?.city?.name || null,
  };
};

const eventCountry = (event: any) =>
  event?.tournament?.category?.name ||
  event?.tournament?.uniqueTournament?.category?.name ||
  event?.category?.name ||
  "Outros";

const mapGoalIncident = (incident: any) => ({
  id: String(incident?.id ?? `${incident?.time ?? "goal"}-${incident?.homeScore ?? ""}-${incident?.awayScore ?? ""}`),
  playerName: incident?.player?.name || incident?.player?.shortName || incident?.playerName || "",
  teamSide: typeof incident?.isHome === "boolean" ? (incident.isHome ? "home" : "away") : null,
  homeScore: typeof incident?.homeScore === "number" ? incident.homeScore : null,
  awayScore: typeof incident?.awayScore === "number" ? incident.awayScore : null,
  time: typeof incident?.time === "number" ? incident.time : null,
  incidentClass: incident?.incidentClass || null,
});

const isHalftimeText = (value: string) =>
  /(^|\s)(ht|half[-\s]?time|interval|intervalo|break|pause)(\s|$)/i.test(value);

const periodFromText = (value: string) => {
  const text = value.toLowerCase();
  if (/(^|\s)(2t|2o tempo|2nd half|second half|segundo tempo)(\s|$)/.test(text)) return 2;
  if (/(^|\s)(1t|1o tempo|1st half|first half|primeiro tempo)(\s|$)/.test(text)) return 1;
  return null;
};

const getLiveMinute = (event: any): string | null => {
  const description = String(event?.status?.description || "").trim();
  if (isHalftimeText(description)) return null;

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
  const inferredPeriod =
    periodNumber ||
    periodFromText(description) ||
    (initialFromApi >= 45 * 60 ? 2 : event?.status?.type === "inprogress" ? 1 : null);
  const initial = initialFromApi || (inferredPeriod === 2 ? 45 * 60 : 0);
  const max = Number(time?.max ?? statusTime?.max ?? 0) || (inferredPeriod === 2 ? 90 * 60 : 45 * 60);
  if (!timestamp) return null;

  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  const total = initial + elapsed;
  const minute = Math.max(1, Math.floor(total / 60) + 1);
  const normalMinute = max ? Math.floor(max / 60) : 90;
  if (max && total > max) return `${normalMinute}+${Math.floor((total - max) / 60) + 1}'`;
  return `${minute}'`;
};

const getLivePeriod = (event: any): string | null => {
  const description = String(event?.status?.description || "");
  if (isHalftimeText(description)) return "Intervalo";
  const time = event?.time || {};
  const statusTime = event?.statusTime || {};
  const periodNumber = Number(time?.period ?? statusTime?.period ?? 0);
  const initialFromApi = Number(time?.initial ?? statusTime?.initial ?? 0);
  const initial = initialFromApi || (periodNumber === 2 ? 45 * 60 : 0);
  const inferredPeriod = periodNumber || periodFromText(description);
  if (inferredPeriod === 2 || initial >= 45 * 60) return "2o tempo";
  if (inferredPeriod === 1 || event?.status?.type === "inprogress") return "1o tempo";
  return event?.status?.description || null;
};

const mapSofaLiveEvent = (event: any) => {
  const scores = scorePair(event.homeScore, event.awayScore, true);
  return {
    id: event.id,
    homeTeamId: event.homeTeam?.id || null,
    awayTeamId: event.awayTeam?.id || null,
    homeTeam: event.homeTeam?.name || event.homeTeam?.shortName || "Unknown",
    awayTeam: event.awayTeam?.name || event.awayTeam?.shortName || "Unknown",
    homeTeamImageUrl: teamImageUrl(event.homeTeam?.id),
    awayTeamImageUrl: teamImageUrl(event.awayTeam?.id),
    homeScore: scores.homeScore ?? event.homeScore?.current ?? 0,
    awayScore: scores.awayScore ?? event.awayScore?.current ?? 0,
    homePenaltyScore: scores.homePenaltyScore,
    awayPenaltyScore: scores.awayPenaltyScore,
    status: "Live",
    minute: getLiveMinute(event),
    period: getLivePeriod(event),
    tournament:
      event.tournament?.uniqueTournament?.name || event.tournament?.name || "Desconhecido",
    country: eventCountry(event),
  };
};

const todayLocalIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

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
  player?.slug && player?.id
    ? `https://www.sofascore.com/player/${player.slug}/${player.id}`
    : "";

const findFootballTeam = async (teamName: string) => {
  const searchData = await sofaFetch(`/search/teams?q=${encodeURIComponent(teamName)}&page=0`);
  const query = normalizeText(teamName);
  return (Array.isArray(searchData?.results) ? searchData.results : [])
    .map((item: any) => item.entity)
    .filter((entity: any) => entity?.sport?.slug === "football" && entity?.gender !== "F")
    .map((entity: any) => {
      const candidates = [entity?.name, entity?.shortName, entity?.nameCode, entity?.slug]
        .filter(Boolean)
        .map((value: unknown) => normalizeText(String(value)));
      const exact = candidates.some((value: string) => value === query);
      const starts = candidates.some((value: string) => value.startsWith(query) || query.startsWith(value));
      const includes = candidates.some((value: string) => value.includes(query) || query.includes(value));
      return {
        entity,
        score: Number(entity?.userCount || 0) + (exact ? 100_000_000 : starts ? 50_000_000 : includes ? 10_000_000 : 0),
      };
    })
    .sort((a: any, b: any) => b.score - a.score)[0]?.entity;
};

const extractPlayerId = (url: string): number | null => {
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

const looksLikePlayerEntity = (player: any) =>
  Boolean(player?.position || player?.dateOfBirthTimestamp || player?.jerseyNumber || player?.team);

const isMaleFootballPlayer = (player: any) =>
  player?.id &&
  looksLikePlayerEntity(player) &&
  (player?.sport?.slug === "football" || player?.team?.sport?.slug === "football") &&
  player?.gender !== "F" &&
  player?.team?.gender !== "F";

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
    .filter((item: any) => !item?.type || item.type === "player")
    .map((item: any) => (item?.type === "player" ? item.entity : item?.entity || item?.player || item))
    .filter(isMaleFootballPlayer)
    .filter((player: any) => playerUrl(player))
    .map((player: any) => ({ player, score: searchPlayerScore(player, query) }));
};

const playerSeasonSupportsOverall = (seasonsData: any, uniqueTournamentId: number, seasonId: number) => {
  const typesMap = seasonsData?.typesMap || {};
  const tournamentTypes = typesMap[String(uniqueTournamentId)] || typesMap[uniqueTournamentId] || {};
  const seasonTypes = tournamentTypes[String(seasonId)] || tournamentTypes[seasonId];
  return !Array.isArray(seasonTypes) || seasonTypes.includes("overall");
};

const playerSeasonPairs = (seasonsData: any) => {
  const groups = Array.isArray(seasonsData?.uniqueTournamentSeasons)
    ? seasonsData.uniqueTournamentSeasons
    : [];
  const seen = new Set<string>();
  const pairs: { uniqueTournament: any; season: any }[] = [];

  for (const group of groups) {
    const uniqueTournament = group?.uniqueTournament;
    const seasons = Array.isArray(group?.seasons) ? group.seasons : group?.season ? [group.season] : [];
    for (const season of seasons) {
      if (!uniqueTournament?.id || !season?.id) continue;
      const uniqueTournamentId = Number(uniqueTournament.id);
      const seasonId = Number(season.id);
      if (!playerSeasonSupportsOverall(seasonsData, uniqueTournamentId, seasonId)) continue;
      const key = `${uniqueTournamentId}:${seasonId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ uniqueTournament, season });
    }
  }

  return pairs;
};

const mapSeasonStats = (statsData: any, pair: { uniqueTournament: any; season: any }, player: any) => {
  const stats = statsData?.statistics;
  if (!stats) return null;
  return {
    season: pair.season?.year || pair.season?.name || "",
    tournament: pair.uniqueTournament?.name || "",
    team: statsData?.team?.name || player.team?.name || "",
    teamImageUrl: teamImageUrl(statsData?.team?.id || player.team?.id),
    matchesPlayed: Number(stats.appearances ?? stats.matchesStarted ?? stats.countRating ?? 0),
    starts: Number(stats.matchesStarted ?? 0),
    minutes: Number(stats.minutesPlayed ?? 0),
    goals: Number(stats.goals ?? 0),
    assists: Number(stats.assists ?? 0),
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

const seasonSortValue = (season: string) => {
  const years = season.match(/\d{2,4}/g)?.map((value) => Number(value.length === 2 ? `20${value}` : value)) || [];
  return years.length ? Math.max(...years) : 0;
};

const getPlayerSeasons = async (playerId: number, player: any) => {
  const seasonsData = await sofaFetch(`/player/${playerId}/statistics/seasons`).catch(() => ({
    uniqueTournamentSeasons: [],
  }));
  const pairs = playerSeasonPairs(seasonsData);
  const results: any[] = [];

  for (let index = 0; index < pairs.length; index += PLAYER_SEASON_BATCH_SIZE) {
    const batch = pairs.slice(index, index + PLAYER_SEASON_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (pair) => {
        const statsData = await sofaFetch(
          `/player/${playerId}/unique-tournament/${pair.uniqueTournament.id}/season/${pair.season.id}/statistics/overall`
        );
        return mapSeasonStats(statsData, pair, player);
      })
    );

    settled
      .filter((entry): entry is PromiseFulfilledResult<any> => entry.status === "fulfilled")
      .map((entry) => entry.value)
      .filter(Boolean)
      .filter((season: any) => season.matchesPlayed > 0 || season.minutes > 0 || season.goals > 0 || season.assists > 0)
      .forEach((season: any) => results.push(season));
  }

  return results.sort((a: any, b: any) => seasonSortValue(b.season) - seasonSortValue(a.season));
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;
    let result: any = {};

    if (action === "standings") {
      const { leagueUrl } = body;
      if (!leagueUrl) throw new Error("leagueUrl required");

      const tournamentId = uniqueTournamentIdFromUrl(leagueUrl);
      const seasonId = await getCurrentSeasonId(tournamentId);
      const tableType = ["total", "home", "away"].includes(String(body.tableType)) ? String(body.tableType) : "total";
      const data = await sofaFetch(
        `/unique-tournament/${tournamentId}/season/${seasonId}/standings/${tableType}`
      );
      const rows = data?.standings?.[0]?.rows || [];

      result = {
        teams: rows.map((row: any, i: number) => ({
          position: row.position || i + 1,
          id: row.team?.id || row.id || i + 1000,
          name: row.team?.name || "Unknown",
          shortName:
            row.team?.shortName ||
            row.team?.nameCode ||
            (row.team?.name || "UNK").substring(0, 3).toUpperCase(),
          imageUrl: teamImageUrl(row.team?.id || row.id),
          played: row.matches || 0,
          wins: row.wins || 0,
          draws: row.draws || 0,
          losses: row.losses || 0,
          scored: row.scoresFor || 0,
          conceded: row.scoresAgainst || 0,
          points: row.points || 0,
        })),
      };
    } else if (action === "matches_season" || action === "matches_last" || action === "matches_next") {
      const { leagueUrl } = body;
      if (!leagueUrl) throw new Error("leagueUrl required");
      const isLast = action === "matches_last";

      const tournamentId = uniqueTournamentIdFromUrl(leagueUrl);
      const seasonId = await getCurrentSeasonId(tournamentId);
      const endpoint = action === "matches_last" ? "last" : action === "matches_next" ? "next" : undefined;
      const events = endpoint
        ? await getPagedSeasonEvents(tournamentId, seasonId, endpoint, WINDOW_EVENTS_PAGE_LIMIT)
        : await getSeasonEvents(tournamentId, seasonId);
      result = events
        .map(mapSofaEvent)
        .sort((a: any, b: any) =>
          isLast ? b.startTimestamp - a.startTimestamp : a.startTimestamp - b.startTimestamp
        );
    } else if (action === "live") {
      const data = await sofaFetch("/sport/football/events/live");
      const events = Array.isArray(data?.events) ? data.events : [];
      result = events
        .filter((event: any) => event?.status?.type === "inprogress")
        .map(mapSofaLiveEvent);
    } else if (action === "today_matches") {
      const date = todayLocalIso();
      const data = await sofaFetch(`/sport/football/scheduled-events/${date}`);
      const events = Array.isArray(data?.events) ? data.events : [];
      result = events
        .sort((a: any, b: any) => (a.startTimestamp || 0) - (b.startTimestamp || 0))
        .map((event: any) => {
          const mapped = mapSofaEvent(event);
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
            homePenaltyScore: mapped.homePenaltyScore,
            awayPenaltyScore: mapped.awayPenaltyScore,
            status: mapped.status,
            time:
              mapped.status === "Live"
                ? getLiveMinute(event) || getLivePeriod(event)
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

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      try {
        const data = await scrapeExtract(
          "https://www.placardefutebol.com.br/jogos-de-hoje",
          `Extract ALL football matches listed on this page for today. Include matches of ALL statuses: live, scheduled, finished, halftime. For each match: home team full name, away team full name, home score (number, null if not started), away score (number, null if not started), status text (ao vivo/agendado/encerrado/intervalo), scheduled time or current minute, tournament/league name.`,
          todayMatchesSchema,
          1
        );
        const matches = data?.matches || [];
        console.log(`Today matches found: ${matches.length}`);
        result = matches
          .filter((m: any) => m.homeTeam && m.awayTeam)
          .map((m: any, i: number) => ({
            id: 8000 + i,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            homeScore: m.homeScore ?? null,
            awayScore: m.awayScore ?? null,
            status: m.status || "agendado",
            time: m.time || null,
            tournament: m.tournament || "Desconhecido",
          }));
      } catch (err) {
        console.error("Today matches error:", err);
        result = [];
      }
    } else if (action === "event_goal_incidents") {
      const eventId = Number(body.eventId);
      if (!eventId) throw new Error("eventId required");
      const data = await sofaFetch(`/event/${eventId}/incidents`);
      const incidents = Array.isArray(data?.incidents) ? data.incidents : [];
      result = incidents
        .filter((incident: any) => String(incident?.incidentType || "").toLowerCase() === "goal")
        .map(mapGoalIncident)
        .sort((a: any, b: any) => (b.time || 0) - (a.time || 0));
    } else if (action === "top_players") {
      const { leagueUrl } = body;
      if (!leagueUrl) throw new Error("leagueUrl required");
      const tournamentId = uniqueTournamentIdFromUrl(String(leagueUrl));
      const seasonId = await getCurrentSeasonId(tournamentId);
      const metric = String(body.metric || "goals");
      const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/top-players/overall`);
      const players = Array.isArray(data?.topPlayers?.[metric]) ? data.topPlayers[metric] : [];
      result = players.slice(0, 12).map((item: any) => ({
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
    } else if (action === "player_search") {
      const { query } = body;
      if (!query) throw new Error("query required");

      const [playersData, allData] = await Promise.all([
        sofaFetch(`/search/players?q=${encodeURIComponent(query)}&page=0`).catch(() => ({ results: [] })),
        sofaFetch(`/search/all?q=${encodeURIComponent(query)}&page=0`).catch(() => ({ results: [] })),
      ]);
      const byId = new Map<number, { player: any; score: number }>();
      for (const item of [...extractPlayersFromSearch(playersData, query), ...extractPlayersFromSearch(allData, query)]) {
        const current = byId.get(item.player.id);
        if (!current || item.score > current.score) byId.set(item.player.id, item);
      }

      result = [...byId.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map(({ player }) => ({
        id: player.id,
        name: player.name || player.shortName || query,
        url: playerUrl(player),
        description: [
          mapPosition(player.position),
          player.team?.name,
          player.country?.name,
        ]
          .filter(Boolean)
          .join(" • "),
        imageUrl: `https://api.sofascore.app/api/v1/player/${player.id}/image`,
        team: player.team?.name || "",
        age: playerAge(player),
      }));

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      // Two-pass search: strict path filter first, broader fallback if empty
      const queries = [
        `${query} footballer stats site:sofascore.com/player`,
        `${query} player site:sofascore.com`,
      ];
      const seen = new Set<string>();
      const collected: any[] = [];
      for (const q of queries) {
        if (collected.length >= 10) break;
        try {
          const results = await firecrawlSearch(q, 12);
          for (const r of results) {
            if (!r.url) continue;
            // Re-filter URLs server-side: must be a SofaScore player profile
            if (!/sofascore\.com\/(?:[a-z-]+\/)?player\//i.test(r.url)) continue;
            if (seen.has(r.url)) continue;
            seen.add(r.url);
            const text = `${(r.title || "")} ${(r.description || "")}`.toLowerCase();
            const excludePatterns = [
              /\bwomen\b/i, /\bfeminino\b/i, /\bfemale\b/i,
              /\bfutsal\b/i, /\bjuvenil\b/i, /\bjunior\b/i,
              /\byouth\b/i, /\bacademy\b/i, /\bsub-?\d+/i,
              /\bu\d{2}\b/i, /\bunder\s*\d+/i,
            ];
            if (excludePatterns.some((p) => p.test(text))) continue;
            collected.push(r);
            if (collected.length >= 10) break;
          }
        } catch (err) {
          console.error(`player_search "${q}" failed:`, err);
        }
      }
      console.log(`player_search "${query}": ${collected.length} hits`);

      // ─── Famous-first ranking ─────────────────────────────────────────
      const q = String(query).toLowerCase().trim();
      const qTokens = q.split(/\s+/).filter(Boolean);
      const famousMarkers = [
        // National-team / top-club / award keywords boost fame
        "national team", "seleção", "selecao", "world cup", "copa do mundo",
        "ballon d'or", "ballon dor", "champions league",
        "real madrid", "barcelona", "manchester", "liverpool", "chelsea",
        "psg", "paris saint-germain", "bayern", "juventus", "milan", "inter",
        "al-hilal", "al hilal", "al-nassr", "al nassr", "santos",
        "brazil", "brasil", "argentina", "portugal", "france", "england",
      ];
      const scoreItem = (r: any) => {
        const rawName = (r.title || "")
          .replace(/ - SofaScore.*$/i, "")
          .replace(/ \|.*$/, "")
          .replace(/ stats.*$/i, "")
          .replace(/ statistics.*$/i, "")
          .trim();
        const nameLower = rawName.toLowerCase();
        const descLower = (r.description || "").toLowerCase();
        const blob = `${nameLower} ${descLower}`;
        let score = 0;
        // Exact / prefix match on name strongly wins
        if (nameLower === q) score += 1000;
        else if (nameLower.startsWith(q)) score += 500;
        else if (nameLower.includes(q)) score += 200;
        // Each query token matched in name
        for (const t of qTokens) if (nameLower.includes(t)) score += 50;
        // Famous markers in description/title boost fame
        for (const m of famousMarkers) if (blob.includes(m)) score += 30;
        // Shorter name URLs (canonical players) generally rank higher
        if (/\/player\/[^/]+\/\d+$/.test(r.url || "")) score += 20;
        // Penalize obviously obscure entries (very long names with extra qualifiers)
        if (rawName.split(/\s+/).length > 5) score -= 20;
        return { rawName, score };
      };

      const ranked = collected
        .map((r: any) => ({ r, ...scoreItem(r) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      // Try to extract image + team + age from each result page metadata
      // (parallel, best-effort; fall back gracefully)
      const enriched = await Promise.all(
        ranked.map(async ({ r, rawName }, i) => {
          let imageUrl: string | null = null;
          let descPt = "";
          let team = "";
          let age: number | null = null;
          try {
            // Use Firecrawl to fetch page metadata (cheap, no extract schema)
            const fcKey = requireFirecrawlKey();
            const metaRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${fcKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: r.url,
                formats: ["markdown"],
                onlyMainContent: false,
                waitFor: 1500,
                timeout: 15000,
              }),
            });
            if (metaRes.ok) {
              const j = await metaRes.json();
              const meta = j?.data?.metadata || j?.metadata || {};
              imageUrl =
                meta.ogImage || meta["og:image"] || meta.image || null;
              // Strip generic SofaScore boilerplate
              const md: string = j?.data?.markdown || j?.markdown || "";
              // first non-empty paragraph
              const para = md
                .split("\n")
                .map((l: string) => l.trim())
                .find((l: string) => l.length > 60 && !l.startsWith("#") && !l.startsWith("|"));
              if (para) descPt = para.slice(0, 220);
              // Try to extract team + age from markdown patterns
              // Common SofaScore patterns: "Team: Real Madrid", "Age: 28", or "28 years old"
              const teamMatch =
                md.match(/(?:Team|Equipe|Time|Club)\s*[:\-]\s*([^\n|]+?)(?:\n|$)/i) ||
                md.match(/plays for\s+([A-Z][^\n.,]+?)(?:\.|,|\n)/i);
              if (teamMatch) team = teamMatch[1].trim().slice(0, 60);
              const ageMatch =
                md.match(/(?:Age|Idade)\s*[:\-]\s*(\d{1,2})/i) ||
                md.match(/\b(\d{2})\s*(?:years?\s*old|anos)\b/i);
              if (ageMatch) {
                const n = parseInt(ageMatch[1], 10);
                if (n >= 15 && n <= 50) age = n;
              }
            }
          } catch (e) {
            console.warn("meta fetch failed:", (e as Error).message);
          }

          // Fallback: translate the english snippet to PT-BR using AI
          const baseDesc = descPt || r.description || "";
          let descriptionPt = baseDesc;
          if (baseDesc) {
            try {
              if (Deno.env.get("OPENAI_API_KEY")) {
                const aiRes = await openAIChatCompletion(
                  [
                    {
                      role: "system",
                      content:
                        "Traduza para Portugues do Brasil. Responda APENAS com a traducao, sem explicacoes, sem aspas. Mantenha nomes proprios. Se ja estiver em PT-BR, repita igual. Maximo 200 caracteres.",
                    },
                    { role: "user", content: baseDesc },
                  ],
                  { model: Deno.env.get("OPENAI_TRANSLATION_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini" }
                );
                if (aiRes.ok) {
                  const aj = await aiRes.json();
                  const translated = aj?.choices?.[0]?.message?.content?.trim();
                  if (translated) descriptionPt = translated.replace(/^["']|["']$/g, "");
                }
              }
            } catch (e) {
              console.warn("translate failed:", (e as Error).message);
            }
          }

          return {
            id: i,
            name: rawName || query,
            url: r.url,
            description: descriptionPt,
            imageUrl,
            team,
            age,
          };
        })
      );

      result = enriched;
    } else if (action === "player_stats") {
      const { playerUrl } = body;
      if (!playerUrl) throw new Error("playerUrl required");

      const playerId = extractPlayerId(String(playerUrl));
      if (!playerId) throw new Error("Invalid playerUrl");

      const detail = await sofaFetch(`/player/${playerId}`);
      const player = detail?.player || {};
      const seasons = await getPlayerSeasons(playerId, player);

      result = {
        id: player.id || playerId,
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
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const data = await scrapeExtract(
        playerUrl,
        `Extract all player information and statistics. Get: player full name, current team, position, nationality, age, height, preferred foot, shirt number. Also extract the complete season-by-season statistics table with: season year (e.g. "24/25"), team name, matches played (MP), minutes played (MIN), goals scored (GLS), assists (AST), and average SofaScore rating (ASR). Include ALL available seasons from the table.`,
        {
          type: "object",
          properties: {
            name: { type: "string" },
            team: { type: "string" },
            position: { type: "string" },
            nationality: { type: "string" },
            age: { type: "number" },
            height: { type: "string" },
            foot: { type: "string" },
            shirtNumber: { type: "number" },
            seasons: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  season: { type: "string" },
                  team: { type: "string" },
                  matchesPlayed: { type: "number" },
                  minutes: { type: "number" },
                  goals: { type: "number" },
                  assists: { type: "number" },
                  rating: { type: "number" },
                },
              },
            },
          },
        }
      );
      result = data || {};
    } else if (action === "odds") {
      try {
        const data = await scrapeExtract(
          "https://www.oddspedia.com/br/futebol",
          `Extract betting odds for the next upcoming football matches. For each match: home team name, away team name, best odds for home win (decimal), best odds for draw (decimal), best odds for away win (decimal), bookmaker name, match date/time, tournament name. Get at least 10 matches.`,
          {
            type: "object",
            properties: {
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    homeTeam: { type: "string" },
                    awayTeam: { type: "string" },
                    homeOdds: { type: "number" },
                    drawOdds: { type: "number" },
                    awayOdds: { type: "number" },
                    bookmaker: { type: "string" },
                    date: { type: "string" },
                    tournament: { type: "string" },
                  },
                },
              },
            },
          },
          1
        );
        result = (data?.matches || []).map((m: any, i: number) => ({
          id: 7000 + i,
          homeTeam: m.homeTeam || "Unknown",
          awayTeam: m.awayTeam || "Unknown",
          homeOdds: m.homeOdds || 0,
          drawOdds: m.drawOdds || 0,
          awayOdds: m.awayOdds || 0,
          bookmaker: m.bookmaker || "",
          date: m.date || null,
          tournament: m.tournament || "",
        }));
      } catch {
        result = [];
      }
    } else if (action === "team_next_matches") {
      const teamIds = Array.isArray(body.teamIds)
        ? body.teamIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
        : [];
      const teamNames = Array.isArray(body.teamNames)
        ? body.teamNames.map((name: unknown) => String(name).trim()).filter(Boolean)
        : [];
      const teamsByName = await Promise.allSettled(teamNames.map((name: string) => findFootballTeam(name)));
      const resolvedIds = teamsByName
        .filter((entry): entry is PromiseFulfilledResult<any> => entry.status === "fulfilled")
        .map((entry) => Number(entry.value?.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      const uniqueTeamIds = Array.from(new Set([...teamIds, ...resolvedIds])).slice(0, 6);

      const settled = await Promise.allSettled(
        uniqueTeamIds.map(async (teamId) => {
          const data = await sofaFetch(`/team/${teamId}/events/next/0`);
          return Array.isArray(data?.events) ? data.events.map(mapSofaEvent) : [];
        })
      );
      const byId = new Map<number, any>();
      settled.forEach((entry) => {
        if (entry.status !== "fulfilled") return;
        entry.value.forEach((match: any) => byId.set(match.id, match));
      });
      result = Array.from(byId.values())
        .filter((match: any) => match.startTimestamp > 0)
        .sort((a: any, b: any) => a.startTimestamp - b.startTimestamp)
        .slice(0, 20);
    } else if (action === "team_players") {
      const { teamName } = body;
      const requestedTeamId = Number(body.teamId);
      const team =
        Number.isFinite(requestedTeamId) && requestedTeamId > 0
          ? { id: requestedTeamId }
          : await findFootballTeam(String(teamName || ""));
      if (!team?.id) {
        result = [];
      } else {
        const playersData = await sofaFetch(`/team/${team.id}/players`);
        const players = Array.isArray(playersData?.players) ? playersData.players : [];
        result = players
          .filter((row: any) => {
            const player = row.player || row;
            const playerTeamId = Number(player?.team?.id);
            return !Number.isFinite(playerTeamId) || playerTeamId <= 0 || playerTeamId === Number(team.id);
          })
          .map((row: any) => {
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

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      console.log(`Looking for team: ${teamName}`);
      // Source: Transfermarkt — its squad page is server-rendered (markdown is rich and stable),
      // unlike SofaScore which renders the squad list via JS (markdown comes back empty).
      let squadUrl: string | null = null;

      try {
        const results = await firecrawlSearch(
          `${teamName} squad site:transfermarkt.com kader verein`,
          8
        );
        console.log(`TM search returned ${results.length} results`);
        for (const r of results) {
          if (!r.url) continue;
          // We want the senior team squad page: /<slug>/kader/verein/<id>
          // Reject U17/U20/U23/Frauen/feminino/B-teams.
          const url: string = r.url;
          const text = `${url} ${r.title || ""}`.toLowerCase();
          if (!/transfermarkt\.[a-z.]+\/[^/]+\/kader\/verein\/\d+/.test(url)) continue;
          if (/u\d{2}|sub-?\d+|youth|jugend|junior|frauen|women|feminin|reserve|\bii\b|-b\b|academy|akademie/.test(text)) continue;
          squadUrl = url.split("?")[0];
          break;
        }
      } catch (err) {
        console.error("Transfermarkt search failed:", err);
      }

      if (!squadUrl) {
        console.log("No Transfermarkt squad page found for", teamName);
        result = [];
      } else {
        console.log(`Scraping squad markdown from: ${squadUrl}`);
        try {
          const squadRules = `CRITICAL RULES for the Transfermarkt squad table:
- Extract ONLY players in the senior MEN'S first-team squad table on this page.
- Each player row in the table contains, in order: jersey number, player photo + linked name, nationality flag(s), date of birth / age, contract end date, market value.
- "name" MUST be the EXACT player name as written in the link text (e.g. "Agustín Rossi", "Léo Ortiz", "Pedro").
- "shirtNumber" is the small integer in the leftmost column of the row (typically 1–99). If absent, use null.
- "age" is the integer next to the date of birth (e.g. "30", "24"). Range 15–50. If not visible, use null.
- "position" is the small label written under the player photo cell ("Goalkeeper", "Centre-Back", "Right-Back", "Defensive Midfield", "Attacking Midfield", "Centre-Forward", etc.). Map to one word: Goalkeeper / Defender / Midfielder / Forward.
- "nationality" is the country shown by the flag(s). Use the FIRST country (primary nationality).
- "url" MUST be the absolute Transfermarkt profile URL from the markdown link around the player's name (e.g. https://www.transfermarkt.com/agustin-rossi/profil/spieler/352324).
- IGNORE managers, coaches, staff rows, and the "departures/arrivals" section if present.
- NEVER invent placeholders like "Player 1".
- Return EVERY player in the table (typically 20–35 players).`;

          const squadData = await scrapeMarkdownThenAI(
            squadUrl,
            `${squadRules}\nExtract every player in this team's senior squad table. For each: name, position, shirtNumber (integer or null), nationality, age (integer or null), url (Transfermarkt profile link).`,
            squadSchema
          );

          const rawPlayers = squadData?.players || [];
          console.log(`team_players raw: ${rawPlayers.length}`);
          const placeholderRe = /^(player|jogador|atleta|unknown|n\/?a|tbd|---?|\?+)\s*[a-z0-9]{0,3}$/i;
          const cleaned = rawPlayers
            .map((p: any, i: number) => {
              const name = (p.name || "").trim();
              const ageNum = typeof p.age === "number" && p.age >= 15 && p.age <= 50 ? Math.round(p.age) : null;
              const shirtNum = typeof p.shirtNumber === "number" && p.shirtNumber >= 1 && p.shirtNumber <= 99 ? Math.round(p.shirtNumber) : null;
              // We accept Transfermarkt URLs here; the client falls back to a name search
              // because player_stats only knows how to scrape SofaScore profiles.
              const url = typeof p.url === "string" && /^https?:\/\//i.test(p.url) ? p.url : "";
              return {
                id: i,
                name,
                position: p.position || "",
                shirtNumber: shirtNum,
                nationality: p.nationality || "",
                age: ageNum,
                url,
              };
            })
            .filter((p: any) => p.name.length >= 2 && !placeholderRe.test(p.name));
          console.log(`team_players: ${rawPlayers.length} raw -> ${cleaned.length} after validation`);
          result = cleaned;
        } catch (err) {
          console.error("Squad scrape failed:", err);
          result = [];
        }
      }
    } else if (action === "team_stats") {
      result = {};
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sports-data error:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";

    // Graceful fallback: never break the frontend with 500s when the upstream
    // scraper (Firecrawl) is unavailable, unauthorized, or out of credits.
    // Return an empty shape compatible with the requested action.
    let action = "";
    try {
      const body = await req.clone().json();
      action = body?.action || "";
    } catch {
      /* ignore */
    }

    const fallback: unknown =
      action === "standings"
        ? { teams: [], _error: msg, _fallback: true }
        : action === "player_stats"
        ? null
        : [];

    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
