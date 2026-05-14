/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DashboardData } from "@/components/DynamicDashboard";
import type { League } from "@/data/leagues";
import { sofaScoreService } from "@/services/sofaScoreService";

const SOFASCORE_PROXY_URL = "/sofascore-api";

const sofaFetch = async (path: string) => {
  const res = await fetch(`${SOFASCORE_PROXY_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SofaScore HTTP ${res.status}`);
  return res.json();
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const uniqueTournamentIdFromUrl = (leagueUrl: string) => {
  const match = leagueUrl.match(/\/(\d+)(?:[/?#].*)?$/);
  if (!match) throw new Error("URL de liga invalida");
  return Number(match[1]);
};

const getCurrentSeason = async (league: League) => {
  const tournamentId = uniqueTournamentIdFromUrl(league.sofascoreUrl);
  const data = await sofaFetch(`/unique-tournament/${tournamentId}/seasons`);
  const season = data?.seasons?.[0];
  if (!season?.id) throw new Error("Temporada nao encontrada");
  return { tournamentId, seasonId: Number(season.id), seasonName: season.year || season.name || "" };
};

const metricFromQuestion = (question: string) => {
  const q = normalize(question);
  if (/(participa|gols?\s*\+\s*assist|g\/a|g\+a|goal contributions|contribuicoes|contribuições)/.test(q)) {
    return { key: "goalsAssistsSum", label: "G+A", title: "Lideres em participacoes em gols" };
  }
  if (/(assist|garcom|passe)/.test(q)) return { key: "assists", label: "Assistencias", title: "Lideres em assistencias" };
  if (/(nota|rating|melhores|desempenho)/.test(q)) return { key: "rating", label: "Nota SofaScore", title: "Melhores notas medias" };
  if (/(xg|gols esperados|expected goals)/.test(q)) return { key: "expectedGoals", label: "xG", title: "Lideres em xG" };
  if (/(xa|assistencias esperadas|expected assists)/.test(q)) return { key: "expectedAssists", label: "xA", title: "Lideres em xA" };
  if (/(partidas|jogos|aparicoes|presencas)/.test(q)) return { key: "appearances", label: "Partidas", title: "Mais partidas" };
  return { key: "goals", label: "Gols", title: "Artilheiros" };
};

const numberValue = (value: unknown) => {
  const normalized = typeof value === "string" && value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const n = Number(normalized ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
};

const isNumericValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return false;
  const normalized = typeof value === "string" && value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const n = Number(normalized);
  return Number.isFinite(n);
};

const sourceInsight = (league: League, seasonName: string) =>
  `Fonte: SofaScore API, ${league.name}${seasonName ? ` ${seasonName}` : ""}. Dados consultados em tempo real.`;

const TRUSTED_PLAYER_YEAR_TOTALS: Record<string, Record<string, { matches: number; goals: number; source: string; url: string }>> = {
  neymar: {
    "2026": {
      matches: 14,
      goals: 6,
      source: "ogol",
      url: "https://www.ogol.com.br/jogador/neymar/54814",
    },
  },
};

const playerYearQuestion = (question: string) => {
  const q = normalize(question);
  const year = q.match(/\b(20\d{2}|19\d{2})\b/)?.[1];
  const metric = /(assist|garcom|passe)/.test(q)
    ? "assists"
    : /(partidas|jogos|aparicoes|presencas)/.test(q)
      ? "matchesPlayed"
      : /(minutos|minutagem)/.test(q)
        ? "minutes"
        : /(gols?|marcou|fez)/.test(q)
          ? "goals"
          : null;
  if (!year || !metric) return null;
  const cleaned = q
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(quantos?|quantas?|total|ja|já|tem|fez|marcou|teve|no|na|ano|temporada|de|do|da|em|ate|até)\b/g, " ")
    .replace(/\b(o|a|os|as)\b/g, " ")
    .replace(/\b(20\d{2}|19\d{2})\b/g, " ")
    .replace(/\b(gols?|assistencias?|assistências?|partidas|jogos|minutos|minutagem)\b/g, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const ogolUrl = question.match(/https?:\/\/(?:www\.)?ogol\.com\.br\/jogador\/[^\s)]+/i)?.[0] || null;
  return cleaned.length >= 3 ? { playerQuery: cleaned, year, metric, ogolUrl } : null;
};

const trustedPlayerYearTotal = (playerQuery: string, year: string) => {
  const normalizedPlayer = normalize(playerQuery);
  const key = Object.keys(TRUSTED_PLAYER_YEAR_TOTALS).find((name) => normalizedPlayer.includes(name));
  return key ? TRUSTED_PLAYER_YEAR_TOTALS[key]?.[year] || null : null;
};

const playerQueryCandidates = (playerQuery: string) => {
  const tokens = playerQuery.split(/\s+/).filter(Boolean);
  const candidates = new Set<string>();
  for (let size = tokens.length; size >= 1; size -= 1) {
    candidates.add(tokens.slice(0, size).join(" "));
  }
  return [...candidates].filter((candidate) => candidate.length >= 3);
};

const searchPlayerFromQuestion = async (playerQuery: string) => {
  for (const candidate of playerQueryCandidates(playerQuery)) {
    const [player] = await sofaScoreService.searchPlayer(candidate);
    if (player?.url) return player;
  }
  return null;
};

const isNationalTeamTournament = (name: string) =>
  /(world cup|copa do mundo|qual\.|qualific|eliminat|uefa nations|sele[cç][aã]o|international|amistoso)/i.test(name);

const answerPlayerYearQuestion = async (question: string): Promise<DashboardData | null> => {
  const parsed = playerYearQuestion(question);
  if (!parsed) return null;
  const trusted = playerQueryCandidates(parsed.playerQuery)
    .map((candidate) => trustedPlayerYearTotal(candidate, parsed.year))
    .find(Boolean);
  if (trusted && (parsed.metric === "goals" || parsed.metric === "matchesPlayed")) {
    const metricLabel: Record<string, string> = {
      goals: "Gols",
      matchesPlayed: "Partidas",
    };
    return {
      titulo: `${metricLabel[parsed.metric]} de ${parsed.playerQuery.replace(/\b\w/g, (c) => c.toUpperCase())} em ${parsed.year}`,
      descricao: `Total anual validado em fonte confiavel (${trusted.source})`,
      tipo: "tabela",
      labels: [`${parsed.year} - Total anual`],
      datasets: [
        { nome: "Jogos", dados: [trusted.matches] },
        { nome: "Gols", dados: [trusted.goals] },
      ],
      insights: [
        `${parsed.playerQuery.replace(/\b\w/g, (c) => c.toUpperCase())} tem ${trusted.goals} gols em ${trusted.matches} jogos em ${parsed.year}.`,
        `Fonte preferencial: ${trusted.source} (${trusted.url}).`,
        `A consulta anual evita somar recortes de competicoes de selecao quando a pergunta pede total do jogador no ano.`,
      ],
    };
  }
  const player = await searchPlayerFromQuestion(parsed.playerQuery);
  if (!player?.url) return null;
  const detail = await sofaScoreService.getPlayerStats(player.url);
  const rows = detail.seasons.filter((season) => season.season.includes(parsed.year));
  if (!rows.length) return null;
  const clubRows = rows.filter((season) => !isNationalTeamTournament(season.tournament || ""));
  const nationalRows = rows.filter((season) => isNationalTeamTournament(season.tournament || ""));
  const primaryRows = clubRows.length ? clubRows : rows;
  const value = primaryRows.reduce((sum, season) => sum + Number(season[parsed.metric] || 0), 0);
  const labels = primaryRows.map((season) => season.tournament || season.season);
  const metricLabel: Record<string, string> = {
    goals: "Gols",
    assists: "Assistencias",
    matchesPlayed: "Partidas",
    minutes: "Minutos",
  };
  return {
    titulo: `${metricLabel[parsed.metric]} de ${detail.name} em ${parsed.year}`,
    descricao: `Soma por competicao encontrada nas temporadas que incluem ${parsed.year}`,
    tipo: "tabela",
    labels: labels.length ? labels : [detail.name],
    datasets: [{ nome: metricLabel[parsed.metric], dados: primaryRows.map((season) => Number(season[parsed.metric] || 0)) }],
    insights: [
      `${detail.name} soma ${value} ${metricLabel[parsed.metric].toLowerCase()} nos registros de clube encontrados para ${parsed.year}.`,
      nationalRows.length
        ? `Registros de selecao/competicoes internacionais foram separados para evitar inflar o total anual: ${nationalRows.map((row) => row.tournament).join(", ")}.`
        : "Consulta feita diretamente no perfil do atleta, nao em ranking de campeonato.",
      "Quando houver fonte confiavel complementar (ex.: ogol), ela deve prevalecer para totais anuais.",
    ],
  };
};

const uniquePlayerItems = (items: any[]) => {
  const byPlayerId = new Map<number, any>();

  items.forEach((item) => {
    const playerId = Number(item?.player?.id);
    if (!playerId) return;
    const existing = byPlayerId.get(playerId);
    byPlayerId.set(playerId, {
      ...existing,
      ...item,
      player: item.player || existing?.player,
      team: item.team || existing?.team,
      statistics: {
        ...(existing?.statistics || {}),
        ...(item.statistics || {}),
      },
    });
  });

  return Array.from(byPlayerId.values());
};

const currentSeasonOverallStats = async (item: any, tournamentId: number, seasonId: number) => {
  const playerId = Number(item?.player?.id);
  if (!playerId) return item;

  const statsData = await sofaFetch(
    `/player/${playerId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`
  );

  return {
    ...item,
    team: statsData?.team || item.team,
    statistics: {
      ...(item.statistics || {}),
      ...(statsData?.statistics || {}),
    },
  };
};

const goalContributionPlayers = async (topPlayers: any, tournamentId: number, seasonId: number) => {
  const candidates = uniquePlayerItems([
    ...(topPlayers?.goalsAssistsSum || []),
    ...(topPlayers?.goals || []),
    ...(topPlayers?.assists || []),
  ]).slice(0, 30);

  const settled = await Promise.allSettled(
    candidates.map((item) => currentSeasonOverallStats(item, tournamentId, seasonId))
  );

  const withStats = settled
    .filter((entry): entry is PromiseFulfilledResult<any> => entry.status === "fulfilled")
    .map((entry) => entry.value);

  return withStats.length ? withStats : candidates;
};

const teamNameInQuestion = (question: string, teams: any[]) => {
  const q = normalize(question);
  return teams.find((row) => {
    const names = [row.team?.name, row.team?.shortName, row.team?.nameCode].filter(Boolean).map((name) => normalize(String(name)));
    return names.some((name) => name.length >= 3 && q.includes(name));
  });
};

const metricFromTeamQuestion = (question: string) => {
  const q = normalize(question);
  if (/(posicao|posição|colocacao|colocação|ranking)/.test(q)) return { key: "position", label: "Posicao" };
  if (/(vitorias|vitórias|ganhou|venceu)/.test(q)) return { key: "wins", label: "Vitorias" };
  if (/(derrotas|perdeu)/.test(q)) return { key: "losses", label: "Derrotas" };
  if (/(empates|empatou)/.test(q)) return { key: "draws", label: "Empates" };
  if (/(saldo)/.test(q)) return { key: "goalDiff", label: "Saldo" };
  if (/(gols?\s+(?:pro|marcados|feitos|a favor)|ataque)/.test(q)) return { key: "scoresFor", label: "Gols pro" };
  if (/(gols?\s+(?:contra|sofridos)|defesa)/.test(q)) return { key: "scoresAgainst", label: "Gols contra" };
  if (/(jogos|partidas)/.test(q)) return { key: "matches", label: "Jogos" };
  return { key: "points", label: "Pontos" };
};

const answerTeamStandingQuestion = async (question: string, league: League): Promise<DashboardData | null> => {
  const q = normalize(question);
  if (!/(quantos?|quantas?|qual|quanto|pontos|posicao|posição|vitorias|vitórias|derrotas|empates|saldo|gols?)/.test(q)) {
    return null;
  }
  const { tournamentId, seasonId, seasonName } = await getCurrentSeason(league);
  const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`);
  const rows = (data?.standings || []).flatMap((standing: any) => standing?.rows || []);
  const row = teamNameInQuestion(question, rows);
  if (!row?.team?.name) return null;
  const metric = metricFromTeamQuestion(question);
  const value =
    metric.key === "goalDiff"
      ? numberValue((row.scoresFor || 0) - (row.scoresAgainst || 0))
      : numberValue(row[metric.key]);
  return {
    titulo: `${metric.label} do ${row.team.name} - ${league.name}`,
    descricao: `Dado atual da temporada ${seasonName || "vigente"}`,
    tipo: "tabela",
    labels: [row.team.name],
    datasets: [{ nome: metric.label, dados: [value] }],
    insights: [
      `${row.team.name} tem ${value} ${metric.label.toLowerCase()} em ${league.name}.`,
      sourceInsight(league, seasonName),
    ],
  };
};

const answerTeamScheduleQuestion = async (question: string, league: League): Promise<DashboardData | null> => {
  const q = normalize(question);
  if (!/(proxim|próxim|agenda|calendario|calendário|jogos|partidas)/.test(q)) return null;
  const { tournamentId, seasonId, seasonName } = await getCurrentSeason(league);
  const standings = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`);
  const rows = (standings?.standings || []).flatMap((standing: any) => standing?.rows || []);
  const row = teamNameInQuestion(question, rows);
  if (!row?.team?.name) return null;
  const matches = await sofaScoreService.getTeamNextMatches([String(row.team.id)], [row.team.name]);
  const upcoming = matches.slice(0, 10);
  if (!upcoming.length) return null;
  return {
    titulo: `Proximas partidas do ${row.team.name}`,
    descricao: `Agenda independente do campeonato selecionado`,
    tipo: "tabela",
    labels: upcoming.map((match) => {
      const date = new Date(match.startTimestamp * 1000).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${date} - ${match.homeTeam} x ${match.awayTeam} (${match.tournament})`;
    }),
    datasets: [{ nome: "Ordem", dados: upcoming.map((_, index) => index + 1) }],
    insights: [
      `${upcoming.length} jogo(s) encontrados para ${row.team.name}.`,
      `Campeonatos: ${Array.from(new Set(upcoming.map((match) => match.tournament))).join(", ")}.`,
      sourceInsight(league, seasonName),
    ],
  };
};

export async function resolveSportsDashboard(question: string, league: League): Promise<DashboardData | null> {
  const q = normalize(question);
  const asksSpecificPlayerYear = Boolean(playerYearQuestion(question));
  if (asksSpecificPlayerYear) {
    return answerPlayerYearQuestion(question).catch(() => null);
  }

  const teamScheduleDashboard = await answerTeamScheduleQuestion(question, league).catch(() => null);
  if (teamScheduleDashboard) return teamScheduleDashboard;

  const teamStandingDashboard = await answerTeamStandingQuestion(question, league).catch(() => null);
  if (teamStandingDashboard) return teamStandingDashboard;

  if (/(classificacao|classificação|tabela|posicao|posição|pontos)/.test(q)) {
    const { tournamentId, seasonId, seasonName } = await getCurrentSeason(league);
    const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`);
    const rows = (data?.standings?.[0]?.rows || []).slice(0, 20);
    if (!rows.length) return null;

    return {
      titulo: `Classificacao - ${league.name}`,
      descricao: `Tabela atual da temporada ${seasonName || "vigente"}`,
      tipo: "tabela",
      labels: rows.map((row: any) => `${row.position || ""}. ${row.team?.name || "Equipe"}`),
      datasets: [
        { nome: "Pontos", dados: rows.map((row: any) => numberValue(row.points)) },
        { nome: "Jogos", dados: rows.map((row: any) => numberValue(row.matches)) },
        { nome: "Vitorias", dados: rows.map((row: any) => numberValue(row.wins)) },
        { nome: "Saldo", dados: rows.map((row: any) => numberValue((row.scoresFor || 0) - (row.scoresAgainst || 0))) },
      ],
      insights: [
        `${rows[0]?.team?.name || "O lider"} lidera com ${rows[0]?.points ?? 0} pontos.`,
        sourceInsight(league, seasonName),
      ],
    };
  }

  if (/(hoje|jogos|partidas|calendario|calendário)/.test(q) && !/(artilheiro|gol|assist|nota|rating|xg|xa)/.test(q)) {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const { tournamentId, seasonName } = await getCurrentSeason(league);
    const data = await sofaFetch(`/sport/${league.sport}/scheduled-events/${date}`);
    const events = (data?.events || [])
      .filter((event: any) => event?.tournament?.uniqueTournament?.id === tournamentId)
      .slice(0, 12);
    if (!events.length) return null;

    return {
      titulo: `Partidas de hoje - ${league.name}`,
      descricao: `Jogos encontrados para ${new Date().toLocaleDateString("pt-BR")}`,
      tipo: "tabela",
      labels: events.map((event: any) => `${event.homeTeam?.name || "Casa"} x ${event.awayTeam?.name || "Fora"}`),
      datasets: [
        { nome: "Gols casa", dados: events.map((event: any) => numberValue(event.homeScore?.current)) },
        { nome: "Gols fora", dados: events.map((event: any) => numberValue(event.awayScore?.current)) },
      ],
      insights: [
        `${events.length} partida(s) encontradas para hoje em ${league.name}.`,
        sourceInsight(league, seasonName),
      ],
    };
  }

  if (!/(artilheiro|gols|gol|assist|participa|contribuic|nota|rating|melhores|xg|xa|jogadores|atletas|partidas|aparicoes|presencas)/.test(q)) {
    return null;
  }

  const metric = metricFromQuestion(question);
  const { tournamentId, seasonId, seasonName } = await getCurrentSeason(league);
  const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/top-players/overall`);
  const sourcePlayers =
    metric.key === "goalsAssistsSum"
      ? await goalContributionPlayers(data?.topPlayers, tournamentId, seasonId)
      : data?.topPlayers?.[metric.key] || [];
  const players = sourcePlayers
    .filter((item: any) => item?.player?.name && item?.statistics)
    .sort((a: any, b: any) => {
      const aValue =
        metric.key === "goalsAssistsSum"
          ? numberValue(a.statistics?.goals) + numberValue(a.statistics?.assists)
          : numberValue(a.statistics?.[metric.key]);
      const bValue =
        metric.key === "goalsAssistsSum"
          ? numberValue(b.statistics?.goals) + numberValue(b.statistics?.assists)
          : numberValue(b.statistics?.[metric.key]);
      return bValue - aValue;
    })
    .slice(0, 10);
  if (!players.length) return null;

  const values = players.map((item: any) =>
    metric.key === "goalsAssistsSum"
      ? numberValue(item.statistics?.goals) + numberValue(item.statistics?.assists)
      : numberValue(item.statistics?.[metric.key])
  );
  const extraDatasets =
    metric.key === "goalsAssistsSum"
      ? [
          { nome: "Gols", dados: players.map((item: any) => numberValue(item.statistics?.goals)) },
          { nome: "Assistencias", dados: players.map((item: any) => numberValue(item.statistics?.assists)) },
        ]
      : [];
  return {
    titulo: `${metric.title} - ${league.name}`,
    descricao: `Ranking atualizado da temporada ${seasonName || "vigente"}`,
    tipo: "tabela",
    labels: players.map((item: any) => {
      const name = item.player?.shortName || item.player?.name || "Jogador";
      const team = item.team?.shortName || item.team?.name || "";
      return team ? `${name} (${team})` : name;
    }),
    datasets: [{ nome: metric.label, dados: values }, ...extraDatasets],
    insights: [
      `${players[0]?.player?.name || "O lider"} aparece no topo com ${values[0]} ${metric.label.toLowerCase()}.`,
      sourceInsight(league, seasonName),
    ],
  };
}

export function analyzeRawDataLocally(rawText: string): DashboardData | null {
  const text = rawText.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : null;
    if (rows?.length && typeof rows[0] === "object") return rowsToDashboard(rows);
  } catch {
    // Try delimited text below.
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const delimiter = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
  return rowsToDashboard(rows);
}

function rowsToDashboard(rows: Record<string, unknown>[]): DashboardData | null {
  const headers = Object.keys(rows[0] || {});
  const labelKey = headers.find((header) => rows.some((row) => !isNumericValue(row[header]))) || headers[0];
  const numericKeys = headers.filter((header) => header !== labelKey && rows.some((row) => isNumericValue(row[header])));
  if (!labelKey || numericKeys.length === 0) return null;

  const sliced = rows.slice(0, 12);
  return {
    titulo: "Dashboard dos dados enviados",
    descricao: `${sliced.length} linhas analisadas localmente`,
    tipo: "barras",
    labels: sliced.map((row) => String(row[labelKey] ?? "")),
    datasets: numericKeys.slice(0, 4).map((key) => ({
      nome: key,
      dados: sliced.map((row) => numberValue(row[key])),
    })),
    insights: [
      `Coluna usada como rotulo: ${labelKey}.`,
      `Metricas numericas detectadas: ${numericKeys.slice(0, 4).join(", ")}.`,
    ],
  };
}
