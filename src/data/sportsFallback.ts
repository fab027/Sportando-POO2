import type {
  SofaMatch,
  SofaTeamStanding,
  PlayerSearchResult,
  PlayerDetail,
  TeamPlayer,
  TodayMatch,
} from "@/services/sofaScoreService";

const footballTeams = [
  "Flamengo", "Palmeiras", "Cruzeiro", "Bahia", "Botafogo", "Fluminense", "São Paulo", "Internacional",
  "Corinthians", "Grêmio", "Atlético Mineiro", "Vasco", "Fortaleza", "Santos", "Ceará", "Vitória",
  "Mirassol", "Juventude", "Sport Recife", "Red Bull Bragantino",
];

const nbaTeams = [
  "Boston Celtics", "Oklahoma City Thunder", "Denver Nuggets", "Minnesota Timberwolves", "New York Knicks",
  "Milwaukee Bucks", "Dallas Mavericks", "Los Angeles Lakers", "Phoenix Suns", "Golden State Warriors",
];

const makeStandings = (names: string[], isBasketball = false): SofaTeamStanding[] =>
  names.map((name, i) => {
    const wins = Math.max(2, names.length - i + (i % 3));
    const draws = isBasketball ? 0 : i % 5;
    const losses = Math.max(1, Math.floor(i / 2));
    return {
      id: 1000 + i,
      position: i + 1,
      name,
      shortName: name.split(/\s+/).map((p) => p[0]).join("").slice(0, 4).toUpperCase(),
      played: wins + draws + losses,
      wins,
      draws,
      losses,
      scored: isBasketball ? 110 + i * 3 : 35 - i,
      conceded: isBasketball ? 104 + i * 2 : 18 + i,
      points: isBasketball ? wins : wins * 3 + draws,
    };
  });

export const getFallbackStandings = (leagueUrl: string): SofaTeamStanding[] =>
  leagueUrl.includes("basketball") || leagueUrl.includes("nba")
    ? makeStandings(nbaTeams, true)
    : makeStandings(footballTeams);

export const getFallbackMatches = (leagueUrl: string) => {
  const teams = getFallbackStandings(leagueUrl).map((t) => t.name);
  const now = Math.floor(Date.now() / 1000);
  const lastMatches: SofaMatch[] = teams.slice(0, 8).map((team, i) => ({
    id: 2000 + i,
    homeTeam: team,
    awayTeam: teams[(i + 5) % teams.length],
    homeScore: (i + 1) % 4,
    awayScore: i % 3,
    status: "Finished",
    startTimestamp: now - (i + 1) * 86400,
    tournament: leagueUrl.includes("nba") ? "NBA" : "Brasileirão Série A",
    roundInfo: i + 1,
  }));
  const nextMatches: SofaMatch[] = teams.slice(8, 16).map((team, i) => ({
    id: 3000 + i,
    homeTeam: team,
    awayTeam: teams[(i + 2) % teams.length],
    homeScore: null,
    awayScore: null,
    status: "Scheduled",
    startTimestamp: now + (i + 1) * 86400,
    tournament: leagueUrl.includes("nba") ? "NBA" : "Brasileirão Série A",
    roundInfo: i + 9,
  }));
  return { lastMatches, nextMatches };
};

const players: PlayerSearchResult[] = [
  { id: 1, name: "Neymar", url: "https://www.sofascore.com/player/neymar/124712", description: "Atacante brasileiro", team: "Santos", age: 34 },
  { id: 2, name: "Lionel Messi", url: "https://www.sofascore.com/player/lionel-messi/12994", description: "Atacante argentino", team: "Inter Miami", age: 38 },
  { id: 3, name: "Cristiano Ronaldo", url: "https://www.sofascore.com/player/cristiano-ronaldo/750", description: "Atacante português", team: "Al-Nassr", age: 41 },
  { id: 4, name: "Kylian Mbappé", url: "https://www.sofascore.com/player/kylian-mbappe/826643", description: "Atacante francês", team: "Real Madrid", age: 27 },
  { id: 5, name: "Erling Haaland", url: "https://www.sofascore.com/player/erling-haaland/839956", description: "Centroavante norueguês", team: "Manchester City", age: 25 },
  { id: 6, name: "Vinícius Júnior", url: "https://www.sofascore.com/player/vinicius-junior/868812", description: "Atacante brasileiro", team: "Real Madrid", age: 25 },
];

export const getFallbackPlayerSearch = (query: string): PlayerSearchResult[] => {
  const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return players.filter((p) => p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)).slice(0, 5);
};

export const getFallbackPlayerDetail = (playerUrl: string): PlayerDetail => {
  const base = players.find((p) => playerUrl.includes(String(p.url.split("/").pop())) || playerUrl.toLowerCase().includes(p.name.toLowerCase().split(" ")[0])) || players[0];
  return {
    name: base.name,
    team: base.team || "—",
    position: "Atacante",
    nationality: "—",
    age: base.age ?? null,
    height: "—",
    foot: "—",
    shirtNumber: null,
    seasons: [
      { season: "2025/26", team: base.team || "—", matchesPlayed: 18, minutes: 1240, goals: 9, assists: 5, rating: 7.41 },
      { season: "2024/25", team: base.team || "—", matchesPlayed: 32, minutes: 2440, goals: 18, assists: 11, rating: 7.58 },
    ],
  };
};

export const getFallbackTeamPlayers = (teamName: string): TeamPlayer[] => {
  const names = ["Goleiro Titular", "Zagueiro Central", "Lateral Direito", "Volante", "Meia Armador", "Ponta Esquerda", "Centroavante"];
  return names.map((name, i) => ({
    id: i,
    name: `${name} ${teamName}`,
    position: ["Goalkeeper", "Defender", "Defender", "Midfielder", "Midfielder", "Forward", "Forward"][i],
    shirtNumber: i + 1,
    nationality: "Brasil",
    age: 22 + i,
    url: "",
  }));
};

export const getFallbackTodayMatches = (): TodayMatch[] => getFallbackMatches("football").nextMatches.slice(0, 6).map((m) => ({
  id: m.id,
  homeTeam: m.homeTeam,
  awayTeam: m.awayTeam,
  homeScore: null,
  awayScore: null,
  status: "agendado",
  time: new Date(m.startTimestamp * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  tournament: m.tournament,
}));