const OGOL_PROXY_URL = "/ogol-api";

export type OgolSeasonMetric = "matchesPlayed" | "minutes" | "goals" | "assists";

export type OgolSeasonRow = {
  competition: string;
  matchesPlayed: number;
  minutes: number;
  goals: number;
  assists: number;
};

export type OgolSeasonSummary = {
  playerName: string;
  season: string;
  scope: string;
  rows: OgolSeasonRow[];
  total: OgolSeasonRow;
  sourceUrl: string;
};

const absoluteOgolUrl = (path: string) =>
  path.startsWith("http") ? path : `https://www.ogol.com.br${path}`;

const htmlToText = (html: string) => {
  const document = new DOMParser().parseFromString(html, "text/html");
  return (document.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const textNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

const cleanPlayerPath = (path: string) =>
  path
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .split("?")[0];

const findPlayerPath = (html: string) => {
  const matches = Array.from(html.matchAll(/href=["'](\/jogador\/[^"']+?\/\d+)(?:[?"'][^"']*)/gi));
  return matches[0]?.[1] ? cleanPlayerPath(matches[0][1]) : null;
};

const parseSeasonRows = (segment: string) => {
  const rows: OgolSeasonRow[] = [];
  const rowPattern = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .ªº()/-]+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?=\s+(?:[A-Za-zÀ-ÿ]|Total|J\s*=)|$)/g;

  for (const match of segment.matchAll(rowPattern)) {
    rows.push({
      competition: match[1].trim(),
      matchesPlayed: textNumber(match[2]),
      minutes: textNumber(match[3]),
      goals: textNumber(match[4]),
      assists: textNumber(match[5]),
    });
  }

  return rows;
};

const parseSeasonSummary = (html: string, sourceUrl: string): OgolSeasonSummary | null => {
  const text = htmlToText(html);
  const playerName = text.match(/^\s*([^:]+?)\s+::/)?.[1]?.trim() || "Jogador";
  const summaryMatch = text.match(
    /resumo da temporada\s+([0-9]{4}\/[0-9]{2}|[0-9]{2}\/[0-9]{2}|[0-9]{4})(?:\s+\[([^\]]+)\])?\s+(?:[A-Z]\s+)?(\d+)\s+Jogos\s+(\d+)\s+Gols\s+J\s+M\s+GM\s+ASS\s+(.+?)\s+J\s*=Jogos/i
  );

  if (!summaryMatch) return null;

  const rows = parseSeasonRows(summaryMatch[5]);
  const totalFromRows = rows.find((row) => row.competition.toLowerCase() === "total");
  const competitionRows = rows.filter((row) => row.competition.toLowerCase() !== "total");
  const total =
    totalFromRows ||
    competitionRows.reduce<OgolSeasonRow>(
      (sum, row) => ({
        competition: "Total",
        matchesPlayed: sum.matchesPlayed + row.matchesPlayed,
        minutes: sum.minutes + row.minutes,
        goals: sum.goals + row.goals,
        assists: sum.assists + row.assists,
      }),
      { competition: "Total", matchesPlayed: 0, minutes: 0, goals: 0, assists: 0 }
    );

  if (!competitionRows.length) return null;

  return {
    playerName,
    season: summaryMatch[1],
    scope: summaryMatch[2] || "",
    rows: competitionRows,
    total,
    sourceUrl,
  };
};

export const ogolService = {
  async getPlayerSeasonSummary(playerQuery: string): Promise<OgolSeasonSummary | null> {
    const searchRes = await fetch(`${OGOL_PROXY_URL}/search.php?inputString=${encodeURIComponent(playerQuery)}`, {
      headers: { Accept: "text/html" },
      redirect: "manual",
    });
    if (!searchRes.ok && (searchRes.status < 300 || searchRes.status >= 400)) {
      throw new Error(`oGol search HTTP ${searchRes.status}`);
    }

    const searchHtml = searchRes.status >= 300 && searchRes.status < 400 ? "" : await searchRes.text();
    const playerPath = cleanPlayerPath(searchRes.headers.get("Location") || "") || findPlayerPath(searchHtml);
    if (!playerPath) return null;

    const playerRes = await fetch(`${OGOL_PROXY_URL}${playerPath}`, {
      headers: { Accept: "text/html" },
    });
    if (!playerRes.ok) throw new Error(`oGol player HTTP ${playerRes.status}`);

    const sourceUrl = absoluteOgolUrl(playerPath);
    return parseSeasonSummary(await playerRes.text(), sourceUrl);
  },

  parseSeasonSummary,
};
