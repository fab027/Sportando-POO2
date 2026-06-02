import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bell, BellRing, ExternalLink, Search, RefreshCw, Users, Wifi, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSport } from "@/contexts/SportContext";
import { useMatches, useTodayMatches, useLiveMatches } from "@/hooks/useSofaScoreData";
import { SofaLiveMatch, SofaMatch, TodayMatch } from "@/services/sofaScoreService";
import FilterBar, { FilterDef } from "@/components/FilterBar";
import type { League } from "@/data/leagues";

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

type MatchKind = "past" | "upcoming" | "live";
type MatchListItem = SofaMatch & { _type?: MatchKind; minute?: string | null; period?: string | null };
type MatchWidgetType = "lineups" | "attackMomentum";

const extractTournamentId = (url: string) => {
  const match = url.match(/\/(\d+)(?:[/?#].*)?$/);
  return match ? Number(match[1]) : null;
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isSameTournament = (match: { tournament: string; tournamentId?: number | null }, league: League) => {
  const leagueTournamentId = extractTournamentId(league.sofascoreUrl);
  if (leagueTournamentId && match.tournamentId === leagueTournamentId) return true;

  const tournamentName = normalizeText(match.tournament);
  const leagueName = normalizeText(league.name);
  return Boolean(tournamentName && leagueName && (tournamentName.includes(leagueName) || leagueName.includes(tournamentName)));
};

const matchKindFromStatus = (status: string): MatchKind =>
  isLive(status) ? "live" : isFinished(status) ? "past" : "upcoming";

const liveToMatch = (match: SofaLiveMatch): MatchListItem => ({
  id: match.id,
  homeTeamId: match.homeTeamId,
  awayTeamId: match.awayTeamId,
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  homeTeamImageUrl: match.homeTeamImageUrl,
  awayTeamImageUrl: match.awayTeamImageUrl,
  homeScore: match.homeScore,
  awayScore: match.awayScore,
  homePenaltyScore: match.homePenaltyScore,
  awayPenaltyScore: match.awayPenaltyScore,
  status: match.status,
  startTimestamp: 0,
  tournament: match.tournament,
  tournamentId: match.tournamentId,
  roundInfo: null,
  venue: null,
  minute: match.minute,
  period: match.period,
  _type: "live",
});

const todayToMatch = (match: TodayMatch): MatchListItem => ({
  id: match.id,
  homeTeamId: match.homeTeamId,
  awayTeamId: match.awayTeamId,
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  homeTeamImageUrl: match.homeTeamImageUrl,
  awayTeamImageUrl: match.awayTeamImageUrl,
  homeScore: match.homeScore,
  awayScore: match.awayScore,
  homePenaltyScore: match.homePenaltyScore,
  awayPenaltyScore: match.awayPenaltyScore,
  status: match.status,
  startTimestamp: match.startTimestamp || 0,
  tournament: match.tournament,
  tournamentId: match.tournamentId,
  roundInfo: match.roundInfo ?? null,
  roundName: match.roundName,
  venue: match.venue,
  minute: isLive(match.status) ? match.time : null,
  _type: matchKindFromStatus(match.status),
});

const mergeMatches = (matches: MatchListItem[]) => {
  const priority: Record<MatchKind, number> = { live: 3, past: 2, upcoming: 1 };
  const byId = new Map<number, MatchListItem>();

  matches.forEach((match) => {
    const current = byId.get(match.id);
    const nextPriority = priority[match._type || matchKindFromStatus(match.status)];
    const currentPriority = current ? priority[current._type || matchKindFromStatus(current.status)] : 0;
    if (!current || nextPriority >= currentPriority) {
      byId.set(match.id, {
        ...current,
        ...match,
        startTimestamp: match.startTimestamp || current?.startTimestamp || 0,
        venue: match.venue ?? current?.venue ?? null,
      });
    }
  });

  return Array.from(byId.values()).sort((a, b) => {
    if (!a.startTimestamp) return 1;
    if (!b.startTimestamp) return -1;
    return a.startTimestamp - b.startTimestamp;
  });
};

const TeamName = ({
  name,
  imageUrl,
  align = "left",
}: {
  name: string;
  imageUrl?: string | null;
  align?: "left" | "right";
}) => (
  <span className={`inline-flex min-w-0 items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
    {imageUrl ? (
      <img src={imageUrl} alt="" loading="lazy" className="h-6 w-6 shrink-0 object-contain" />
    ) : (
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sport/10 text-[10px] font-semibold text-sport">
        {name.slice(0, 2).toUpperCase()}
      </span>
    )}
    <span className="shrink-0 text-muted-foreground">-</span>
    <span className="truncate">{name}</span>
  </span>
);

type ScoreLike = {
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
};

const hasScore = (match: ScoreLike) => typeof match.homeScore === "number" && typeof match.awayScore === "number";

const hasPenaltyScore = (match: ScoreLike) =>
  typeof match.homePenaltyScore === "number" && typeof match.awayPenaltyScore === "number";

const MatchScore = ({ match, liveTone = false }: { match: ScoreLike; liveTone?: boolean }) => {
  if (!hasScore(match)) return <span className="text-sm font-medium text-muted-foreground">vs</span>;

  return (
    <span className={`inline-flex items-baseline justify-center gap-1.5 font-display text-xl font-bold ${liveTone ? "text-destructive" : "text-foreground"}`}>
      <span>{match.homeScore} - {match.awayScore}</span>
      {hasPenaltyScore(match) && (
        <span className="text-xs font-semibold text-muted-foreground">
          ({match.homePenaltyScore} - {match.awayPenaltyScore} pen.)
        </span>
      )}
    </span>
  );
};

const slugForSofaScore = (value: string) =>
  normalizeText(value).replace(/\s+/g, "-") || "match";

const sofaScoreMatchUrl = (match: MatchListItem) =>
  `https://www.sofascore.com/pt/football/match/${slugForSofaScore(match.homeTeam)}-${slugForSofaScore(match.awayTeam)}/#id:${match.id}`;

const sofaScoreWidgetUrl = (type: MatchWidgetType, eventId: number) =>
  `https://widgets.sofascore.com/pt-BR/embed/${type}?id=${eventId}&widgetTheme=light`;

const widgetUnavailableText = "Se o widget ficar em branco, esta informacao ainda nao esta disponivel para esta partida no SofaScore.";

const MatchWidgetFrame = ({
  title,
  src,
  height,
}: {
  title: string;
  src: string;
  height: number;
}) => (
  <div className="overflow-hidden rounded-lg border border-border bg-background">
    <iframe
      title={title}
      src={src}
      loading="lazy"
      className="w-full"
      style={{ height }}
      frameBorder={0}
      scrolling="no"
    />
  </div>
);

const MatchDetailsDialog = ({
  match,
  onClose,
}: {
  match: MatchListItem | null;
  onClose: () => void;
}) => {
  if (!match) return null;

  const st = statusConfig(match.status);
  const externalUrl = sofaScoreMatchUrl(match);

  return (
    <Dialog open={Boolean(match)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {match.homeTeam} x {match.awayTeam}
          </DialogTitle>
          <DialogDescription>
            {match.tournament}
            {match.roundInfo ? ` - Rodada ${match.roundInfo}` : ""}
            {match.startTimestamp > 0 ? ` - ${formatDate(match.startTimestamp)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
              <div className="min-w-0 flex-1 text-right">
                <TeamName name={match.homeTeam} imageUrl={match.homeTeamImageUrl} align="right" />
              </div>
              <div className="min-w-[4.5rem] text-center font-display text-xl font-bold text-foreground">
                <MatchScore match={match} />
              </div>
              <div className="min-w-0 flex-1">
                <TeamName name={match.awayTeam} imageUrl={match.awayTeamImageUrl} />
              </div>
            </div>
            <span className={`self-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            {match.roundName && <span>{match.roundName}</span>}
            {match.venue && <span>Local: {match.venue}</span>}
            {match.minute && <span className="font-medium text-destructive">{match.minute}</span>}
            {match.period && <span>{match.period}</span>}
            <a href={externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sport hover:underline">
              Ver no SofaScore <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <Tabs defaultValue="lineups" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="lineups" className="gap-2">
              <Users className="h-4 w-4" />
              Formacoes
            </TabsTrigger>
            <TabsTrigger value="momentum" className="gap-2">
              <Activity className="h-4 w-4" />
              Momento de ataque
            </TabsTrigger>
          </TabsList>
          <TabsContent value="lineups" className="space-y-2">
            <MatchWidgetFrame
              title={`Formacoes de ${match.homeTeam} x ${match.awayTeam}`}
              src={sofaScoreWidgetUrl("lineups", match.id)}
              height={786}
            />
            <p className="text-xs text-muted-foreground">{widgetUnavailableText}</p>
          </TabsContent>
          <TabsContent value="momentum" className="space-y-2">
            <MatchWidgetFrame
              title={`Momento de ataque de ${match.homeTeam} x ${match.awayTeam}`}
              src={sofaScoreWidgetUrl("attackMomentum", match.id)}
              height={286}
            />
            <p className="text-xs text-muted-foreground">{widgetUnavailableText}</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
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

const MatchListCard = ({ m, liveTone = false, onSelect }: { m: MatchListItem; liveTone?: boolean; onSelect?: (match: MatchListItem) => void }) => {
  const st = statusConfig(m.status);
  const isUpcoming = m._type === "upcoming" || !hasScore(m);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(m)}
      className={`w-full rounded-xl border bg-card p-5 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-sport/50 ${liveTone ? "border-destructive/30" : "border-border"}`}
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1 text-right">
          <p className="font-display font-semibold text-foreground">
            <TeamName name={m.homeTeam} imageUrl={m.homeTeamImageUrl} align="right" />
          </p>
        </div>
        <div className="flex min-w-[4.5rem] items-center justify-center gap-2 text-center">
          {!isUpcoming ? (
            <MatchScore match={m} liveTone={liveTone} />
          ) : (
            <span className="text-sm font-medium text-muted-foreground">{m.minute || "vs"}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-foreground">
            <TeamName name={m.awayTeam} imageUrl={m.awayTeamImageUrl} />
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-3 flex-wrap">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span>
        {m.roundInfo && <span className="text-xs text-muted-foreground">Rodada {m.roundInfo}</span>}
        <span className="text-xs text-muted-foreground">{m.tournament}</span>
        {m.startTimestamp > 0 && <span className="text-xs text-muted-foreground">{formatDate(m.startTimestamp)}</span>}
        {m.minute && !isUpcoming && <span className="text-xs font-medium text-destructive">{m.minute}</span>}
        {m.period && <span className="text-xs text-muted-foreground">{m.period}</span>}
        <span className="text-xs text-muted-foreground">Local: {m.venue || "TBD"}</span>
        <span className="text-xs font-medium text-sport">Detalhes</span>
      </div>
    </button>
  );
};

const MatchesPage = () => {
  const { league } = useSport();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"league" | "today" | "live">("league");
  const [filters, setFilters] = useState<Record<string, string>>({ status: "all", date: "all" });
  const [watchedMatches, setWatchedMatches] = useState<Record<number, WatchedMatch>>({});
  const [selectedMatch, setSelectedMatch] = useState<MatchListItem | null>(null);
  const scoreSnapshots = useRef<Record<number, ScoreSnapshot>>({});

  const { lastMatches, nextMatches, allMatches, status, error, refetch } = useMatches(league.sofascoreUrl, "season");
  const { data: todayMatches, status: todayStatus, refetch: refetchToday } = useTodayMatches();
  const { data: liveMatches, status: liveStatus, refetch: refetchLive } = useLiveMatches();

  const leagueMatches = useMemo(() => {
    const leagueToday = todayMatches.filter((match) => isSameTournament(match, league)).map(todayToMatch);
    const leagueLive = liveMatches.filter((match) => isSameTournament(match, league)).map(liveToMatch);
    return mergeMatches([...(allMatches as MatchListItem[]), ...leagueToday, ...leagueLive]);
  }, [allMatches, todayMatches, liveMatches, league]);

  const isLoading =
    tab === "league"
      ? status === "loading" && leagueMatches.length === 0
      : tab === "today"
        ? todayStatus === "loading" && todayMatches.length === 0
        : liveStatus === "loading" && liveMatches.length === 0;

  const leagueMatchCounts = useMemo(
    () => ({
      recent: leagueMatches.filter((match) => isFinished(match.status)).length,
      live: leagueMatches.filter((match) => isLive(match.status)).length,
      scheduled: leagueMatches.filter((match) => isScheduled(match.status)).length,
    }),
    [leagueMatches]
  );

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

  const roundOptions = useMemo(
    () =>
      Array.from(new Set(leagueMatches.map((match) => match.roundInfo).filter((round): round is number => typeof round === "number")))
        .sort((a, b) => a - b)
        .map((round) => ({ value: String(round), label: `Rodada ${round}` })),
    [leagueMatches]
  );

  useEffect(() => {
    if (filters.round && filters.round !== "all" && !roundOptions.some((option) => option.value === filters.round)) {
      setFilters((current) => ({ ...current, round: "all" }));
    }
  }, [filters.round, roundOptions]);

  const activeFilterDefs: FilterDef[] =
    tab === "league" && roundOptions.length > 0
      ? [
          ...filterDefs,
          {
            key: "round",
            label: "Rodada",
            options: roundOptions,
          },
        ]
      : filterDefs;

  const applyFilters = useCallback(<T extends { homeTeam: string; awayTeam: string; tournament: string; status: string; startTimestamp?: number; roundInfo?: number | null }>(
    list: T[],
    includeRound = false
  ): T[] => {
    const q = search.toLowerCase();
    return list.filter((m) => {
      if (q && !(m.homeTeam.toLowerCase().includes(q) || m.awayTeam.toLowerCase().includes(q) || m.tournament.toLowerCase().includes(q))) return false;
      if (filters.status === "live" && !isLive(m.status)) return false;
      if (filters.status === "scheduled" && !isScheduled(m.status)) return false;
      if (filters.status === "finished" && !isFinished(m.status)) return false;
      if (m.startTimestamp && !inDateRange(m.startTimestamp, filters.date)) return false;
      if (includeRound && filters.round && filters.round !== "all" && String(m.roundInfo || "") !== filters.round) return false;
      return true;
    });
  }, [filters.date, filters.round, filters.status, search]);

  const filtered = useMemo(() => (tab === "league" ? applyFilters(leagueMatches, true) : []), [tab, leagueMatches, applyFilters]);
  const filteredToday = useMemo(() => (tab === "today" ? applyFilters(todayMatches) : []), [tab, todayMatches, applyFilters]);
  const filteredLive = useMemo(() => (tab === "live" ? applyFilters(liveMatches) : []), [tab, liveMatches, applyFilters]);

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
    if (tab === "league") {
      void refetch({ force: true });
      void refetchToday({ force: true });
      void refetchLive({ force: true });
    }
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
                {tab === "league" && <>{leagueMatchCounts.recent} recentes · {leagueMatchCounts.live} ao vivo · {leagueMatchCounts.scheduled} agendadas — {league.name}</>}
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
        filters={activeFilterDefs}
        values={filters}
        onChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
        onClear={() => setFilters({ status: "all", date: "all", round: "all" })}
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
        {tab === "league" && filtered.map((m) => (
          <MatchListCard
            key={`${m.id}_${m._type ?? "match"}`}
            m={m}
            liveTone={isLive(m.status)}
            onSelect={setSelectedMatch}
          />
        ))}

        {tab === "today" && !isLoading && filteredToday.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum jogo encontrado para os filtros aplicados.</p>
        )}
        {tab === "today" && filteredToday.map((m) => {
          const st = statusConfig(m.status);
          return (
            <div
              key={`${m.id}-today`}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedMatch(todayToMatch(m))}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setSelectedMatch(todayToMatch(m));
              }}
              className="cursor-pointer rounded-xl border border-border bg-card p-5 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-sport/50"
            >
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1 text-right">
                  <p className="font-display font-semibold text-foreground">
                    <TeamName name={m.homeTeam} imageUrl={m.homeTeamImageUrl} align="right" />
                  </p>
                </div>
                <div className="text-center">
                  {m.homeScore !== null ? (
                    <span className="font-display text-xl font-bold text-foreground">{m.homeScore} — {m.awayScore}</span>
                  ) : (
                    <span className="text-sm font-medium text-muted-foreground">{m.time || "vs"}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-foreground">
                    <TeamName name={m.awayTeam} imageUrl={m.awayTeamImageUrl} />
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-center gap-3 flex-wrap">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span>
                <span className="text-xs text-muted-foreground">{m.tournament}</span>
                {m.time && <span className="text-xs text-muted-foreground">{m.time}</span>}
                <span className="text-xs text-muted-foreground">Local: {m.venue || "TBD"}</span>
                <span className="text-xs font-medium text-sport">Detalhes</span>
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
          <div
            key={`${m.id}-live`}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedMatch(liveToMatch(m))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setSelectedMatch(liveToMatch(m));
            }}
            className="cursor-pointer rounded-xl border border-destructive/30 bg-card p-5 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-sport/50"
          >
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1 text-right">
                <p className="font-display font-semibold text-foreground">
                  <TeamName name={m.homeTeam} imageUrl={m.homeTeamImageUrl} align="right" />
                </p>
              </div>
              <div className="text-center">
                <span className="font-display text-xl font-bold text-destructive">{m.homeScore} — {m.awayScore}</span>
                {m.minute && <p className="text-xs text-destructive font-medium mt-1">{m.minute}</p>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-foreground">
                  <TeamName name={m.awayTeam} imageUrl={m.awayTeamImageUrl} />
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">🔴 Ao Vivo</span>
              <span className="text-xs text-muted-foreground">{m.tournament}</span>
              {"period" in m && m.period && <span className="text-xs text-muted-foreground">{m.period}</span>}
              <span className="text-xs font-medium text-sport">Detalhes</span>
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
                  const teamImageUrl = side === "home" ? m.homeTeamImageUrl : m.awayTeamImageUrl;
                  const opponentName = side === "home" ? m.awayTeam : m.homeTeam;

                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleWatchedMatch(m, side);
                      }}
                      title={`Tocar comemoracao para gol do ${teamName} e lamentacao para gol do ${opponentName}`}
                      className={`inline-flex max-w-[11rem] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-sport bg-sport text-sport-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      {active ? <BellRing className="h-3.5 w-3.5 shrink-0" /> : <Bell className="h-3.5 w-3.5 shrink-0" />}
                      <TeamName name={teamName} imageUrl={teamImageUrl} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {error && leagueMatches.length === 0 && tab === "league" && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
            <WifiOff className="mx-auto h-8 w-8 text-destructive/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Não foi possível carregar dados.</p>
            <button onClick={() => refetch()} className="rounded-lg bg-sport px-4 py-2 text-xs font-medium text-sport-foreground hover:opacity-90">
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      <MatchDetailsDialog match={selectedMatch} onClose={() => setSelectedMatch(null)} />
    </div>
  );
};

export default MatchesPage;
