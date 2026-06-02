export type LeagueCategory = "brazilian" | "european" | "south_american" | "international";

export type League = {
  id: string;
  name: string;
  country: string;
  sport: "football";
  sofascoreUrl: string;
  category: LeagueCategory;
  flag: string;
};

export const LEAGUES: League[] = [
  { id: "brasileirao-a", name: "Brasileirao Serie A", country: "Brasil", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/brazil/brasileirao-serie-a/325", category: "brazilian", flag: "BR" },
  { id: "brasileirao-b", name: "Brasileirao Serie B", country: "Brasil", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/brazil/brasileirao-serie-b/390", category: "brazilian", flag: "BR" },
  { id: "premier-league", name: "Premier League", country: "Inglaterra", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/england/premier-league/17", category: "european", flag: "ENG" },
  { id: "la-liga", name: "La Liga", country: "Espanha", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/spain/laliga/8", category: "european", flag: "ES" },
  { id: "serie-a-it", name: "Serie A", country: "Italia", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/italy/serie-a/23", category: "european", flag: "IT" },
  { id: "bundesliga", name: "Bundesliga", country: "Alemanha", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/germany/bundesliga/35", category: "european", flag: "DE" },
  { id: "ligue-1", name: "Ligue 1", country: "Franca", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/france/ligue-1/34", category: "european", flag: "FR" },
  { id: "ucl", name: "UEFA Champions League", country: "Europa", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/international/uefa-champions-league/7", category: "international", flag: "UCL" },
  { id: "uel", name: "UEFA Europa League", country: "Europa", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/international/uefa-europa-league/679", category: "international", flag: "UEL" },
  { id: "copa-mundo", name: "Copa do Mundo", country: "Mundial", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/world/world-cup/16", category: "international", flag: "WORLD" },
  { id: "libertadores", name: "Copa Libertadores", country: "America do Sul", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/south-america/copa-libertadores/384", category: "south_american", flag: "LIB" },
  { id: "sulamericana", name: "Copa Sul-Americana", country: "America do Sul", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/south-america/copa-sudamericana/480", category: "south_american", flag: "SUD" },
  { id: "argentina", name: "Liga Profesional Argentina", country: "Argentina", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/argentina/liga-profesional/155", category: "south_american", flag: "AR" },
  { id: "colombia", name: "Liga BetPlay", country: "Colombia", sport: "football", sofascoreUrl: "https://www.sofascore.com/tournament/football/colombia/primera-a/11536", category: "south_american", flag: "CO" },
];

export const CATEGORY_LABELS: Record<LeagueCategory, string> = {
  brazilian: "Brasil",
  european: "Europa - Top 5",
  south_american: "America do Sul",
  international: "Copas Internacionais",
};

export const getLeaguesBySport = (_sport: "football" = "football") =>
  LEAGUES.filter((league) => league.sport === "football");

export const getLeaguesByCategory = (sport: "football" = "football") => {
  const leagues = getLeaguesBySport(sport);
  const grouped: Record<string, League[]> = {};
  for (const league of leagues) {
    if (!grouped[league.category]) grouped[league.category] = [];
    grouped[league.category].push(league);
  }
  return grouped;
};

export const getDefaultLeague = (_sport: "football" = "football") =>
  LEAGUES.find((league) => league.id === "brasileirao-a")!;
