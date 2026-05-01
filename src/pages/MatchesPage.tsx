import { useMemo, useState } from "react";
import { Search, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSport } from "@/contexts/SportContext";
import { useMatches, useTodayMatches, useLiveMatches } from "@/hooks/useSofaScoreData";
import { SofaMatch } from "@/services/sofaScoreService";
import FilterBar, { FilterDef } from "@/components/FilterBar";

const isLive = (s: string) =>
  !["scheduled", "Not started", "agendado", "Finished", "FT", "After Extra Time", "After Penalties", "encerrado", "Postponed"].includes(s);

const isFinished = (s: string) =>
  ["Finished", "FT", "After Extra Time", "After Penalties", "encerrado"].includes(s);

const isScheduled = (s: string) =>
  ["scheduled", "Not started", "agendado"].includes(s);

const statusConfig = (s: string) => {
  if (isScheduled(s)) return { text: "Agendada", cls: "bg-sport-light text-sport" };
  if (isFinished(s)) return { text: "Finalizada", cls: "bg-secondary text-muted-foreground" };
  if (s === "Postponed") return { text: "Adiada", cls: "bg-orange-100 text-orange-600" };
  if (s === "intervalo") return { text: "Intervalo", cls: "bg-orange-100 text-orange-600" };
  return { text: "Ao Vivo 🔴", cls: "bg-destructive/10 text-destructive" };
};

const formatDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

const inDateRange = (ts: number, range: string) => {
  if (!range || range === "all") return true;
  const now = Date.now();
  const date = ts * 1000;
  const day = 86400000;
  if (range === "today") {
    const d = new Date(); d.setHours(0,0,0,0);
    return date >= d.getTime() && date < d.getTime() + day;
  }
  if (range === "tomorrow") {
    const d = new Date(); d.setHours(0,0,0,0);
    return date >= d.getTime() + day && date < d.getTime() + 2 * day;
  }
  if (range === "week") return date >= now && date <= now + 7 * day;
  if (range === "past") return date < now;
  return true;
};

const MatchCard = ({ m }: { m: SofaMatch & { _type?: string } }) => {
  const st = statusConfig(m.status);
  const isUpcoming = m._type === "upcoming" || m.homeScore === null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <div className="text-right flex-1">
          <p className="font-display font-semibold text-foreground">{m.homeTeam}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isUpcoming ? (
            <span className="font-display text-xl font-bold text-foreground">
              {m.homeScore} — {m.awayScore}
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">vs</span>
          )}
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold text-foreground">{m.awayTeam}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-3 flex-wrap">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span>
        {m.roundInfo && <span className="text-xs text-muted-foreground">Rodada {m.roundInfo}</span>}
        <span className="text-xs text-muted-foreground">{m.tournament}</span>
        <span className="text-xs text-muted-foreground">{formatDate(m.startTimestamp)}</span>
      </div>
    </div>
  );
};

