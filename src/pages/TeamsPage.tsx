import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, GitBranch, RefreshCw, Search, Star, Trophy, Wifi, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSport } from "@/contexts/SportContext";
import { useMatches, useStandings } from "@/hooks/useSofaScoreData";
import { useFavorites } from "@/contexts/FavoritesContext";
import FilterBar, { FilterDef } from "@/components/FilterBar";
import type { SofaMatch, SofaTeamStanding } from "@/services/sofaScoreService";

type ViewMode = "standings" | "knockout";

type KnockoutRound = {
  key: string;
  label: string;
  order: number;
  matches: SofaMatch[];
};

type RuleTone = "direct" | "playoff" | "secondary" | "warning" | "danger" | "neutral";

type RuleZone = {
  from: number;
  to: number;
  label: string;
  tone: RuleTone;
  filterGroup?: "top" | "bottom";
};

type LeagueStandingRule = {
  scope: "league" | "group";
  zones: RuleZone[];
  notes: string[];
  tiebreakers: string[];
};

const KNOCKOUT_ROUND_PATTERNS: Array<{ regex: RegExp; label: string; order: number }> = [
  { regex: /(play-?off|preliminar)/i, label: "Playoff", order: 1 },
  { regex: /(16 avos|1\/16|fase de 32|32 avos|round of 32)/i, label: "16 avos", order: 2 },
  { regex: /(oitavas|round of 16|1\/8|8 avos)/i, label: "Oitavas", order: 3 },
  { regex: /(quartas|quarter[-\s]?final|1\/4)/i, label: "Quartas de final", order: 4 },
  { regex: /(semi|semi[-\s]?final|1\/2)/i, label: "Semifinais", order: 5 },
  { regex: /(terceiro lugar|3rd place)/i, label: "3o lugar", order: 6 },
  { regex: /(final)/i, label: "Final", order: 7 },
];

const commonTiebreakers = [
  "Pontos",
  "Diferenca de gols",
  "Gols marcados",
  "Numero de vitorias",
  "Criterios especificos da competicao quando ainda houver empate",
];

const uefaLeaguePhaseRule: LeagueStandingRule = {
  scope: "league",
  zones: [
    { from: 1, to: 8, label: "Oitavas de final", tone: "direct", filterGroup: "top" },
    { from: 9, to: 24, label: "Playoff eliminatorio", tone: "playoff", filterGroup: "top" },
    { from: 25, to: 36, label: "Eliminado", tone: "neutral", filterGroup: "bottom" },
  ],
  notes: ["Top 8 avanca direto as oitavas; 9o ao 24o disputa playoff; 25o em diante e eliminado."],
  tiebreakers: ["Pontos", "Diferenca de gols", "Gols marcados", "Gols marcados fora", "Numero de vitorias", "Numero de vitorias fora"],
};

const groupTopTwoRule: LeagueStandingRule = {
  scope: "group",
  zones: [
    { from: 1, to: 2, label: "Oitavas de final", tone: "direct", filterGroup: "top" },
    { from: 3, to: 3, label: "Copa Sul-Americana / playoff", tone: "playoff", filterGroup: "top" },
    { from: 4, to: 4, label: "Eliminado", tone: "neutral", filterGroup: "bottom" },
  ],
  notes: ["Regra aplicada dentro de cada grupo."],
  tiebreakers: commonTiebreakers,
};

