import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSport } from "@/contexts/SportContext";
import {
  Bell,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  Goal,
  Globe2,
  Handshake,
  Radio,
  RefreshCw,
  Settings2,
  Shield,
  Trophy,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLiveMatches, useMatches, useTodayMatches, useTopPlayers } from "@/hooks/useSofaScoreData";
import type { SofaLiveMatch, SofaMatch, SofaTopPlayer, TodayMatch } from "@/services/sofaScoreService";
import { sofaScoreService } from "@/services/sofaScoreService";
import { useFavorites } from "@/contexts/FavoritesContext";

const LIVE_COUNTRIES_STORAGE_KEY = "sportando.dashboard.liveCountries";
const TODAY_COUNTRIES_STORAGE_KEY = "sportando.dashboard.todayCountries";
const LIVE_ALERTS_STORAGE_KEY = "sportando.dashboard.liveAlerts.v1";
const LIVE_REFRESH_INTERVAL_STORAGE_KEY = "sportando.dashboard.liveRefreshIntervalMs";
const LIVE_MATCHES_PREVIEW_LIMIT = 8;
const LIVE_REFRESH_INTERVAL_OPTIONS = [
  { value: 0, label: "Manual" },
  { value: 30_000, label: "30s" },
  { value: 60_000, label: "1 min" },
  { value: 120_000, label: "2 min" },
  { value: 300_000, label: "5 min" },
] as const;

type TeamSide = "home" | "away";
type AlertSide = TeamSide | "both";
type LiveAlertEvent = "start" | "halftime" | "goal" | "finish" | "favoritePlayerGoal" | "leadChange";
type AlertTone = "positive" | "negative" | "neutral";

type LiveAlertEvents = Record<LiveAlertEvent, boolean>;

type LiveAlertSettings = {
  enabled: boolean;
  side: AlertSide | null;
  events: LiveAlertEvents;
};

type ResolvedLiveAlert = LiveAlertSettings & {
  auto: boolean;
};

type LiveMatchSnapshot = Pick<
  SofaLiveMatch,
  | "id"
  | "homeTeamId"
  | "awayTeamId"
  | "homeTeam"
  | "awayTeam"
  | "homeScore"
  | "awayScore"
  | "minute"
  | "period"
  | "tournament"
  | "country"
>;

type LiveAlertPopup = {
  id: string;
  title: string;
  description: string;
  tone: AlertTone;
};

const DEFAULT_ALERT_EVENTS: LiveAlertEvents = {
  start: true,
  halftime: true,
  goal: true,
  finish: true,
  favoritePlayerGoal: true,
  leadChange: true,
};

const ALERT_EVENT_LABELS: Array<{ key: LiveAlertEvent; label: string }> = [
  { key: "start", label: "Inicio da partida" },
  { key: "halftime", label: "Intervalo da partida" },
  { key: "goal", label: "Gol" },
  { key: "finish", label: "Fim da partida" },
  { key: "favoritePlayerGoal", label: "Gol do jogador favorito" },
  { key: "leadChange", label: "Virada no placar" },
];

const emptyAlertSettings = (): LiveAlertSettings => ({
  enabled: false,
  side: null,
  events: { ...DEFAULT_ALERT_EVENTS },
});

const normalizeLiveAlertSettings = (value?: Partial<LiveAlertSettings> | null): LiveAlertSettings => ({
  enabled: Boolean(value?.enabled),
  side: value?.side === "home" || value?.side === "away" || value?.side === "both" ? value.side : null,
  events: { ...DEFAULT_ALERT_EVENTS, ...(value?.events || {}) },
});

