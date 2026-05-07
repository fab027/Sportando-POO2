export type LeagueCategory = "brazilian" | "european" | "south_american" | "international" | "north_american";

export type League = {
  id: string;
  name: string;
  country: string;
  sport: "football" | "basketball";
  sofascoreUrl: string;
  category: LeagueCategory;
  flag: string;
};

export const LEAGUES: League[] = [
  // Brazilian
  { id: "brasileirao-a", name: "Brasileirão Série A", country: "Brasil", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/brazil/brasileirao-serie-a/325", category: "brazilian", flag: "🇧🇷" },
  { id: "brasileirao-b", name: "Brasileirão Série B", country: "Brasil", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/brazil/brasileirao-serie-b/390", category: "brazilian", flag: "🇧🇷" },
  // European Top 5
  { id: "premier-league", name: "Premier League", country: "Inglaterra", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/england/premier-league/17", category: "european", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id: "la-liga", name: "La Liga", country: "Espanha", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/spain/laliga/8", category: "european", flag: "🇪🇸" },
  { id: "serie-a-it", name: "Serie A", country: "Itália", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/italy/serie-a/23", category: "european", flag: "🇮🇹" },
  { id: "bundesliga", name: "Bundesliga", country: "Alemanha", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/germany/bundesliga/35", category: "european", flag: "🇩🇪" },
  { id: "ligue-1", name: "Ligue 1", country: "França", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/france/ligue-1/34", category: "european", flag: "🇫🇷" },
  // International
  { id: "ucl", name: "UEFA Champions League", country: "Europa", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/international/uefa-champions-league/7", category: "international", flag: "🏆" },
  { id: "uel", name: "UEFA Europa League", country: "Europa", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/international/uefa-europa-league/679", category: "international", flag: "🏆" },
  { id: "copa-mundo", name: "Copa do Mundo", country: "Mundial", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/world/world-cup/16", category: "international", flag: "🌍" },
  // South American
  { id: "libertadores", name: "Copa Libertadores", country: "América do Sul", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/south-america/copa-libertadores/384", category: "south_american", flag: "🏆" },
  { id: "sulamericana", name: "Copa Sul-Americana", country: "América do Sul", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/south-america/copa-sudamericana/480", category: "south_american", flag: "🏆" },
  { id: "argentina", name: "Liga Profesional Argentina", country: "Argentina", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/argentina/liga-profesional/155", category: "south_american", flag: "🇦🇷" },
  { id: "colombia", name: "Liga BetPlay", country: "Colômbia", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/colombia/primera-a/11536", category: "south_american", flag: "🇨🇴" },
  // Basketball
  { id: "nba", name: "NBA", country: "EUA", sport: "basketball", sofascoreUrl: "https://www.sofascore.com/tournament/basketball/usa/nba/132", category: "north_american", flag: "🇺🇸" },
];

export const CATEGORY_LABELS: Record<LeagueCategory, string> = {
  brazilian: "Brasil",
  european: "Europa — Top 5",
  south_american: "América do Sul",
  international: "Copas Internacionais",
  north_american: "América do Norte",
};

export const getLeaguesBySport = (sport: "football" | "basketball") =>
  LEAGUES.filter((l) => l.sport === sport);

export const getLeaguesByCategory = (sport: "football" | "basketball") => {
  const leagues = getLeaguesBySport(sport);
  const grouped: Record<string, League[]> = {};
  for (const l of leagues) {
    if (!grouped[l.category]) grouped[l.category] = [];
    grouped[l.category].push(l);
  }
  return grouped;
};

export const getDefaultLeague = (sport: "football" | "basketball") =>
  sport === "football"
    ? LEAGUES.find((l) => l.id === "brasileirao-a")!
    : LEAGUES.find((l) => l.id === "nba")!;