const LEAGUE_RULES: Record<string, LeagueStandingRule> = {
  "brasileirao-a": {
    scope: "league",
    zones: [
      { from: 1, to: 4, label: "Libertadores - fase de grupos", tone: "direct", filterGroup: "top" },
      { from: 5, to: 5, label: "Libertadores - fase preliminar", tone: "playoff", filterGroup: "top" },
      { from: 6, to: 12, label: "Sul-Americana", tone: "secondary", filterGroup: "top" },
      { from: 17, to: 20, label: "Rebaixamento", tone: "danger", filterGroup: "bottom" },
    ],
    notes: ["Desde 2026, a Copa do Brasil tambem distribui duas vagas para a Libertadores; repasses podem alterar as linhas finais."],
    tiebreakers: ["Numero de vitorias", "Saldo de gols", "Gols pro", "Confronto direto", "Menos cartoes vermelhos", "Menos cartoes amarelos"],
  },
  "brasileirao-b": {
    scope: "league",
    zones: [
      { from: 1, to: 2, label: "Acesso direto a Serie A", tone: "direct", filterGroup: "top" },
      { from: 3, to: 6, label: "Playoff de acesso", tone: "playoff", filterGroup: "top" },
      { from: 17, to: 20, label: "Rebaixamento a Serie C", tone: "danger", filterGroup: "bottom" },
    ],
    notes: ["Em 2026, os dois primeiros sobem direto; 3o ao 6o disputam playoffs pelas outras duas vagas."],
    tiebreakers: ["Numero de vitorias", "Saldo de gols", "Gols pro", "Confronto direto", "Menos cartoes vermelhos", "Menos cartoes amarelos"],
  },
  "premier-league": {
    scope: "league",
    zones: [
      { from: 1, to: 5, label: "Champions League", tone: "direct", filterGroup: "top" },
      { from: 6, to: 6, label: "Europa League", tone: "secondary", filterGroup: "top" },
      { from: 7, to: 7, label: "Conference League", tone: "playoff", filterGroup: "top" },
      { from: 18, to: 20, label: "Rebaixamento", tone: "danger", filterGroup: "bottom" },
    ],
    notes: ["Vagas europeias finais podem mudar por copas domesticas e desempenho das ligas na UEFA."],
    tiebreakers: ["Diferenca de gols", "Gols marcados", "Confronto direto quando necessario"],
  },
  "la-liga": {
    scope: "league",
    zones: [
      { from: 1, to: 4, label: "Champions League", tone: "direct", filterGroup: "top" },
      { from: 5, to: 5, label: "Europa League", tone: "secondary", filterGroup: "top" },
      { from: 6, to: 6, label: "Conference League", tone: "playoff", filterGroup: "top" },
      { from: 18, to: 20, label: "Rebaixamento", tone: "danger", filterGroup: "bottom" },
    ],
    notes: ["Vagas de Europa/Conference podem ser afetadas pelo campeao da Copa do Rei."],
    tiebreakers: ["Confronto direto", "Saldo de gols no confronto direto", "Diferenca de gols", "Gols marcados"],
  },
  "serie-a-it": {
    scope: "league",
    zones: [
      { from: 1, to: 4, label: "Champions League", tone: "direct", filterGroup: "top" },
      { from: 5, to: 5, label: "Europa League", tone: "secondary", filterGroup: "top" },
      { from: 6, to: 6, label: "Conference League", tone: "playoff", filterGroup: "top" },
      { from: 18, to: 20, label: "Rebaixamento", tone: "danger", filterGroup: "bottom" },
    ],
    notes: ["Vagas europeias podem mudar conforme Copa Italia e campanhas continentais."],
    tiebreakers: ["Confronto direto", "Diferenca de gols no confronto direto", "Diferenca de gols", "Gols marcados"],
  },
  bundesliga: {
    scope: "league",
    zones: [
      { from: 1, to: 4, label: "Champions League", tone: "direct", filterGroup: "top" },
      { from: 5, to: 5, label: "Europa League", tone: "secondary", filterGroup: "top" },
      { from: 6, to: 6, label: "Conference League", tone: "playoff", filterGroup: "top" },
      { from: 16, to: 16, label: "Playoff de rebaixamento", tone: "warning", filterGroup: "bottom" },
      { from: 17, to: 18, label: "Rebaixamento", tone: "danger", filterGroup: "bottom" },
    ],
    notes: ["O 16o disputa playoff contra o 3o colocado da 2. Bundesliga."],
    tiebreakers: ["Diferenca de gols", "Gols marcados", "Confronto direto", "Gols fora no confronto direto"],
  },
  "ligue-1": {
    scope: "league",
    zones: [
      { from: 1, to: 3, label: "Champions League", tone: "direct", filterGroup: "top" },
      { from: 4, to: 4, label: "Champions League - qualificacao", tone: "playoff", filterGroup: "top" },
      { from: 5, to: 5, label: "Europa League", tone: "secondary", filterGroup: "top" },
      { from: 6, to: 6, label: "Conference League", tone: "playoff", filterGroup: "top" },
      { from: 16, to: 16, label: "Playoff de rebaixamento", tone: "warning", filterGroup: "bottom" },
      { from: 17, to: 18, label: "Rebaixamento", tone: "danger", filterGroup: "bottom" },
    ],
    notes: ["O 16o joga playoff contra equipe vinda dos playoffs da Ligue 2."],
    tiebreakers: ["Diferenca de gols", "Gols marcados", "Confronto direto quando necessario"],
  },
  ucl: uefaLeaguePhaseRule,
  uel: uefaLeaguePhaseRule,
  uecl: uefaLeaguePhaseRule,
  "copa-mundo": {
    scope: "group",
    zones: [
      { from: 1, to: 2, label: "Fase eliminatoria", tone: "direct", filterGroup: "top" },
      { from: 3, to: 3, label: "Possivel classificacao entre melhores terceiros", tone: "playoff", filterGroup: "top" },
      { from: 4, to: 4, label: "Eliminado", tone: "neutral", filterGroup: "bottom" },
    ],
    notes: ["No Mundial 2026, os dois primeiros de cada grupo avancam e os oito melhores terceiros tambem."],
    tiebreakers: ["Pontos", "Diferenca de gols", "Gols marcados", "Confronto direto", "Fair play", "Sorteio"],
  },
  libertadores: groupTopTwoRule,
  sulamericana: {
    scope: "group",
    zones: [
      { from: 1, to: 1, label: "Oitavas de final", tone: "direct", filterGroup: "top" },
      { from: 2, to: 2, label: "Playoff das oitavas", tone: "playoff", filterGroup: "top" },
      { from: 3, to: 4, label: "Eliminado", tone: "neutral", filterGroup: "bottom" },
    ],
    notes: ["O lider do grupo avanca direto; o segundo disputa playoff contra terceiro colocado vindo da Libertadores."],
    tiebreakers: commonTiebreakers,
  },
  argentina: {
    scope: "group",
    zones: [{ from: 1, to: 8, label: "Fase final", tone: "direct", filterGroup: "top" }],
    notes: ["Formato de torneios curtos; rebaixamento depende de tabelas anuais/promedios que nao aparecem nesta tabela simples."],
    tiebreakers: commonTiebreakers,
  },
  colombia: {
    scope: "league",
    zones: [{ from: 1, to: 8, label: "Fase final", tone: "direct", filterGroup: "top" }],
    notes: ["Liga BetPlay classifica os oito primeiros para a fase final do torneio."],
    tiebreakers: commonTiebreakers,
  },
};