const readLiveAlertSettings = (): Record<number, LiveAlertSettings> => {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(LIVE_ALERTS_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.entries(parsed).reduce<Record<number, LiveAlertSettings>>((acc, [key, value]) => {
      const id = Number(key);
      if (Number.isFinite(id)) acc[id] = normalizeLiveAlertSettings(value as Partial<LiveAlertSettings>);
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const readLiveRefreshInterval = () => {
  if (typeof window === "undefined") return 60_000;
  const raw = localStorage.getItem(LIVE_REFRESH_INTERVAL_STORAGE_KEY);
  if (!raw) return 60_000;
  const parsed = Number(raw);
  return LIVE_REFRESH_INTERVAL_OPTIONS.some((option) => option.value === parsed) ? parsed : 60_000;
};

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isIntervalClock = (value?: string | null) => /interval|halftime|half-time|^ht$/i.test(String(value || "").trim());

const leadingSide = (homeScore: number, awayScore: number): TeamSide | null => {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return null;
};

const alertSideIncludes = (selected: AlertSide | null, side: TeamSide) => selected === "both" || selected === side;

const alertToneForSide = (selected: AlertSide | null, side: TeamSide): AlertTone =>
  alertSideIncludes(selected, side) ? "positive" : "negative";

const createTone = (ctx: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType) => {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
};

const playAlertSound = (tone: AlertTone) => {
  const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  const notes =
    tone === "positive"
      ? [523.25, 659.25, 783.99, 1046.5]
      : tone === "negative"
        ? [392, 329.63, 261.63, 196]
        : [440, 554.37];

  notes.forEach((frequency, index) => {
    createTone(ctx, frequency, now + index * 0.12, tone === "neutral" ? 0.12 : 0.18, tone === "negative" ? "sine" : "triangle");
  });

  window.setTimeout(() => void ctx.close(), 1200);
};

const formatDateTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const formatRefreshClock = () =>
  new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const intervalLabel = (value: number) =>
  LIVE_REFRESH_INTERVAL_OPTIONS.find((option) => option.value === value)?.label || "Manual";

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

const lastFullyCompletedRound = (matches: SofaMatch[]) => {
  const fallback = matches
    .filter(isFinished)
    .sort((a, b) => b.startTimestamp - a.startTimestamp)
    .slice(0, 8);

  const byRound = new Map<number, SofaMatch[]>();
  matches.forEach((match) => {
    if (typeof match.roundInfo !== "number") return;
    const roundMatches = byRound.get(match.roundInfo) || [];
    roundMatches.push(match);
    byRound.set(match.roundInfo, roundMatches);
  });

  if (byRound.size === 0) return fallback;

  const expectedMatches = Math.max(...Array.from(byRound.values()).map((roundMatches) => roundMatches.length));
  const completedRound = Array.from(byRound.entries())
    .filter(([, roundMatches]) => roundMatches.length >= expectedMatches && roundMatches.every(isFinished))
    .sort(([roundA], [roundB]) => roundB - roundA)[0];

  return completedRound
    ? [...completedRound[1]].sort((a, b) => a.startTimestamp - b.startTimestamp)
    : fallback;
};

const normalizeClockPart = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text || /^(started|live|in progress|ao vivo)$/i.test(text)) return null;
  if (/^(ht|halftime)$/i.test(text) || /interval/i.test(text)) return "Intervalo";
  if (/^(1t|1o tempo|1st half|first half)$/i.test(text)) return "1T";
  if (/^(2t|2o tempo|2nd half|second half)$/i.test(text)) return "2T";
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

const liveAlertDotClass = (alert: ResolvedLiveAlert, side: TeamSide) => {
  if (!alert.enabled || !alert.side) return "bg-slate-500";
  if (alertSideIncludes(alert.side, side)) return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]";
  return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.45)]";
};

const LiveTeamAlertButton = ({
  side,
  teamName,
  alert,
  onClick,
}: {
  side: TeamSide;
  teamName: string;
  alert: ResolvedLiveAlert;
  onClick: (side: TeamSide) => void;
}) => {
  const status = !alert.enabled || !alert.side
    ? "sem alertas"
    : alertSideIncludes(alert.side, side)
      ? "alerta favoravel"
      : "alerta desfavoravel";

  return (
    <button
      type="button"
      onClick={() => onClick(side)}
      title={`Usar ${teamName} como time da torcida (${status})`}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left transition-colors hover:bg-secondary"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${liveAlertDotClass(alert, side)}`} />
      <span className="truncate">{teamName}</span>
    </button>
  );
};

