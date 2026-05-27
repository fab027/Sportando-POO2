import { useEffect, useMemo, useState } from "react";
import { useSport } from "@/contexts/SportContext";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Goal,
  Globe2,
  Handshake,
  Radio,
  RefreshCw,
  Shield,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLiveMatches, useMatches, useTodayMatches, useTopPlayers } from "@/hooks/useSofaScoreData";
import type { SofaLiveMatch, SofaMatch, SofaTopPlayer, TodayMatch } from "@/services/sofaScoreService";
import { sofaScoreService } from "@/services/sofaScoreService";
import { useFavorites } from "@/contexts/FavoritesContext";

const LIVE_COUNTRIES_STORAGE_KEY = "sportando.dashboard.liveCountries";
const TODAY_COUNTRIES_STORAGE_KEY = "sportando.dashboard.todayCountries";

const formatDateTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized.includes("finished") || normalized === "ft") return "Finalizada";
  if (normalized.includes("live")) return "Ao vivo";
  if (normalized.includes("scheduled")) return "Agendada";
  return status;
};

const isFinished = (match: SofaMatch) => {
  const status = match.status.toLowerCase();
  return status.includes("finished") || status === "ft" || status.includes("after");
};

const formatRound = (match: SofaMatch) => {
  if (match.roundName) return `${match.tournament} - ${match.roundName}`;
  if (match.roundInfo) return `${match.tournament} - Rodada ${match.roundInfo}`;
  return match.tournament;
};

const hasMatchScore = (match: Pick<SofaMatch | TodayMatch | SofaLiveMatch, "homeScore" | "awayScore">) =>
  typeof match.homeScore === "number" && typeof match.awayScore === "number";

const normalizeClockPart = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text || /^(started|live|in progress|ao vivo)$/i.test(text)) return null;
  if (/^(ht|halftime)$/i.test(text) || /interval/i.test(text)) return "Intervalo";
  if (/^(1st half|first half)$/i.test(text)) return "1o tempo";
  if (/^(2nd half|second half)$/i.test(text)) return "2o tempo";
  return text;
};

const formatLiveClock = (match: SofaLiveMatch) => {
  const period = normalizeClockPart(match.period);
  const minute = normalizeClockPart(match.minute);
  if (period && minute && period.toLowerCase() !== minute.toLowerCase()) return `${period} - ${minute}`;
  return minute || period || "Ao vivo";
};

const countrySelectionLabel = (countries: string[]) => {
  if (countries.length === 0) return "Todos os paises";
  if (countries.length === 1) return countries[0];
  return `${countries.length} paises`;
};

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <section className={`rounded-xl border border-border bg-card ${className}`}>{children}</section>
);

const SectionHeader = ({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Trophy;
  title: string;
  subtitle?: string;
}) => (
  <div className="mb-3 flex items-start justify-between gap-3">
    <div>
      <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
        <Icon className="h-4 w-4 text-sport" />
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  </div>
);

