/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DashboardData } from "@/components/DynamicDashboard";
import type { League } from "@/data/leagues";

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
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
};

const sourceInsight = (league: League, seasonName: string) =>
  `Fonte: SofaScore API, ${league.name}${seasonName ? ` ${seasonName}` : ""}. Dados consultados em tempo real.`;

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

export async function resolveSportsDashboard(question: string, league: League): Promise<DashboardData | null> {
  const q = normalize(question);

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
  const labelKey = headers.find((header) => rows.some((row) => Number.isNaN(Number(row[header])))) || headers[0];
  const numericKeys = headers.filter((header) => header !== labelKey && rows.some((row) => Number.isFinite(Number(row[header]))));
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
