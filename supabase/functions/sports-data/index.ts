import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function requireFirecrawlKey(): string {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  return key;
}

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
  const aiKey = Deno.env.get("OPENAI_API_KEY");
  if (!aiKey) throw new Error("OPENAI_API_KEY not configured");

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

  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You extract structured data from web page content. Output ONLY valid JSON matching the requested schema. Use ONLY information present in the provided content — never invent placeholders." },
        { role: "user", content: `${prompt}\n\nSchema (JSON):\n${JSON.stringify(schema)}\n\nPage content (markdown):\n${trimmed}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
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

const matchesSchema = {
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
          date: { type: "string" },
          round: { type: "number" },
        },
      },
    },
  },
};

const liveMatchesSchema = {
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
          minute: { type: "string" },
          tournament: { type: "string" },
          status: { type: "string" },
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

      const data = await scrapeExtract(
        leagueUrl,
        `Extract the complete league standings table. For each team: position number, full team name, short name/abbreviation, games played (J/GP), wins (V/W), draws (E/D), losses (D/L), goals or points scored (GP/GF), goals or points conceded (GC/GA), total points (Pts/P).`,
        standingsSchema
      );

      result = {
        teams: (data?.teams || []).map((t: any, i: number) => ({
          position: t.position || i + 1,
          id: i + 1000,
          name: t.name || "Unknown",
          shortName: t.shortName || (t.name || "UNK").substring(0, 3).toUpperCase(),
          played: t.played || 0,
          wins: t.wins || 0,
          draws: t.draws || 0,
          losses: t.losses || 0,
          scored: t.scored || 0,
          conceded: t.conceded || 0,
          points: t.points || 0,
        })),
      };
    } else if (action === "matches_last" || action === "matches_next") {
      const { leagueUrl } = body;
      if (!leagueUrl) throw new Error("leagueUrl required");
      const isLast = action === "matches_last";

      // Map SofaScore league URL to a placardefutebol slug (page contains both past + upcoming matches)
      const leagueSlug = (() => {
        const u = leagueUrl.toLowerCase();
        if (u.includes("brasileirao-serie-a") || u.includes("brazil/serie-a")) return "brasileirao-serie-a";
        if (u.includes("brasileirao-serie-b")) return "brasileirao-serie-b";
        if (u.includes("premier-league")) return "premier-league";
        if (u.includes("laliga") || u.includes("la-liga")) return "la-liga";
        if (u.includes("bundesliga")) return "bundesliga";
        if (u.includes("ligue-1")) return "ligue-1";
        if (u.includes("italy/serie-a") || u.includes("/serie-a/23")) return "serie-a-italia";
        if (u.includes("libertadores")) return "libertadores";
        if (u.includes("sul-americana") || u.includes("sudamericana")) return "sul-americana";
        if (u.includes("champions-league")) return "champions-league";
        if (u.includes("europa-league")) return "europa-league";
        return "brasileirao-serie-a";
      })();

      const sourceUrl = `https://www.placardefutebol.com.br/${leagueSlug}`;
      const todayIso = new Date().toISOString().slice(0, 10);

      const strictRules = `CRITICAL RULES:
- Use ONLY the REAL club names exactly as they appear on the page (e.g. "Flamengo", "Palmeiras", "Real Madrid").
- NEVER invent or use placeholders like "Team A", "Time 1", "Equipe X", "Home", "Away", "TBD".
- If you cannot read both real team names from the page text, OMIT that match entirely.
- Return an EMPTY matches array if you cannot find real matches. Do NOT fabricate examples.`;

      // Extract ALL matches on the page (past + upcoming) — server-side splits by timestamp
      const prompt = `Today is ${todayIso}. This Placar de Futebol page lists league matches in two sections: "Últimos jogos" (finished, with scores like "2 - 0") and "Próximos jogos" (upcoming, with kickoff times like "16:00" and no score).
${strictRules}
Extract ALL matches from BOTH sections (up to 30 total). For each: homeTeam, awayTeam, homeScore (integer if finished, null if upcoming), awayScore (integer if finished, null if upcoming), status ("Finished" if it has a score, "Scheduled" otherwise), date as ISO 8601 with year (e.g. "2026-04-19T20:00:00") — combine the date label ("ontem"/"hoje"/"Sábado, 25/04"/"19/04") with the kickoff time and year ${todayIso.slice(0, 4)}, and round/rodada number if shown.`;

      const data = await scrapeMarkdownThenAI(sourceUrl, prompt, matchesSchema);

      const nowSec = Math.floor(Date.now() / 1000);
      const rawMatches = (data?.matches || []).map((m: any, i: number) => {
        let ts = 0;
        if (m.date) {
          const parsed = new Date(m.date).getTime();
          if (!isNaN(parsed)) ts = Math.floor(parsed / 1000);
        }
        return {
          id: (isLast ? 1000 : 5000) + i,
          homeTeam: (m.homeTeam || "").trim(),
          awayTeam: (m.awayTeam || "").trim(),
          homeScore: isLast ? (m.homeScore ?? null) : null,
          awayScore: isLast ? (m.awayScore ?? null) : null,
          status: m.status || (isLast ? "Finished" : "Scheduled"),
          startTimestamp: ts,
          roundInfo: typeof m.round === "number" && m.round > 0 ? m.round : null,
        };
      });

      // Reject placeholder/generic team names
      const placeholderRe = /^(team|equipe|time|home|away|casa|fora)\s*[a-z0-9]{0,2}$|^(tbd|n\/?a|unknown|---?|\?+)$/i;
      const isRealName = (s: string) => !!s && s.trim().length >= 2 && !placeholderRe.test(s.trim());

      // Detect "sequence of placeholders" as a hard signal the LLM hallucinated
      const allLetters = rawMatches.every((m: any) =>
        /^team\s*[a-z]$/i.test(m.homeTeam) || /^team\s*[a-z]$/i.test(m.awayTeam)
      );
      if (allLetters && rawMatches.length > 0) {
        console.warn(`${action}: detected hallucinated Team A/B/C — discarding all`);
        result = [];
      } else {
        const filtered = rawMatches.filter((m: any) => {
          if (!isRealName(m.homeTeam) || !isRealName(m.awayTeam)) return false;
          if (!m.startTimestamp) return false;
          if (isLast) return m.startTimestamp < nowSec;
          return m.startTimestamp >= nowSec - 3600;
        });
        filtered.sort((a: any, b: any) =>
          isLast ? b.startTimestamp - a.startTimestamp : a.startTimestamp - b.startTimestamp
        );
        console.log(`${action}: ${rawMatches.length} raw -> ${filtered.length} after filter (source: ${sourceUrl})`);
        result = filtered;
      }
    } else if (action === "live") {
      try {
        const liveRules = `CRITICAL RULES:
- ONLY include matches that are CURRENTLY in progress RIGHT NOW.
- A live match MUST have a running minute indicator: "12'", "45+2'", "HT" (intervalo), "1T"/"2T", "3Q" (quarter), or an explicit "AO VIVO" badge next to the score.
- IGNORE matches showing kickoff times like "16:00", "19:30" — those are SCHEDULED, NOT live.
- IGNORE any match labeled "Encerrado", "Encerrada", "Finalizado", "Finalizada", "FT", "Final", "Pós-jogo", "Após pênaltis", "Após prorrogação" — those are FINISHED, NOT live. Do NOT include them even if they appear near the top of the page.
- The "minute" field MUST be ONLY the running minute (e.g. "32'", "45+2'", "HT", "Intervalo"). NEVER put scores, dates or status words in the minute field.
- Use REAL club names exactly as they appear (e.g. "Flamengo", "Real Madrid"). NEVER use "Team A", "Time 1", "Home", "Away".
- If NOTHING is currently live, return { "matches": [] }. Do NOT fabricate examples.`;

        const data = await scrapeMarkdownThenAI(
          "https://www.placardefutebol.com.br/",
          `${liveRules}\nFrom this Placar de Futebol homepage, look ONLY at the "AO VIVO" / "Ao vivo agora" / "Em andamento" section at the top. Extract every match in that section. For each: homeTeam, awayTeam, homeScore (current goals/points, integer), awayScore (current goals/points, integer), minute (current minute string like "32'" or "HT"), tournament (league/competition name), status (always "Live").`,
          liveMatchesSchema
        );
        const rawLive = data?.matches || [];
        console.log(`Live raw: ${rawLive.length}`);

        const placeholderRe = /^(team|equipe|time|home|away|casa|fora)\s*[a-z0-9]{0,2}$|^(tbd|n\/?a|unknown|---?|\?+)$/i;
        const finishedRe = /encerr|finaliz|finish|\bft\b|\bfinal\b|after\s*pen|p[oô]s.?p[eê]nal|p[oó]s.?jogo|prorroga/i;
        const scheduledStatusRe = /agend|scheduled|not\s*started|kick\s*off|a\s*come[cç]ar|hoje\s*\d{1,2}:\d{2}/i;
        const scheduledTimeRe = /^\s*\d{1,2}:\d{2}\s*$/;
        // Strict live minute: "32'", "45+2'", "HT", "Intervalo", "1T"/"2T", "1Q".."4Q"
        const liveMinuteRe = /^(\d{1,3}('|\s*\+\s*\d+'?)?|ht|halftime|intervalo|[12]t|[1-4]q)$/i;

        const filtered = rawLive.filter((m: any) => {
          const home = (m.homeTeam || "").trim();
          const away = (m.awayTeam || "").trim();
          if (!home || !away) return false;
          if (placeholderRe.test(home) || placeholderRe.test(away)) return false;
          const minute = (m.minute || "").trim();
          const status = (m.status || "").trim();
          // Reject anything that smells finished or scheduled (in either field)
          if (finishedRe.test(status) || finishedRe.test(minute)) return false;
          if (scheduledStatusRe.test(status) || scheduledStatusRe.test(minute)) return false;
          if (scheduledTimeRe.test(minute)) return false;
          // Minute is required and must match the strict live pattern
          if (!minute) return false;
          // Normalize: strip trailing punctuation/spaces before testing
          const cleanMinute = minute.replace(/\s+/g, "").replace(/[.,;]+$/, "");
          if (!liveMinuteRe.test(cleanMinute)) return false;
          // Numeric minute sanity check: football 1-130, basketball quarters handled above
          const numMatch = cleanMinute.match(/^(\d{1,3})/);
          if (numMatch) {
            const n = parseInt(numMatch[1], 10);
            if (n < 1 || n > 130) return false;
          }
          return true;
        });
        console.log(`Live filtered: ${filtered.length}`);

        result = filtered.map((m: any, i: number) => ({
          id: 9000 + i,
          homeTeam: m.homeTeam.trim(),
          awayTeam: m.awayTeam.trim(),
          homeScore: m.homeScore ?? 0,
          awayScore: m.awayScore ?? 0,
          status: "Live",
          minute: m.minute || null,
          tournament: m.tournament || "Desconhecido",
        }));
      } catch (err) {
        console.error("Live scraping error:", err);
        result = [];
      }
    } else if (action === "today_matches") {
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
    } else if (action === "player_search") {
      const { query } = body;
      if (!query) throw new Error("query required");

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
      // Iconic players that should always be ranked top when their name is searched
      const iconicPlayers: Record<string, string[]> = {
        "neymar": ["neymar jr", "neymar"],
        "messi": ["lionel messi", "leo messi"],
        "ronaldo": ["cristiano ronaldo"],
        "cristiano": ["cristiano ronaldo"],
        "mbappe": ["kylian mbappé", "kylian mbappe"],
        "haaland": ["erling haaland"],
        "vinicius": ["vinícius júnior", "vinicius jr"],
        "rodrygo": ["rodrygo goes"],
        "endrick": ["endrick"],
        "pedri": ["pedri"],
        "yamal": ["lamine yamal"],
        "bellingham": ["jude bellingham"],
      };
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
        // Iconic player override: huge boost
        for (const key of Object.keys(iconicPlayers)) {
          if (q.includes(key)) {
            for (const variant of iconicPlayers[key]) {
              if (nameLower.includes(variant)) score += 2000;
            }
          }
        }
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
              const aiKey = Deno.env.get("OPENAI_API_KEY");
              if (aiKey) {
                const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${aiKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: "gpt-4.1-mini",
                    messages: [
                      {
                        role: "system",
                        content:
                          "Traduza para Português do Brasil. Responda APENAS com a tradução, sem explicações, sem aspas. Mantenha nomes próprios. Se já estiver em PT-BR, repita igual. Máximo 200 caracteres.",
                      },
                      { role: "user", content: baseDesc },
                    ],
                  }),
                });
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
    } else if (action === "team_players") {
      const { teamName } = body;
      if (!teamName) throw new Error("teamName required");

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
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
