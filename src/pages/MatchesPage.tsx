import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, Search, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSport } from "@/contexts/SportContext";
import { useMatches, useTodayMatches, useLiveMatches } from "@/hooks/useSofaScoreData";
import { SofaLiveMatch, SofaMatch } from "@/services/sofaScoreService";
import FilterBar, { FilterDef } from "@/components/FilterBar";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const normalizedStatus = (s: string) => s.toLowerCase();

const isLive = (s: string) => {
  const status = normalizedStatus(s);
  return status === "live" || status === "inprogress" || status === "intervalo";
};

const isFinished = (s: string) => {
  const status = normalizedStatus(s);
  return status === "finished" || status === "ft" || status.includes("after") || status === "encerrado";
};

const isScheduled = (s: string) => {
  const status = normalizedStatus(s);
  return status === "scheduled" || status === "not started" || status === "agendado" || status === "notstarted";
};

const statusConfig = (s: string) => {
  if (isScheduled(s)) return { text: "Agendada", cls: "bg-sport-light text-sport" };
  if (isFinished(s)) return { text: "Finalizada", cls: "bg-secondary text-muted-foreground" };
  if (isLive(s)) return { text: "Ao vivo", cls: "bg-destructive/10 text-destructive" };
  if (normalizedStatus(s) === "postponed") return { text: "Adiada", cls: "bg-orange-100 text-orange-600" };
  return { text: s || "Indefinido", cls: "bg-secondary text-muted-foreground" };
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

type TeamSide = "home" | "away";
type WatchedMatch = { side: TeamSide };
type ScoreSnapshot = { homeScore: number; awayScore: number };

const createTone = (ctx: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType) => {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
};

const playGoalSound = (mood: "celebration" | "lament") => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const notes = mood === "celebration"
    ? [523.25, 659.25, 783.99, 1046.5]
    : [392, 329.63, 261.63, 196];

  notes.forEach((frequency, index) => {
    createTone(ctx, frequency, now + index * 0.13, 0.18, mood === "celebration" ? "triangle" : "sine");
  });

  window.setTimeout(() => void ctx.close(), 1200);
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
        <span className="text-xs text-muted-foreground">Local: {m.venue || "TBD"}</span>
      </div>
    </div>
  );
};

const MatchesPage = () => {
  const { league } = useSport();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"league" | "today" | "live">("league");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all", date: "all" });
  const [watchedMatches, setWatchedMatches] = useState<Record<number, WatchedMatch>>({});
  const scoreSnapshots = useRef<Record<number, ScoreSnapshot>>({});

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

  useEffect(() => {
    const nextSnapshots: Record<number, ScoreSnapshot> = {};

    liveMatches.forEach((match) => {
      const previous = scoreSnapshots.current[match.id];
      nextSnapshots[match.id] = { homeScore: match.homeScore, awayScore: match.awayScore };

      if (!previous) return;

      const watched = watchedMatches[match.id];
      if (!watched) return;

      const homeGoals = Math.max(0, match.homeScore - previous.homeScore);
      const awayGoals = Math.max(0, match.awayScore - previous.awayScore);
      if (homeGoals === 0 && awayGoals === 0) return;

      const scoringSide: TeamSide | null = homeGoals > awayGoals ? "home" : awayGoals > homeGoals ? "away" : null;
      if (!scoringSide) return;

      playGoalSound(scoringSide === watched.side ? "celebration" : "lament");
    });

    scoreSnapshots.current = nextSnapshots;
  }, [liveMatches, watchedMatches]);

  const toggleWatchedMatch = (match: SofaLiveMatch, side: TeamSide) => {
    setWatchedMatches((current) => {
      const watched = current[match.id];
      if (watched?.side === side) {
        const { [match.id]: _removed, ...rest } = current;
        return rest;
      }

      return {
        ...current,
        [match.id]: {
          side,
        },
      };
    });
  };

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
        {tab === "league" && filtered.map((m) => (<MatchCard key={`${m.id}_${m._type ?? "match"}`} m={m} />))}

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
                <span className="text-xs text-muted-foreground">Local: {m.venue || "TBD"}</span>
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
                {m.minute && <p className="text-xs text-destructive font-medium mt-1">{m.minute}</p>}
              </div>
              <div className="flex-1"><p className="font-display font-semibold text-foreground">{m.awayTeam}</p></div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">🔴 Ao Vivo</span>
              <span className="text-xs text-muted-foreground">{m.tournament}</span>
              {"period" in m && m.period && <span className="text-xs text-muted-foreground">{m.period}</span>}
            </div>
            <div className="mt-4 flex flex-col items-center gap-2 border-t border-border pt-3 sm:flex-row sm:justify-center">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {watchedMatches[m.id] ? <BellRing className="h-3.5 w-3.5 text-sport" /> : <Bell className="h-3.5 w-3.5" />}
                Notificar gols torcendo por:
              </span>
              <div className="flex max-w-full gap-2">
                {(["home", "away"] as TeamSide[]).map((side) => {
                  const active = watchedMatches[m.id]?.side === side;
                  const teamName = side === "home" ? m.homeTeam : m.awayTeam;
                  const opponentName = side === "home" ? m.awayTeam : m.homeTeam;

                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={() => toggleWatchedMatch(m, side)}
                      title={`Tocar comemoracao para gol do ${teamName} e lamentacao para gol do ${opponentName}`}
                      className={`inline-flex max-w-[11rem] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-sport bg-sport text-sport-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      {active ? <BellRing className="h-3.5 w-3.5 shrink-0" /> : <Bell className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{teamName}</span>
                    </button>
                  );
                })}
              </div>
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