const LiveAlertPopups = ({ alerts, onDismiss }: { alerts: LiveAlertPopup[]; onDismiss: (id: string) => void }) => {
  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`pointer-events-auto rounded-lg border bg-card p-3 shadow-xl ${
            alert.tone === "positive"
              ? "border-emerald-400/50"
              : alert.tone === "negative"
                ? "border-rose-400/50"
                : "border-border"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{alert.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(alert.id)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Fechar notificacao"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const LiveMatchCard = ({
  match,
  alert,
  onQuickSelectSide,
  onSetSide,
  onToggleEnabled,
  onToggleEvent,
}: {
  match: SofaLiveMatch;
  alert: ResolvedLiveAlert;
  onQuickSelectSide: (match: SofaLiveMatch, side: TeamSide) => void;
  onSetSide: (match: SofaLiveMatch, side: AlertSide) => void;
  onToggleEnabled: (match: SofaLiveMatch, enabled: boolean) => void;
  onToggleEvent: (match: SofaLiveMatch, event: LiveAlertEvent, enabled: boolean) => void;
}) => {
  const clock = formatLiveClock(match);

  return (
    <div className="relative rounded-lg border border-border bg-card px-3 py-2 pr-9">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Customizar notificacoes da partida"
            className={`absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
              alert.enabled
                ? "border-sport/60 bg-sport/15 text-sport hover:bg-sport/25"
                : "border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {alert.enabled ? <BellRing className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-bold text-foreground">Alertas da partida</p>
              <p className="text-xs text-muted-foreground">
                {alert.auto ? "Autoativado por favorito" : "Configure quais eventos devem aparecer no pop-up"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onToggleEnabled(match, !alert.enabled)}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                alert.enabled
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                  : "bg-sport text-sport-foreground hover:opacity-90"
              }`}
            >
              {alert.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
              {alert.enabled ? "Desativar alertas" : "Ativar alertas"}
            </button>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-foreground">Torcida</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { side: "home" as AlertSide, label: match.homeTeam },
                  { side: "both" as AlertSide, label: "Ambos" },
                  { side: "away" as AlertSide, label: match.awayTeam },
                ].map((option) => {
                  const active = alert.side === option.side;
                  return (
                    <button
                      key={option.side}
                      type="button"
                      onClick={() => onSetSide(match, option.side)}
                      className={`min-w-0 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-sport bg-sport/15 text-sport"
                          : "border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                      title={option.label}
                    >
                      <span className="block truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Eventos</p>
              {ALERT_EVENT_LABELS.map((option) => (
                <label key={option.key} className="flex items-center justify-between gap-3 rounded-md bg-secondary/40 px-2.5 py-2">
                  <span className="text-xs text-foreground">{option.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(alert.events[option.key])}
                    onChange={(event) => onToggleEvent(match, option.key, event.currentTarget.checked)}
                    className="h-4 w-4 accent-sport"
                  />
                </label>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        {match.country ? `${match.country} - ` : ""}
        {match.tournament}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
        <LiveTeamAlertButton side="home" teamName={match.homeTeam} alert={alert} onClick={(side) => onQuickSelectSide(match, side)} />
        <span className="rounded-md bg-destructive/10 px-2 py-0.5 font-display text-sm text-destructive">
          {match.homeScore} - {match.awayScore}
        </span>
        <LiveTeamAlertButton side="away" teamName={match.awayTeam} alert={alert} onClick={(side) => onQuickSelectSide(match, side)} />
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
  const [showAllLiveMatches, setShowAllLiveMatches] = useState(false);
  const [showOnlyAlertedLiveMatches, setShowOnlyAlertedLiveMatches] = useState(false);
  const [liveRefreshIntervalMs, setLiveRefreshIntervalMs] = useState(readLiveRefreshInterval);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [liveRefreshNotice, setLiveRefreshNotice] = useState<string | null>(null);
  const [liveAlertSettings, setLiveAlertSettings] = useState<Record<number, LiveAlertSettings>>(readLiveAlertSettings);
  const [liveAlertPopups, setLiveAlertPopups] = useState<LiveAlertPopup[]>([]);
  const liveSnapshotsRef = useRef<Record<number, LiveMatchSnapshot>>({});
  const liveAlertsPrimedRef = useRef(false);

  const { lastMatches, nextMatches, status: matchesStatus, refetch: refetchMatches } = useMatches(league.sofascoreUrl);
  const { data: todayMatches, status: todayStatus, refetch: refetchToday } = useTodayMatches();
  const { data: liveMatches, status: liveStatus, refetch: refetchLive } = useLiveMatches(liveRefreshIntervalMs);
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
  const favoriteTeamNameSet = useMemo(
    () => new Set(favoriteTeamNames.map(normalizeName).filter(Boolean)),
    [favoriteTeamNames]
  );
  const favoritePlayerNames = useMemo(
    () => favorites.filter((fav) => fav.tipo === "atleta").map((fav) => normalizeName(fav.nome)).filter(Boolean),
    [favorites]
  );

  useEffect(() => {
    localStorage.setItem(LIVE_COUNTRIES_STORAGE_KEY, JSON.stringify(selectedLiveCountries));
  }, [selectedLiveCountries]);

  useEffect(() => {
    localStorage.setItem(TODAY_COUNTRIES_STORAGE_KEY, JSON.stringify(selectedTodayCountries));
  }, [selectedTodayCountries]);

  useEffect(() => {
    localStorage.setItem(LIVE_ALERTS_STORAGE_KEY, JSON.stringify(liveAlertSettings));
  }, [liveAlertSettings]);

  useEffect(() => {
    localStorage.setItem(LIVE_REFRESH_INTERVAL_STORAGE_KEY, String(liveRefreshIntervalMs));
  }, [liveRefreshIntervalMs]);

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

  const favoriteSideForMatch = useCallback(
    (match: LiveMatchSnapshot): AlertSide | null => {
      const homeFavorite =
        (match.homeTeamId !== null && match.homeTeamId !== undefined && favoriteTeamIds.has(String(match.homeTeamId))) ||
        favoriteTeamNameSet.has(normalizeName(match.homeTeam));
      const awayFavorite =
        (match.awayTeamId !== null && match.awayTeamId !== undefined && favoriteTeamIds.has(String(match.awayTeamId))) ||
        favoriteTeamNameSet.has(normalizeName(match.awayTeam));

      if (homeFavorite && awayFavorite) return "both";
      if (homeFavorite) return "home";
      if (awayFavorite) return "away";
      return null;
    },
    [favoriteTeamIds, favoriteTeamNameSet]
  );

  const resolveLiveAlert = useCallback(
    (match: LiveMatchSnapshot): ResolvedLiveAlert => {
      const manual = liveAlertSettings[match.id];
      if (manual) return { ...normalizeLiveAlertSettings(manual), auto: false };

      const favoriteSide = favoriteSideForMatch(match);
      if (favoriteSide) {
        return {
          enabled: true,
          side: favoriteSide,
          events: { ...DEFAULT_ALERT_EVENTS },
          auto: true,
        };
      }

      return { ...emptyAlertSettings(), auto: false };
    },
    [favoriteSideForMatch, liveAlertSettings]
  );

  const updateLiveAlert = useCallback(
    (match: SofaLiveMatch, updater: (current: LiveAlertSettings) => LiveAlertSettings) => {
      setLiveAlertSettings((current) => {
        const base = normalizeLiveAlertSettings(current[match.id] || {
          ...emptyAlertSettings(),
          side: favoriteSideForMatch(match),
        });
        return {
          ...current,
          [match.id]: updater(base),
        };
      });
    },
    [favoriteSideForMatch]
  );

  const quickSelectLiveAlertSide = useCallback(
    (match: SofaLiveMatch, side: TeamSide) => {
      updateLiveAlert(match, (current) => {
        const shouldDisable = current.enabled && current.side === side;
        return {
          ...current,
          enabled: !shouldDisable,
          side: shouldDisable ? current.side : side,
        };
      });
    },
    [updateLiveAlert]
  );

  const setLiveAlertSide = useCallback(
    (match: SofaLiveMatch, side: AlertSide) => {
      updateLiveAlert(match, (current) => ({
        ...current,
        enabled: true,
        side,
      }));
    },
    [updateLiveAlert]
  );

  const toggleLiveAlertEnabled = useCallback(
    (match: SofaLiveMatch, enabled: boolean) => {
      updateLiveAlert(match, (current) => ({
        ...current,
        enabled,
        side: current.side || favoriteSideForMatch(match) || "home",
      }));
    },
    [favoriteSideForMatch, updateLiveAlert]
  );

  const toggleLiveAlertEvent = useCallback(
    (match: SofaLiveMatch, event: LiveAlertEvent, enabled: boolean) => {
      updateLiveAlert(match, (current) => ({
        ...current,
        events: {
          ...current.events,
          [event]: enabled,
        },
      }));
    },
    [updateLiveAlert]
  );

  const dismissLiveAlertPopup = useCallback((id: string) => {
    setLiveAlertPopups((current) => current.filter((alert) => alert.id !== id));
  }, []);

  const pushLiveAlertPopup = useCallback((alert: Omit<LiveAlertPopup, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextAlert = { ...alert, id };
    setLiveAlertPopups((current) => [nextAlert, ...current].slice(0, 4));
    playAlertSound(alert.tone);
    window.setTimeout(() => {
      setLiveAlertPopups((current) => current.filter((item) => item.id !== id));
    }, 7000);
  }, []);

  const isFavoritePlayerName = useCallback(
    (playerName: string) => {
      const normalized = normalizeName(playerName);
      return Boolean(normalized) && favoritePlayerNames.some((favorite) => normalized.includes(favorite) || favorite.includes(normalized));
    },
    [favoritePlayerNames]
  );

  const notifyGoal = useCallback(
    async (match: SofaLiveMatch, scoringSide: TeamSide, alert: ResolvedLiveAlert) => {
      const scoringTeam = scoringSide === "home" ? match.homeTeam : match.awayTeam;
      const score = `${match.homeScore} - ${match.awayScore}`;
      let favoriteScorer: string | null = null;

      if (alert.events.favoritePlayerGoal && favoritePlayerNames.length > 0) {
        try {
          const incidents = await sofaScoreService.getGoalIncidents(match.id);
          const matchingIncident = incidents
            .filter((incident) => incident.teamSide === scoringSide)
            .find((incident) => {
              const scoreMatches =
                typeof incident.homeScore !== "number" ||
                typeof incident.awayScore !== "number" ||
                (incident.homeScore === match.homeScore && incident.awayScore === match.awayScore);
              return scoreMatches && incident.playerName && isFavoritePlayerName(incident.playerName);
            });
          favoriteScorer = matchingIncident?.playerName || null;
        } catch {
          favoriteScorer = null;
        }
      }

      if (favoriteScorer) {
        pushLiveAlertPopup({
          title: "Gol de jogador favorito",
          description: `${favoriteScorer} marcou para ${scoringTeam}. Placar: ${score}`,
          tone: alertToneForSide(alert.side, scoringSide),
        });
        return;
      }

      if (!alert.events.goal) return;

      pushLiveAlertPopup({
        title: alertToneForSide(alert.side, scoringSide) === "positive" ? "Gol favoravel" : "Gol do adversario",
        description: `${scoringTeam} marcou. Placar: ${score}`,
        tone: alertToneForSide(alert.side, scoringSide),
      });
    },
    [favoritePlayerNames.length, isFavoritePlayerName, pushLiveAlertPopup]
  );

  useEffect(() => {
    if (liveStatus !== "success") return;

    const previous = liveSnapshotsRef.current;
    const next = liveMatches.reduce<Record<number, LiveMatchSnapshot>>((acc, match) => {
      acc[match.id] = {
        id: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        minute: match.minute,
        period: match.period,
        tournament: match.tournament,
        country: match.country,
      };
      return acc;
    }, {});

    if (!liveAlertsPrimedRef.current) {
      liveSnapshotsRef.current = next;
      liveAlertsPrimedRef.current = true;
      return;
    }

    liveMatches.forEach((match) => {
      const alert = resolveLiveAlert(match);
      if (!alert.enabled) return;

      const oldMatch = previous[match.id];
      if (!oldMatch) {
        if (alert.events.start) {
          pushLiveAlertPopup({
            title: "Inicio de partida",
            description: `${match.homeTeam} x ${match.awayTeam}`,
            tone: "neutral",
          });
        }
        return;
      }

      const homeGoals = Math.max(0, match.homeScore - oldMatch.homeScore);
      const awayGoals = Math.max(0, match.awayScore - oldMatch.awayScore);
      if (homeGoals > 0) void notifyGoal(match, "home", alert);
      if (awayGoals > 0) void notifyGoal(match, "away", alert);

      const oldLeader = leadingSide(oldMatch.homeScore, oldMatch.awayScore);
      const newLeader = leadingSide(match.homeScore, match.awayScore);
      if (alert.events.leadChange && oldLeader && newLeader && oldLeader !== newLeader) {
        pushLiveAlertPopup({
          title: "Virada no placar",
          description: `${newLeader === "home" ? match.homeTeam : match.awayTeam} virou: ${match.homeScore} - ${match.awayScore}`,
          tone: alertToneForSide(alert.side, newLeader),
        });
      }

      const wasInterval = isIntervalClock(oldMatch.period) || isIntervalClock(oldMatch.minute);
      const isInterval = isIntervalClock(match.period) || isIntervalClock(match.minute);
      if (alert.events.halftime && !wasInterval && isInterval) {
        pushLiveAlertPopup({
          title: "Intervalo da partida",
          description: `${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`,
          tone: "neutral",
        });
      }
    });

    Object.values(previous).forEach((match) => {
      if (next[match.id]) return;
      const alert = resolveLiveAlert(match);
      if (!alert.enabled || !alert.events.finish) return;
      pushLiveAlertPopup({
        title: "Fim da partida",
        description: `${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`,
        tone: "neutral",
      });
    });

    liveSnapshotsRef.current = next;
  }, [liveMatches, liveStatus, notifyGoal, pushLiveAlertPopup, resolveLiveAlert]);

  const liveCountryOptions = useMemo(
    () =>
      Array.from(
        new Set([...selectedLiveCountries, ...liveMatches.map((match) => match.country || "Outros")])
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [liveMatches, selectedLiveCountries]
  );

  const countryFilteredLiveMatches = useMemo(() => {
    if (selectedLiveCountries.length === 0) return liveMatches;
    return liveMatches.filter((match) => selectedLiveCountries.includes(match.country || "Outros"));
  }, [liveMatches, selectedLiveCountries]);

  const alertedLiveMatchesCount = useMemo(
    () => countryFilteredLiveMatches.filter((match) => resolveLiveAlert(match).enabled).length,
    [countryFilteredLiveMatches, resolveLiveAlert]
  );

  const selectedLiveMatches = useMemo(() => {
    if (!showOnlyAlertedLiveMatches) return countryFilteredLiveMatches;
    return countryFilteredLiveMatches.filter((match) => resolveLiveAlert(match).enabled);
  }, [countryFilteredLiveMatches, resolveLiveAlert, showOnlyAlertedLiveMatches]);

  const visibleLiveMatches = useMemo(
    () =>
      showAllLiveMatches
        ? selectedLiveMatches
        : selectedLiveMatches.slice(0, LIVE_MATCHES_PREVIEW_LIMIT),
    [selectedLiveMatches, showAllLiveMatches]
  );

  useEffect(() => {
    if (selectedLiveMatches.length <= LIVE_MATCHES_PREVIEW_LIMIT) {
      setShowAllLiveMatches(false);
    }
  }, [selectedLiveMatches.length]);

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
    return lastFullyCompletedRound([...lastMatches, ...nextMatches]);
  }, [lastMatches, nextMatches]);

  const lastCompletedRoundTitle = lastCompletedRound[0]?.roundInfo
    ? `Ultima rodada finalizada - Rodada ${lastCompletedRound[0].roundInfo}`
    : "Ultima rodada finalizada";

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

  const refreshAll = async () => {
    if (isRefreshingAll) return;
    setIsRefreshingAll(true);
    setRefreshNotice(null);
    await Promise.allSettled([
      refetchMatches({ force: true }),
      refetchToday({ force: true }),
      refetchLive({ force: true }),
      refetchScorers({ force: true }),
      refetchAssists({ force: true }),
    ]);
    const time = formatRefreshClock();
    setRefreshNotice(`Atualizado as ${time}`);
    setLiveRefreshNotice(`Ao vivo atualizado as ${time}`);
    setIsRefreshingAll(false);
  };

  const refreshLiveMatches = async () => {
    if (isRefreshingLive) return;
    setIsRefreshingLive(true);
    setLiveRefreshNotice(null);
    await refetchLive({ force: true });
    setLiveRefreshNotice(`Ao vivo atualizado as ${formatRefreshClock()}`);
    setIsRefreshingLive(false);
  };

  return (
    <div className="space-y-4">
      <LiveAlertPopups alerts={liveAlertPopups} onDismiss={dismissLiveAlertPopup} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Dashboard - Agenda de partidas
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {isRefreshingAll ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Atualizando dados do dashboard...
              </>
            ) : refreshNotice ? (
              <>
                <Check className="h-3.5 w-3.5 text-sport" /> {refreshNotice}
              </>
            ) : isLoading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando partidas...
              </>
            ) : isOffline ? (
              <>
                <WifiOff className="h-3.5 w-3.5 text-destructive" /> Nao foi possivel atualizar todos os jogos
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
          disabled={isRefreshingAll}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading || isRefreshingAll ? "animate-spin" : ""}`} />
          {isRefreshingAll ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <Card className={`p-3 ${selectedLiveMatches.length > 0 ? "border-destructive/30 bg-destructive/5" : ""}`}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-foreground">
            <Radio className={`h-4 w-4 ${selectedLiveMatches.length > 0 ? "text-destructive" : "text-sport"}`} />
            Ao vivo agora
          </h2>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="Filtros de notificacoes ao vivo"
                  className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                    showOnlyAlertedLiveMatches
                      ? "border-sport bg-sport text-sport-foreground"
                      : "border-border bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Filtros ao vivo</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {alertedLiveMatchesCount} de {countryFilteredLiveMatches.length} partidas tem notificacoes ativas.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="live-refresh-interval" className="text-xs font-semibold text-foreground">
                      Atualizacao automatica
                    </label>
                    <select
                      id="live-refresh-interval"
                      value={liveRefreshIntervalMs}
                      onChange={(event) => setLiveRefreshIntervalMs(Number(event.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-sport"
                    >
                      {LIVE_REFRESH_INTERVAL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={showOnlyAlertedLiveMatches}
                      onChange={(event) => setShowOnlyAlertedLiveMatches(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-sport"
                    />
                    <span>Mostrar apenas partidas com notificacoes ativas</span>
                  </label>
                </div>
              </PopoverContent>
            </Popover>
            <CountrySelector
              label={liveCountryLabel}
              options={liveCountryOptions}
              selectedCountries={selectedLiveCountries}
              onClear={() => setSelectedLiveCountries([])}
              onToggle={toggleLiveCountry}
              emptyMessage="Sem paises ao vivo agora."
            />
            <button
              onClick={refreshLiveMatches}
              disabled={isRefreshingLive}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className={`h-3 w-3 ${liveStatus === "loading" || isRefreshingLive ? "animate-spin" : ""}`} />
              {isRefreshingLive ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
        {liveRefreshNotice && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-sport">
            <Check className="h-3.5 w-3.5" />
            {liveRefreshNotice}
            <span className="text-muted-foreground">Auto: {intervalLabel(liveRefreshIntervalMs)}</span>
          </p>
        )}
        {liveStatus === "loading" && selectedLiveMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Verificando partidas em andamento...</p>
        ) : selectedLiveMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {showOnlyAlertedLiveMatches
              ? "Nenhuma partida ao vivo com notificacoes ativas neste filtro."
              : "Nenhuma partida monitorada esta ao vivo no momento."}
          </p>
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleLiveMatches.map((match) => (
                <LiveMatchCard
                  key={match.id}
                  match={match}
                  alert={resolveLiveAlert(match)}
                  onQuickSelectSide={quickSelectLiveAlertSide}
                  onSetSide={setLiveAlertSide}
                  onToggleEnabled={toggleLiveAlertEnabled}
                  onToggleEvent={toggleLiveAlertEvent}
                />
              ))}
            </div>
            {selectedLiveMatches.length > LIVE_MATCHES_PREVIEW_LIMIT && (
              <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <span className="text-xs text-muted-foreground">
                  Mostrando {visibleLiveMatches.length} de {selectedLiveMatches.length} partidas ao vivo
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllLiveMatches((current) => !current)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  {showAllLiveMatches ? "Mostrar menos" : "Mostrar todas"}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAllLiveMatches ? "rotate-180" : ""}`} />
                </button>
              </div>
            )}
          </>
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
          title={lastCompletedRoundTitle}
          subtitle={`Rodada completamente jogada em ${league.name}`}
          defaultOpen={false}
        >
          {lastCompletedRound.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma rodada completamente finalizada encontrada.</p>
          ) : (
            <div className="space-y-2">
              {lastCompletedRound.map((match) => (
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
