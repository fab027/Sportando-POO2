const THESPORTSDB_PROXY_URL = "/thesportsdb-api";

type TheSportsDbPlayer = {
  idPlayer?: string;
  strPlayer?: string;
  strTeam?: string;
  strNationality?: string;
  dateBorn?: string;
  strPosition?: string;
  strHeight?: string;
  strWeight?: string;
  strDescriptionPT?: string;
  strDescriptionEN?: string;
};

type TheSportsDbEvent = {
  idEvent?: string;
  strEvent?: string;
  strLeague?: string;
  dateEvent?: string;
  strTime?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
};

const apiFetch = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${THESPORTSDB_PROXY_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TheSportsDB HTTP ${res.status}`);
  return res.json();
};

const encodeQuery = (value: string) => encodeURIComponent(value.trim().replace(/\s+/g, "_"));

const playerAge = (dateBorn?: string) => {
  if (!dateBorn) return null;
  const born = new Date(`${dateBorn}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const hadBirthday =
    today.getUTCMonth() > born.getUTCMonth() ||
    (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() >= born.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age;
};

const todayIsoSaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const freeSportsDataService = {
  async searchPlayer(query: string) {
    const data = await apiFetch<{ player?: TheSportsDbPlayer[] | null }>(
      `/searchplayers.php?p=${encodeQuery(query)}`
    );
    return data.player?.[0] || null;
  },

  async getFootballEventsByDate(date = todayIsoSaoPaulo()) {
    const data = await apiFetch<{ events?: TheSportsDbEvent[] | null }>(
      `/eventsday.php?d=${date}&s=Soccer`
    );
    return data.events || [];
  },

  mapPlayerProfile(player: TheSportsDbPlayer) {
    const description = player.strDescriptionPT || player.strDescriptionEN || "";
    return {
      name: player.strPlayer || "Jogador",
      team: player.strTeam || "",
      nationality: player.strNationality || "",
      position: player.strPosition || "",
      age: playerAge(player.dateBorn),
      dateBorn: player.dateBorn || "",
      height: player.strHeight || "",
      weight: player.strWeight || "",
      description: description.replace(/\s+/g, " ").trim(),
      sourceId: player.idPlayer || "",
    };
  },

  mapEvent(event: TheSportsDbEvent) {
    const label =
      event.strEvent ||
      `${event.strHomeTeam || "Mandante"} x ${event.strAwayTeam || "Visitante"}`;
    return {
      label,
      league: event.strLeague || "Liga nao informada",
      date: event.dateEvent || "",
      time: event.strTime || "",
      homeScore: Number(event.intHomeScore ?? 0),
      awayScore: Number(event.intAwayScore ?? 0),
      hasScore: event.intHomeScore !== null && event.intAwayScore !== null,
      sourceId: event.idEvent || "",
    };
  },
};
