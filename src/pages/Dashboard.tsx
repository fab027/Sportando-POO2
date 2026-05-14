import { useEffect, useMemo, useState } from "react";
import { useSport } from "@/contexts/SportContext";
import {
  CalendarDays,
  Check,
  ChevronDown,
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
import { useLiveMatches, useMatches, useStandings, useTopPlayers } from "@/hooks/useSofaScoreData";
import type { SofaMatch, SofaTeamStanding, SofaTopPlayer } from "@/services/sofaScoreService";
import { sofaScoreService } from "@/services/sofaScoreService";
import { useFavorites } from "@/contexts/FavoritesContext";

const LIVE_COUNTRIES_STORAGE_KEY = "sportando.dashboard.liveCountries";

const KNOWN_TOTAL_ROUNDS: Record<string, number> = {
  "brasileirao-a": 38,
  "brasileirao-b": 38,
  "premier-league": 38,
  "la-liga": 38,
  "serie-a-it": 38,
  bundesliga: 34,
  "ligue-1": 34,
};

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

const maxRound = (matches: SofaMatch[]) =>
  matches.reduce((max, match) => (match.roundInfo ? Math.max(max, match.roundInfo) : max), 0);

const minRound = (matches: SofaMatch[]) =>
  matches.reduce<number | null>(
    (min, match) => (match.roundInfo ? Math.min(min ?? match.roundInfo, match.roundInfo) : min),
    null
  );

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

const MatchRow = ({ match, showScore = false }: { match: SofaMatch; showScore?: boolean }) => (
  <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{formatRound(match)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <span>{match.homeTeam}</span>
          {showScore ? (
            <span className="rounded-md bg-background px-2 py-0.5 font-display text-sm">
              {match.homeScore ?? 0} - {match.awayScore ?? 0}
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

const PlayerRanking = ({
  title,
  icon: Icon,
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
  <Card className="p-4">
    <SectionHeader icon={Icon} title={title} subtitle="Ranking da temporada selecionada" />
    {loading && players.length === 0 ? (
      <p className="text-sm text-muted-foreground">Carregando ranking...</p>
    ) : players.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nenhum jogador encontrado para esta competicao.</p>
    ) : (
      <div className="space-y-1.5">
        {players.slice(0, 6).map((player, index) => (
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
  </Card>
);

const Dashboard = () => {
  const { sport, league } = useSport();
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
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);

  const { data: standings, status: standingsStatus, refetch: refetchStandings } = useStandings(league.sofascoreUrl);
  const { lastMatches, nextMatches, status: matchesStatus, refetch: refetchMatches } = useMatches(league.sofascoreUrl);
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

  const groupedStandings = useMemo(() => {
    const groups = new Map<string, SofaTeamStanding[]>();
    standings.forEach((team) => {
      const groupName = team.groupName || "Tabela geral";
      groups.set(groupName, [...(groups.get(groupName) || []), team]);
    });
    return Array.from(groups.entries()).map(([name, teams]) => ({
      name,
      teams: teams.sort((a, b) => a.position - b.position),
    }));
  }, [standings]);

  useEffect(() => {
    localStorage.setItem(LIVE_COUNTRIES_STORAGE_KEY, JSON.stringify(selectedLiveCountries));
  }, [selectedLiveCountries]);

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
          .filter((entry): entry is PromiseFulfilledResult<{ team: string }> => entry.status === "fulfilled")
          .map((entry) => entry.value.team)
          .filter(Boolean)
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

  const toggleLiveCountry = (country: string) => {
    setSelectedLiveCountries((current) =>
      current.includes(country) ? current.filter((item) => item !== country) : [...current, country].sort()
    );
  };

  const liveCountryLabel =
    selectedLiveCountries.length === 0
      ? "Todos os paises"
      : selectedLiveCountries.length === 1
        ? selectedLiveCountries[0]
        : `${selectedLiveCountries.length} paises`;

  const lastCompletedRound = useMemo(() => {
    const finished = lastMatches.filter(isFinished).sort((a, b) => b.startTimestamp - a.startTimestamp);
    const anchor = finished[0];
    if (!anchor) return [];
    if (!anchor.roundInfo) return finished.slice(0, 8);
    return finished.filter((match) => match.roundInfo === anchor.roundInfo).slice(0, 12);
  }, [lastMatches]);

  const lastRoundTitle = lastCompletedRound[0]?.roundInfo
    ? `Ultima rodada concluida - Rodada ${lastCompletedRound[0].roundInfo}`
    : "Ultimas partidas finalizadas";
  const inferredTotalRounds =
    KNOWN_TOTAL_ROUNDS[league.id] ||
    (standings.length >= 10 && !groupedStandings.some((group) => group.name !== "Tabela geral")
      ? (standings.length - 1) * 2
      : maxRound([...lastMatches, ...nextMatches]));
  const completedRoundCount = Math.max(
    maxRound(lastMatches.filter(isFinished)),
    (minRound(nextMatches) ?? 1) - 1
  );
  const remainingRounds = inferredTotalRounds
    ? Math.max(inferredTotalRounds - completedRoundCount, 0)
    : (nextMatches.length > 0 ? 1 : 0);

  const isLoading = standingsStatus === "loading" || matchesStatus === "loading";
  const isOffline = standingsStatus === "error" || matchesStatus === "error";

  const refreshAll = () => {
    refetchStandings();
    refetchMatches();
    refetchLive();
    refetchScorers();
    refetchAssists();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Dashboard - {league.flag} {league.name}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {isLoading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando dados do campeonato...
              </>
            ) : isOffline ? (
              <>
                <WifiOff className="h-3.5 w-3.5 text-destructive" /> Dados de fallback carregados
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5 text-sport" /> Dados atualizados via SofaScore
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
            <div className="relative">
              <button
                onClick={() => setCountryMenuOpen((open) => !open)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Globe2 className="h-3.5 w-3.5 text-sport" />
                {liveCountryLabel}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {countryMenuOpen && (
                <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-card p-2 shadow-lg">
                  <button
                    onClick={() => setSelectedLiveCountries([])}
                    className={`mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary ${
                      selectedLiveCountries.length === 0 ? "text-sport" : "text-foreground"
                    }`}
                  >
                    Todos os paises
                    {selectedLiveCountries.length === 0 && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <div className="max-h-56 overflow-y-auto">
                    {liveCountryOptions.length === 0 ? (
                      <p className="px-2.5 py-2 text-xs text-muted-foreground">Sem paises ao vivo agora.</p>
                    ) : (
                      liveCountryOptions.map((country) => {
                        const selected = selectedLiveCountries.includes(country);
                        return (
                          <button
                            key={country}
                            onClick={() => toggleLiveCountry(country)}
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
              <div key={match.id} className="rounded-lg border border-border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground">{match.country ? `${match.country} - ` : ""}{match.tournament}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  <span>{match.homeTeam}</span>
                  <span className="rounded-md bg-destructive/10 px-2 py-0.5 font-display text-sm text-destructive">
                    {match.homeScore} - {match.awayScore}
                  </span>
                  <span>{match.awayTeam}</span>
                  {(match.minute || match.period) && (
                    <span className="text-xs text-muted-foreground">
                      {[match.period, match.minute].filter(Boolean).join(" - ")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Equipes</p>
          <p className="mt-0.5 font-display text-lg font-bold text-foreground">{standings.length || "-"}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Rodadas faltando</p>
          <p className="mt-0.5 font-display text-lg font-bold text-foreground">{remainingRounds || "-"}</p>
          {completedRoundCount > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {completedRoundCount} de {inferredTotalRounds || "?"} rodadas disputadas
            </p>
          )}
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Ao vivo</p>
          <p className="mt-0.5 font-display text-lg font-bold text-foreground">{selectedLiveMatches.length}</p>
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeader
          icon={Trophy}
          title={`Classificacao - ${league.name}`}
          subtitle="Tabela atualizada da competicao selecionada"
        />
        {standings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Classificacao indisponivel para esta competicao.</p>
        ) : (
          <div className="space-y-4">
            {groupedStandings.map((group) => (
              <div key={group.name}>
                {groupedStandings.length > 1 && (
                  <h3 className="mb-2 text-sm font-semibold text-foreground">{group.name}</h3>
                )}
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40">
                      <tr className="text-xs uppercase text-muted-foreground">
                        <th className="w-10 px-3 py-2 text-left">#</th>
                        <th className="min-w-44 px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-center">J</th>
                        <th className="px-3 py-2 text-center">V</th>
                        {sport === "football" && <th className="px-3 py-2 text-center">E</th>}
                        <th className="px-3 py-2 text-center">D</th>
                        <th className="px-3 py-2 text-center">GP</th>
                        <th className="px-3 py-2 text-center">GC</th>
                        <th className="px-3 py-2 text-center font-bold">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.teams.map((team) => (
                        <tr key={`${group.name}-${team.id}`} className="border-t border-border hover:bg-secondary/25">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{team.position}</td>
                          <td className="px-3 py-2 font-semibold text-foreground">{team.name}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{team.played}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{team.wins}</td>
                          {sport === "football" && <td className="px-3 py-2 text-center text-muted-foreground">{team.draws}</td>}
                          <td className="px-3 py-2 text-center text-muted-foreground">{team.losses}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{team.scored}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{team.conceded}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="rounded-md bg-sport-light px-2 py-1 text-xs font-bold text-sport">
                              {team.points}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
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

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionHeader
            icon={CalendarDays}
            title="Proximas partidas favoritas"
            subtitle="Agenda dos times favoritos em todos os campeonatos"
          />
          {favoriteTeamMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma partida futura encontrada para seus favoritos.</p>
          ) : (
            <div className="space-y-2">
              {favoriteTeamMatches.slice(0, 10).map((match) => (
                <MatchRow key={match.id} match={match} />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <SectionHeader
            icon={Shield}
            title={lastRoundTitle}
            subtitle="Recorte mais recente de partidas ja finalizadas"
          />
          {lastCompletedRound.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma rodada finalizada encontrada.</p>
          ) : (
            <div className="space-y-2">
              {lastCompletedRound.slice(0, 8).map((match) => (
                <MatchRow key={match.id} match={match} showScore />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