const toneClasses: Record<RuleTone, { row: string; badge: string; dot: string; border: string }> = {
  direct: {
    row: "bg-sport/5",
    badge: "bg-sport text-sport-foreground",
    dot: "bg-sport",
    border: "border-l-sport",
  },
  playoff: {
    row: "bg-emerald-400/5",
    badge: "bg-emerald-400 text-slate-950",
    dot: "bg-emerald-400",
    border: "border-l-emerald-400",
  },
  secondary: {
    row: "bg-sky-400/5",
    badge: "bg-sky-400 text-slate-950",
    dot: "bg-sky-400",
    border: "border-l-sky-400",
  },
  warning: {
    row: "bg-amber-400/5",
    badge: "bg-amber-400 text-slate-950",
    dot: "bg-amber-400",
    border: "border-l-amber-400",
  },
  danger: {
    row: "bg-destructive/5",
    badge: "bg-destructive text-destructive-foreground",
    dot: "bg-destructive",
    border: "border-l-destructive",
  },
  neutral: {
    row: "",
    badge: "bg-secondary text-muted-foreground",
    dot: "bg-muted-foreground",
    border: "border-l-border",
  },
};

const PositionBadge = ({ pos, zone }: { pos: number; zone?: RuleZone }) => {
  const classes = zone ? toneClasses[zone.tone].badge : "bg-secondary text-foreground";
  return <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${classes}`}>{pos}</span>;
};

const getKnockoutRoundMeta = (match: SofaMatch): { key: string; label: string; order: number } | null => {
  const roundLabel = (match.roundName || "").trim();
  if (!roundLabel) return null;
  const found = KNOCKOUT_ROUND_PATTERNS.find((item) => item.regex.test(roundLabel));
  if (!found) return null;
  return { key: found.label.toLowerCase(), label: found.label, order: found.order };
};

const hasMatchScore = (match: SofaMatch) =>
  typeof match.homeScore === "number" && typeof match.awayScore === "number";

const formatDateTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes("finished") || normalized === "ft") return "Final";
  if (normalized.includes("live")) return "Ao vivo";
  if (normalized.includes("scheduled")) return "Hoje";
  return status;
};

const getRuleZone = (rule: LeagueStandingRule | undefined, team: SofaTeamStanding) =>
  rule?.zones.find((zone) => team.position >= zone.from && team.position <= zone.to);

const TeamsPage = () => {
  const { sport, league } = useSport();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({ zone: "all", sortBy: "points", table: "total" });
  const [viewMode, setViewMode] = useState<ViewMode>("standings");
  const [rulesOpen, setRulesOpen] = useState(true);
  const { toggleFavorite, isFavorite } = useFavorites();
  const standingRule = LEAGUE_RULES[league.id];

  const tableType = filters.table === "home" || filters.table === "away" ? filters.table : "total";
  const { data: standings, status, error, refetch } = useStandings(league.sofascoreUrl, tableType);
  const { lastMatches, nextMatches, status: matchesStatus, refetch: refetchMatches } = useMatches(league.sofascoreUrl);
  const isStandingsLoading = status === "loading" && standings.length === 0;
  const isRefreshing = status === "loading" || matchesStatus === "loading";

  const filterDefs: FilterDef[] = [
    {
      key: "table",
      label: "Tabela",
      options: [
        { value: "total", label: "Geral" },
        { value: "home", label: "Casa" },
        { value: "away", label: "Fora" },
      ],
    },
    {
      key: "zone",
      label: "Zona",
      options: [
        { value: "top", label: "Zonas de classificacao" },
        { value: "mid", label: "Meio da tabela" },
        { value: "bottom", label: "Eliminacao/Rebaixamento" },
      ],
    },
    {
      key: "sortBy",
      label: "Ordenar",
      options: [
        { value: "points", label: "Pontos" },
        { value: "wins", label: "Vitorias" },
        { value: "scored", label: "Gols pro" },
        { value: "conceded", label: "Gols sofridos" },
        { value: "defense", label: "Melhor defesa" },
        { value: "goalDiff", label: "Saldo de gols" },
      ],
    },
  ];

  const processed = useMemo(() => {
    let list = standings.filter(
      (team) =>
        team.name.toLowerCase().includes(search.toLowerCase()) ||
        team.shortName?.toLowerCase().includes(search.toLowerCase())
    );
    if (filters.zone === "top") {
      list = list.filter((team) => getRuleZone(standingRule, team)?.filterGroup === "top");
    } else if (filters.zone === "bottom") {
      list = list.filter((team) => getRuleZone(standingRule, team)?.filterGroup === "bottom");
    } else if (filters.zone === "mid") {
      list = list.filter((team) => !getRuleZone(standingRule, team));
    }

    const sorted = [...list];
    switch (filters.sortBy) {
      case "wins":
        sorted.sort((a, b) => b.wins - a.wins);
        break;
      case "scored":
        sorted.sort((a, b) => b.scored - a.scored);
        break;
      case "conceded":
        sorted.sort((a, b) => a.conceded - b.conceded);
        break;
      case "defense":
        sorted.sort((a, b) => a.conceded - b.conceded || b.points - a.points);
        break;
      case "goalDiff":
        sorted.sort((a, b) => (b.scored - b.conceded) - (a.scored - a.conceded));
        break;
      default:
        sorted.sort((a, b) => a.position - b.position);
    }
    return sorted;
  }, [standings, search, filters, standingRule]);

  const hasGroups = useMemo(
    () => standings.some((team) => Boolean(team.groupName && team.groupName !== "Tabela geral")),
    [standings]
  );

  const groupedProcessed = useMemo(() => {
    if (!hasGroups) return [{ name: "", teams: processed }];
    const groups = new Map<string, SofaTeamStanding[]>();
    processed.forEach((team) => {
      const groupName = team.groupName || "Tabela geral";
      groups.set(groupName, [...(groups.get(groupName) || []), team]);
    });
    return Array.from(groups.entries()).map(([name, teams]) => ({ name, teams }));
  }, [hasGroups, processed]);

  const knockoutRounds = useMemo<KnockoutRound[]>(() => {
    const rounds = new Map<string, KnockoutRound>();

    [...lastMatches, ...nextMatches].forEach((match) => {
      const meta = getKnockoutRoundMeta(match);
      if (!meta) return;
      const current = rounds.get(meta.key) || { ...meta, matches: [] };
      current.matches.push(match);
      rounds.set(meta.key, current);
    });

    return Array.from(rounds.values())
      .map((round) => ({
        ...round,
        matches: round.matches.sort((a, b) => a.startTimestamp - b.startTimestamp),
      }))
      .sort((a, b) => a.order - b.order);
  }, [lastMatches, nextMatches]);

  const hasKnockoutBracket = knockoutRounds.length > 0;

  useEffect(() => {
    if (!hasKnockoutBracket && viewMode === "knockout") setViewMode("standings");
  }, [hasKnockoutBracket, viewMode]);

  const refreshAll = () => {
    refetch();
    refetchMatches();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Classificacao - {league.flag} {league.name}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            {isStandingsLoading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando...
              </>
            ) : status === "error" ? (
              <>
                <WifiOff className="h-3.5 w-3.5 text-destructive" /> Dados offline
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5 text-sport" />
                {processed.length} de {standings.length} equipes
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar equipe..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <FilterBar
        filters={viewMode === "standings" ? filterDefs : []}
        values={filters}
        onChange={(key, value) => setFilters((previous) => ({ ...previous, [key]: value }))}
        onClear={() => setFilters({ zone: "all", sortBy: "points", table: "total" })}
        headerActions={
          hasKnockoutBracket ? (
            <div className="flex rounded-lg border border-border bg-background p-1">
              <button
                onClick={() => setViewMode("standings")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === "standings"
                    ? "bg-sport text-sport-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Trophy className="h-3.5 w-3.5" />
                Classificacao
              </button>
              <button
                onClick={() => setViewMode("knockout")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === "knockout"
                    ? "bg-sport text-sport-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                Mata-mata
              </button>
            </div>
          ) : null
        }
      />

      {viewMode === "standings" && standingRule && (
        <Collapsible open={rulesOpen} onOpenChange={setRulesOpen} className="rounded-xl border border-border bg-card">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
            <div>
              <h2 className="font-display text-sm font-bold text-foreground">Regras</h2>
              <p className="mt-1 text-xs text-muted-foreground">Legenda das cores, criterios de classificacao e colunas exibidas.</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${rulesOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border px-4 pb-4 pt-3">
            <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
              <div className="space-y-3">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Cores</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {standingRule.zones.map((zone) => (
                      <div key={`${zone.from}-${zone.to}-${zone.label}`} className="flex items-center gap-2 text-xs text-foreground">
                        <span className={`h-2.5 w-2.5 rounded-full ${toneClasses[zone.tone].dot}`} />
                        <span className="font-medium">{zone.from === zone.to ? `${zone.from}o` : `${zone.from}o-${zone.to}o`}</span>
                        <span className="text-muted-foreground">{zone.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {standingRule.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Desempate</h3>
                  <ol className="space-y-1 text-xs text-foreground">
                    {standingRule.tiebreakers.map((item, index) => (
                      <li key={item}>{index + 1}. {item}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Colunas</h3>
                  <dl className="grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="font-semibold text-foreground">P</dt><dd className="text-muted-foreground">Pontos</dd>
                    <dt className="font-semibold text-foreground">J</dt><dd className="text-muted-foreground">Jogos disputados</dd>
                    <dt className="font-semibold text-foreground">V</dt><dd className="text-muted-foreground">Vitorias</dd>
                    <dt className="font-semibold text-foreground">E</dt><dd className="text-muted-foreground">Empates</dd>
                    <dt className="font-semibold text-foreground">D</dt><dd className="text-muted-foreground">Derrotas</dd>
                    <dt className="font-semibold text-foreground">GP</dt><dd className="text-muted-foreground">Gols pro</dd>
                    <dt className="font-semibold text-foreground">GC</dt><dd className="text-muted-foreground">Gols contra</dd>
                    <dt className="font-semibold text-foreground">SG</dt><dd className="text-muted-foreground">Saldo de gols</dd>
                  </dl>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {viewMode === "knockout" && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
          <div className="flex min-w-[760px] gap-4">
            {knockoutRounds.map((round) => (
              <div key={round.key} className="min-w-[220px] flex-1">
                <h2 className="mb-3 text-center text-xs font-semibold text-muted-foreground">{round.label}</h2>
                <div className="space-y-4">
                  {round.matches.map((match) => (
                    <div key={`${round.key}-${match.id}`} className="rounded-lg border border-border bg-background p-2 shadow-sm">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-2 py-1">
                          <span className="truncate text-xs font-semibold text-foreground">{match.homeTeam}</span>
                          <span className="font-display text-xs font-bold text-foreground">
                            {hasMatchScore(match) ? match.homeScore : "-"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-2 py-1">
                          <span className="truncate text-xs font-semibold text-foreground">{match.awayTeam}</span>
                          <span className="font-display text-xs font-bold text-foreground">
                            {hasMatchScore(match) ? match.awayScore : "-"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>{formatStatus(match.status)}</span>
                        <span>{formatDateTime(match.startTimestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-sport">
            <span className="h-2 w-2 rounded-full bg-sport" />
            Fases eliminatorias detectadas automaticamente pelas partidas da competicao.
          </p>
        </div>
      )}

      {viewMode === "standings" && processed.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="w-12 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">#</th>
                <th className="min-w-48 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">Time</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">P</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">J</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">V</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">E</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">D</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">GP</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">GC</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">SG</th>
                <th className="px-3 py-2 text-center text-[11px] font-medium text-muted-foreground">Fav</th>
              </tr>
            </thead>
            <tbody>
              {groupedProcessed.map((group) => (
                <Fragment key={group.name || "table"}>
                  {group.name && (
                    <tr className="border-b border-border bg-secondary/30">
                      <td colSpan={11} className="px-3 py-2 text-xs font-semibold text-foreground">{group.name}</td>
                    </tr>
                  )}
                  {group.teams.map((team, index) => {
                    const favorited = isFavorite("equipe", String(team.id));
                    const zone = getRuleZone(standingRule, team);
                    const zoneClasses = zone ? `${toneClasses[zone.tone].row} border-l-4 ${toneClasses[zone.tone].border}` : "border-l-4 border-l-transparent";
                    return (
                      <tr key={`${group.name || "table"}-${team.id}-${team.position}-${index}`} className={`border-b border-border transition-colors last:border-0 hover:bg-secondary/30 ${zoneClasses}`}>
                        <td className="px-3 py-2">
                          <PositionBadge pos={team.position} zone={zone} />
                        </td>
                        <td className="px-3 py-2 font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            {team.imageUrl ? (
                              <img src={team.imageUrl} alt="" className="h-6 w-6 object-contain" loading="lazy" />
                            ) : (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sport/10 text-[10px] text-sport">
                                {team.shortName}
                              </span>
                            )}
                            <span>{team.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex items-center justify-center rounded-md bg-sport-light px-2 py-0.5 text-xs font-bold text-sport">
                            {team.points}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{team.played}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{team.wins}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{team.draws}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{team.losses}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{team.scored}</td>
                        <td className="px-3 py-2 text-center text-muted-foreground">{team.conceded}</td>
                        <td className="px-3 py-2 text-center font-medium text-muted-foreground">{team.scored - team.conceded}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => toggleFavorite({ tipo: "equipe", referenciaId: String(team.id), nome: team.name, esporte: sport })}
                            className="transition-transform hover:scale-110"
                          >
                            <Star className={`h-4 w-4 ${favorited ? "fill-sport text-sport" : "text-muted-foreground"}`} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "standings" && !isStandingsLoading && standings.length > 0 && processed.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma equipe corresponde aos filtros aplicados.</p>
      )}

      {isStandingsLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="animate-pulse rounded-xl border border-border bg-card p-5">
              <div className="mb-3 h-4 w-3/4 rounded bg-secondary" />
              <div className="h-4 w-1/2 rounded bg-secondary" />
            </div>
          ))}
        </div>
      )}

      {error && standings.length === 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <WifiOff className="mx-auto mb-3 h-8 w-8 text-destructive/50" />
          <p className="mb-3 text-sm text-muted-foreground">Nao foi possivel carregar dados.</p>
          <button onClick={refreshAll} className="rounded-lg bg-sport px-4 py-2 text-xs font-medium text-sport-foreground hover:opacity-90">
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
};

export default TeamsPage;