const MatchesPage = () => {
  const { league } = useSport();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"league" | "today" | "live">("league");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all", date: "all" });

  const { lastMatches, nextMatches, allMatches, status, error, refetch } = useMatches(league.sofascoreUrl);
  const { data: todayMatches, status: todayStatus, refetch: refetchToday } = useTodayMatches();
  const { data: liveMatches, status: liveStatus, refetch: refetchLive } = useLiveMatches();

  const isLoading = tab === "league" ? status === "loading" : tab === "today" ? todayStatus === "loading" : liveStatus === "loading";

  const filterDefs: FilterDef[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "live", label: "🔴 Ao Vivo" },
        { value: "scheduled", label: "Agendadas" },
        { value: "finished", label: "Encerradas" },
      ],
    },
    {
      key: "date",
      label: "Período",
      options: [
        { value: "today", label: "Hoje" },
        { value: "tomorrow", label: "Amanhã" },
        { value: "week", label: "Próximos 7 dias" },
        { value: "past", label: "Já encerradas" },
      ],
    },
  ];

  const applyFilters = <T extends { homeTeam: string; awayTeam: string; tournament: string; status: string; startTimestamp?: number }>(
    list: T[]
  ): T[] => {
    const q = search.toLowerCase();
    return list.filter((m) => {
      if (q && !(m.homeTeam.toLowerCase().includes(q) || m.awayTeam.toLowerCase().includes(q) || m.tournament.toLowerCase().includes(q))) return false;
      if (filters.status === "live" && !isLive(m.status)) return false;
      if (filters.status === "scheduled" && !isScheduled(m.status)) return false;
      if (filters.status === "finished" && !isFinished(m.status)) return false;
      if (m.startTimestamp !== undefined && !inDateRange(m.startTimestamp, filters.date)) return false;
      return true;
    });
  };

  const filtered = useMemo(() => (tab === "league" ? applyFilters(allMatches) : []), [tab, allMatches, search, filters]);
  const filteredToday = useMemo(() => (tab === "today" ? applyFilters(todayMatches) : []), [tab, todayMatches, search, filters]);
  const filteredLive = useMemo(() => (tab === "live" ? applyFilters(liveMatches) : []), [tab, liveMatches, search, filters]);

  const handleRefetch = () => {
    if (tab === "league") refetch();
    else if (tab === "today") refetchToday();
    else refetchLive();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Partidas</h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
            {isLoading ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando...</>
            ) : (
              <><Wifi className="h-3.5 w-3.5 text-sport" />
                {tab === "league" && <>{lastMatches.length} recentes · {nextMatches.length} agendadas — {league.name}</>}
                {tab === "today" && <>{todayMatches.length} jogos hoje</>}
                {tab === "live" && <>{liveMatches.length} ao vivo agora</>}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleRefetch}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por equipe ou liga..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
        {[
          { key: "league" as const, label: `${league.flag} ${league.name}` },
          { key: "today" as const, label: `📅 Hoje (${todayMatches.length})` },
          { key: "live" as const, label: `🔴 Ao Vivo (${liveMatches.length})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
              tab === t.key ? "bg-sport text-sport-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <FilterBar
        filters={filterDefs}
        values={filters}
        onChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
        onClear={() => setFilters({ status: "all", date: "all" })}
      />

      <div className="space-y-3">
        {isLoading && [...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
            <div className="flex items-center justify-center gap-8">
              <div className="h-4 bg-secondary rounded w-32" />
              <div className="h-6 bg-secondary rounded w-16" />
              <div className="h-4 bg-secondary rounded w-32" />
            </div>
          </div>
        ))}

        {tab === "league" && !isLoading && filtered.length === 0 && !error && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhuma partida encontrada com os filtros aplicados.</p>
        )}
        {tab === "league" && filtered.map((m) => (<MatchCard key={`${m.id}_${(m as any)._type}`} m={m} />))}

        {tab === "today" && !isLoading && filteredToday.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum jogo encontrado para os filtros aplicados.</p>
        )}
        {tab === "today" && filteredToday.map((m) => {
          const st = statusConfig(m.status);
          return (
            <div key={m.id} className="rounded-xl border border-border bg-card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="text-right flex-1"><p className="font-display font-semibold text-foreground">{m.homeTeam}</p></div>
                <div className="text-center">
                  {m.homeScore !== null ? (
                    <span className="font-display text-xl font-bold text-foreground">{m.homeScore} — {m.awayScore}</span>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">{m.time || "vs"}</span>
                  )}
                </div>
                <div className="flex-1"><p className="font-display font-semibold text-foreground">{m.awayTeam}</p></div>
              </div>
              <div className="mt-2 flex items-center justify-center gap-3 flex-wrap">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span>
                <span className="text-xs text-muted-foreground">{m.tournament}</span>
                {m.time && <span className="text-xs text-muted-foreground">{m.time}</span>}
              </div>
            </div>
          );
        })}

        {tab === "live" && !isLoading && filteredLive.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg font-medium text-muted-foreground">Nenhum jogo ao vivo no momento</p>
            <p className="text-sm text-muted-foreground mt-1">Os jogos ao vivo aparecerão aqui automaticamente</p>
          </div>
        )}
        {tab === "live" && filteredLive.map((m) => (
          <div key={m.id} className="rounded-xl border border-destructive/30 bg-card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="text-right flex-1"><p className="font-display font-semibold text-foreground">{m.homeTeam}</p></div>
              <div className="text-center">
                <span className="font-display text-xl font-bold text-destructive">{m.homeScore} — {m.awayScore}</span>
                {m.minute && <p className="text-xs text-destructive font-medium mt-1">{m.minute}'</p>}
              </div>
              <div className="flex-1"><p className="font-display font-semibold text-foreground">{m.awayTeam}</p></div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">🔴 Ao Vivo</span>
              <span className="text-xs text-muted-foreground">{m.tournament}</span>
            </div>
          </div>
        ))}

        {error && allMatches.length === 0 && tab === "league" && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
            <WifiOff className="mx-auto h-8 w-8 text-destructive/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Não foi possível carregar dados.</p>
            <button onClick={refetch} className="rounded-lg bg-sport px-4 py-2 text-xs font-medium text-sport-foreground hover:opacity-90">
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchesPage;