const CountrySelector = ({
  label,
  options,
  selectedCountries,
  onClear,
  onToggle,
  emptyMessage,
}: {
  label: string;
  options: string[];
  selectedCountries: string[];
  onClear: () => void;
  onToggle: (country: string) => void;
  emptyMessage: string;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <Globe2 className="h-3.5 w-3.5 text-sport" />
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-lg">
          <button
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            className={`mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary ${
              selectedCountries.length === 0 ? "text-sport" : "text-foreground"
            }`}
          >
            Todos os paises
            {selectedCountries.length === 0 && <Check className="h-3.5 w-3.5" />}
          </button>
          <div className="max-h-56 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">{emptyMessage}</p>
            ) : (
              options.map((country) => {
                const selected = selectedCountries.includes(country);
                return (
                  <button
                    key={country}
                    onClick={() => onToggle(country)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary ${
                      selected ? "text-sport" : "text-foreground"
                    }`}
                  >
                    {country}
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CollapsibleCard = ({
  title,
  subtitle,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: typeof Trophy;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="self-start rounded-xl border border-border bg-card">
      <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div>
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
            <Icon className="h-4 w-4 text-sport" />
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 pb-4 pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
};

const MatchRow = ({ match, showScore = false }: { match: SofaMatch; showScore?: boolean }) => (
  <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{formatRound(match)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <span>{match.homeTeam}</span>
          {showScore && hasMatchScore(match) ? (
            <span className="rounded-md bg-background px-2 py-0.5 font-display text-sm">
              {match.homeScore} - {match.awayScore}
            </span>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">vs</span>
          )}
          <span>{match.awayTeam}</span>
        </div>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-xs font-medium text-foreground">{formatStatus(match.status)}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(match.startTimestamp)}</p>
      </div>
    </div>
  </div>
);

const LiveMatchCard = ({ match }: { match: SofaLiveMatch }) => {
  const clock = formatLiveClock(match);

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">
        {match.country ? `${match.country} - ` : ""}
        {match.tournament}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
        <span>{match.homeTeam}</span>
        <span className="rounded-md bg-destructive/10 px-2 py-0.5 font-display text-sm text-destructive">
          {match.homeScore} - {match.awayScore}
        </span>
        <span>{match.awayTeam}</span>
        <span className="text-xs text-muted-foreground">{clock}</span>
      </div>
    </div>
  );
};

const TodayMatchCard = ({ match }: { match: TodayMatch }) => (
  <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
    <p className="truncate text-xs text-muted-foreground">
      {match.country ? `${match.country} - ` : ""}
      {match.tournament}
    </p>
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
      <span>{match.homeTeam}</span>
      {hasMatchScore(match) ? (
        <span className="rounded-md bg-background px-2 py-0.5 font-display text-sm">
          {match.homeScore} - {match.awayScore}
        </span>
      ) : (
        <span className="text-xs font-medium text-muted-foreground">{match.time || "vs"}</span>
      )}
      <span>{match.awayTeam}</span>
    </div>
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>{formatStatus(match.status)}</span>
      {match.venue && <span>{match.venue}</span>}
    </div>
  </div>
);

const PlayerRanking = ({
  title,
  icon,
  metricLabel,
  players,
  loading,
}: {
  title: string;
  icon: typeof Trophy;
  metricLabel: string;
  players: SofaTopPlayer[];
  loading: boolean;
}) => (
  <CollapsibleCard icon={icon} title={title} subtitle="Ranking da temporada selecionada" defaultOpen={false}>
    {loading && players.length === 0 ? (
      <p className="text-sm text-muted-foreground">Carregando ranking...</p>
    ) : players.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nenhum jogador encontrado para esta competicao.</p>
    ) : (
      <div className="space-y-1.5">
        {players.slice(0, 8).map((player, index) => (
          <div key={player.id} className="grid grid-cols-[1.75rem_2.25rem_1fr_auto] items-center gap-2 rounded-lg bg-secondary/30 px-3 py-1.5">
            <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
            {player.imageUrl ? (
              <img
                src={player.imageUrl}
                alt={player.name}
                className="h-8 w-8 rounded-full bg-sport/10 object-cover"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sport/10 text-xs font-bold text-sport">
                {player.name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{player.name}</p>
              <p className="truncate text-xs text-muted-foreground">{player.team || "Time nao informado"}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-base font-bold text-sport">{player.value}</p>
              <p className="text-[10px] uppercase text-muted-foreground">{metricLabel}</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </CollapsibleCard>
);

const Dashboard = () => {
  const { league } = useSport();
  const { favorites } = useFavorites();
  const [favoriteAthleteTeams, setFavoriteAthleteTeams] = useState<string[]>([]);
  const [favoriteTeamMatches, setFavoriteTeamMatches] = useState<SofaMatch[]>([]);
  const [selectedLiveCountries, setSelectedLiveCountries] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(localStorage.getItem(LIVE_COUNTRIES_STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const [selectedTodayCountries, setSelectedTodayCountries] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = JSON.parse(localStorage.getItem(TODAY_COUNTRIES_STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  });

  const { lastMatches, nextMatches, status: matchesStatus, refetch: refetchMatches } = useMatches(league.sofascoreUrl);
  const { data: todayMatches, status: todayStatus, refetch: refetchToday } = useTodayMatches();
  const { data: liveMatches, status: liveStatus, refetch: refetchLive } = useLiveMatches();
  const { data: topScorers, status: scorersStatus, refetch: refetchScorers } = useTopPlayers(league.sofascoreUrl, "goals");
  const { data: topAssists, status: assistsStatus, refetch: refetchAssists } = useTopPlayers(league.sofascoreUrl, "assists");

  const favoriteTeamIds = useMemo(
    () => new Set(favorites.filter((fav) => fav.tipo === "equipe").map((fav) => fav.referenciaId)),
    [favorites]
  );
  const favoriteTeamNames = useMemo(
    () => Array.from(new Set([...favorites.filter((fav) => fav.tipo === "equipe").map((fav) => fav.nome), ...favoriteAthleteTeams])).filter(Boolean),
    [favoriteAthleteTeams, favorites]
  );

  useEffect(() => {
    localStorage.setItem(LIVE_COUNTRIES_STORAGE_KEY, JSON.stringify(selectedLiveCountries));
  }, [selectedLiveCountries]);

  useEffect(() => {
    localStorage.setItem(TODAY_COUNTRIES_STORAGE_KEY, JSON.stringify(selectedTodayCountries));
  }, [selectedTodayCountries]);

  useEffect(() => {
    const athleteUrls = favorites
      .filter((fav) => fav.tipo === "atleta" && /^https?:\/\//i.test(fav.referenciaId))
      .map((fav) => fav.referenciaId);
    if (athleteUrls.length === 0) {
      setFavoriteAthleteTeams([]);
      return;
    }
    let cancelled = false;
    Promise.allSettled(athleteUrls.slice(0, 8).map((url) => sofaScoreService.getPlayerStats(url))).then((results) => {
      if (cancelled) return;
      setFavoriteAthleteTeams(
        results
          .flatMap((entry) => (entry.status === "fulfilled" && entry.value.team ? [entry.value.team] : []))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [favorites]);

  useEffect(() => {
    const teamIds = Array.from(favoriteTeamIds);
    if (teamIds.length === 0 && favoriteTeamNames.length === 0) {
      setFavoriteTeamMatches([]);
      return;
    }
    let cancelled = false;
    sofaScoreService.getTeamNextMatches(teamIds, favoriteTeamNames)
      .then((matches) => {
        if (!cancelled) setFavoriteTeamMatches(Array.isArray(matches) ? matches : []);
      })
      .catch(() => {
        if (!cancelled) setFavoriteTeamMatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [favoriteTeamIds, favoriteTeamNames]);

  const liveCountryOptions = useMemo(
    () =>
      Array.from(
        new Set([...selectedLiveCountries, ...liveMatches.map((match) => match.country || "Outros")])
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [liveMatches, selectedLiveCountries]
  );

  const selectedLiveMatches = useMemo(() => {
    if (selectedLiveCountries.length === 0) return liveMatches;
    return liveMatches.filter((match) => selectedLiveCountries.includes(match.country || "Outros"));
  }, [liveMatches, selectedLiveCountries]);

  const todayCountryOptions = useMemo(
    () =>
      Array.from(
        new Set([...selectedTodayCountries, ...todayMatches.map((match) => match.country || "Outros")])
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [selectedTodayCountries, todayMatches]
  );

  const selectedTodayMatches = useMemo(() => {
    if (selectedTodayCountries.length === 0) return todayMatches;
    return todayMatches.filter((match) => selectedTodayCountries.includes(match.country || "Outros"));
  }, [selectedTodayCountries, todayMatches]);

  const todayTournaments = useMemo(
    () => Array.from(new Set(selectedTodayMatches.map((match) => match.tournament))).length,
    [selectedTodayMatches]
  );

  const lastCompletedRound = useMemo(() => {
    const finished = lastMatches.filter(isFinished).sort((a, b) => b.startTimestamp - a.startTimestamp);
    const anchor = finished[0];
    if (!anchor) return [];
    if (!anchor.roundInfo) return finished.slice(0, 8);
    return finished.filter((match) => match.roundInfo === anchor.roundInfo).slice(0, 12);
  }, [lastMatches]);

  const toggleLiveCountry = (country: string) => {
    setSelectedLiveCountries((current) =>
      current.includes(country) ? current.filter((item) => item !== country) : [...current, country].sort()
    );
  };

  const toggleTodayCountry = (country: string) => {
    setSelectedTodayCountries((current) =>
      current.includes(country) ? current.filter((item) => item !== country) : [...current, country].sort()
    );
  };

  const liveCountryLabel = countrySelectionLabel(selectedLiveCountries);
  const todayCountryLabel = countrySelectionLabel(selectedTodayCountries);

  const isLoading = matchesStatus === "loading" || todayStatus === "loading";
  const isOffline = matchesStatus === "error" || todayStatus === "error";

  const refreshAll = () => {
    refetchMatches();
    refetchToday();
    refetchLive();
    refetchScorers();
    refetchAssists();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Dashboard - Agenda de partidas
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {isLoading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando partidas...
              </>
            ) : isOffline ? (
              <>
                <WifiOff className="h-3.5 w-3.5 text-destructive" /> Nao foi possivel atualizar todos os jogos
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5 text-sport" /> Jogos atualizados via SofaScore
              </>
            )}
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <Card className={`p-3 ${selectedLiveMatches.length > 0 ? "border-destructive/30 bg-destructive/5" : ""}`}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-foreground">
            <Radio className={`h-4 w-4 ${selectedLiveMatches.length > 0 ? "text-destructive" : "text-sport"}`} />
            Ao vivo agora
          </h2>
          <div className="flex items-center gap-2">
            <CountrySelector
              label={liveCountryLabel}
              options={liveCountryOptions}
              selectedCountries={selectedLiveCountries}
              onClear={() => setSelectedLiveCountries([])}
              onToggle={toggleLiveCountry}
              emptyMessage="Sem paises ao vivo agora."
            />
            <button
              onClick={refetchLive}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className={`h-3 w-3 ${liveStatus === "loading" ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>
        {liveStatus === "loading" && selectedLiveMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Verificando partidas em andamento...</p>
        ) : selectedLiveMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma partida monitorada esta ao vivo no momento.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {selectedLiveMatches.slice(0, 8).map((match) => (
              <LiveMatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Jogos hoje</p>
          <p className="mt-0.5 font-display text-lg font-bold text-foreground">{selectedTodayMatches.length || "-"}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Campeonatos hoje</p>
          <p className="mt-0.5 font-display text-lg font-bold text-foreground">{todayTournaments || "-"}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Ao vivo</p>
          <p className="mt-0.5 font-display text-lg font-bold text-foreground">{selectedLiveMatches.length}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
              <Globe2 className="h-4 w-4 text-sport" />
              Partidas de hoje pelo mundo
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Recorte global de jogos monitorados</p>
          </div>
          <CountrySelector
            label={todayCountryLabel}
            options={todayCountryOptions}
            selectedCountries={selectedTodayCountries}
            onClear={() => setSelectedTodayCountries([])}
            onToggle={toggleTodayCountry}
            emptyMessage="Sem paises com partidas hoje."
          />
        </div>
        {todayStatus === "loading" && todayMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Buscando jogos de hoje...</p>
        ) : todayMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma partida encontrada para hoje.</p>
        ) : selectedTodayMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma partida encontrada para os paises selecionados.</p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {selectedTodayMatches.slice(0, 16).map((match) => (
              <TodayMatchCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader
          icon={Clock3}
          title={`Proximas partidas - ${league.name}`}
          subtitle="Agenda do campeonato selecionado"
        />
        {nextMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma partida futura encontrada para este campeonato.</p>
        ) : (
          <div className="grid gap-2 xl:grid-cols-2">
            {nextMatches.slice(0, 12).map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        )}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PlayerRanking
          title="Artilheiros"
          icon={Goal}
          metricLabel="gols"
          players={topScorers}
          loading={scorersStatus === "loading"}
        />
        <PlayerRanking
          title="Lideres em assistencias"
          icon={Handshake}
          metricLabel="assist."
          players={topAssists}
          loading={assistsStatus === "loading"}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <CollapsibleCard
          icon={CalendarDays}
          title="Proximas partidas favoritas"
          subtitle="Agenda dos times favoritos em todos os campeonatos"
          defaultOpen={favoriteTeamMatches.length > 0}
        >
          {favoriteTeamMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma partida futura encontrada para seus favoritos.</p>
          ) : (
            <div className="space-y-2">
              {favoriteTeamMatches.slice(0, 10).map((match) => (
                <MatchRow key={match.id} match={match} />
              ))}
            </div>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          icon={Shield}
          title="Ultimas partidas finalizadas"
          subtitle={`Recorte recente de ${league.name}`}
          defaultOpen={false}
        >
          {lastCompletedRound.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma partida finalizada encontrada.</p>
          ) : (
            <div className="space-y-2">
              {lastCompletedRound.slice(0, 8).map((match) => (
                <MatchRow key={match.id} match={match} showScore />
              ))}
            </div>
          )}
        </CollapsibleCard>
      </div>
    </div>
  );
};

export default Dashboard;
