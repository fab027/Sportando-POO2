import { useMemo, useState } from "react";
import { RefreshCw, Wifi, WifiOff, BrainCircuit, TrendingUp } from "lucide-react";
import { useOdds } from "@/hooks/useSofaScoreData";
import FilterBar, { FilterDef } from "@/components/FilterBar";

const oddsToProb = (odds: number) => (odds > 0 ? (1 / odds) * 100 : 0);

const PredictionsPage = () => {
  const { data: odds, status, refetch } = useOdds();
  const isLoading = status === "loading";
  const [filters, setFilters] = useState<Record<string, string>>({ market: "all", favorite: "all", confidence: "all" });

  const filterDefs: FilterDef[] = [
    {
      key: "market",
      label: "Mercado",
      options: [
        { value: "1x2", label: "1X2 (Resultado)" },
        { value: "draw", label: "Com chance de empate" },
        { value: "no-draw", label: "Sem empate (basquete)" },
      ],
    },
    {
      key: "confidence",
      label: "Confiança",
      options: [
        { value: "high", label: "Alta (>=70%)" },
        { value: "medium", label: "Média (55-69%)" },
        { value: "low", label: "Baixa (<55%)" },
      ],
    },
    {
      key: "favorite",
      label: "Favorito",
      options: [
        { value: "home", label: "Casa favorita" },
        { value: "away", label: "Visitante favorito" },
        { value: "balanced", label: "Equilibrado (<55%)" },
      ],
    },
  ];

  const filtered = useMemo(() => {
    return odds.filter((o) => {
      const ph = oddsToProb(o.homeOdds), pd = oddsToProb(o.drawOdds), pa = oddsToProb(o.awayOdds);
      const max = Math.max(ph, pd, pa);

      if (filters.market === "draw" && o.drawOdds <= 0) return false;
      if (filters.market === "no-draw" && o.drawOdds > 0) return false;
      if (filters.market === "1x2" && o.drawOdds <= 0) return false;

      if (filters.favorite === "home" && ph !== max) return false;
      if (filters.favorite === "away" && pa !== max) return false;
      if (filters.favorite === "balanced" && max >= 55) return false;

      if (filters.confidence === "high" && max < 70) return false;
      if (filters.confidence === "medium" && (max < 55 || max >= 70)) return false;
      if (filters.confidence === "low" && max >= 55) return false;
      return true;
    });
  }, [odds, filters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-sport" />
            Previsões — Odds Reais
          </h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
            {isLoading ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando odds...</>
            ) : status === "error" ? (
              <><WifiOff className="h-3.5 w-3.5 text-destructive" /> Dados offline</>
            ) : (
              <><Wifi className="h-3.5 w-3.5 text-sport" /> {filtered.length} de {odds.length} partidas com odds</>
            )}
          </p>
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <FilterBar
        filters={filterDefs}
        values={filters}
        onChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
        onClear={() => setFilters({ market: "all", favorite: "all", confidence: "all" })}
      />

      {isLoading && odds.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-6 animate-pulse">
              <div className="h-5 bg-secondary rounded w-3/4 mb-4" />
              <div className="space-y-3">
                <div className="h-3 bg-secondary rounded w-full" />
                <div className="h-3 bg-secondary rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === "error" && odds.length === 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <WifiOff className="mx-auto h-8 w-8 text-destructive/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Não foi possível carregar odds.</p>
          <button onClick={refetch} className="rounded-lg bg-sport px-4 py-2 text-xs font-medium text-sport-foreground hover:opacity-90">
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && odds.length > 0 && filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhuma partida corresponde aos filtros aplicados.</p>
      )}

      <div className="space-y-4">
        {filtered.map((o) => {
          const probHome = oddsToProb(o.homeOdds);
          const probDraw = oddsToProb(o.drawOdds);
          const probAway = oddsToProb(o.awayOdds);
          const maxProb = Math.max(probHome, probDraw, probAway);

          return (
            <div key={o.id} className="rounded-xl border border-border bg-card p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-foreground">
                  {o.homeTeam} vs {o.awayTeam}
                </h3>
                <div className="text-right">
                  {o.tournament && <span className="text-xs text-muted-foreground block">{o.tournament}</span>}
                  {o.date && <span className="text-xs text-muted-foreground">{o.date}</span>}
                  {o.bookmaker && <span className="text-[10px] text-muted-foreground block">via {o.bookmaker}</span>}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground flex items-center gap-1">
                      {probHome === maxProb && <TrendingUp className="h-3 w-3 text-sport" />}
                      Vitória {o.homeTeam}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">@{o.homeOdds.toFixed(2)}</span>
                      <span className="font-semibold text-sport">{probHome.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-sport transition-all" style={{ width: `${Math.max(probHome, 2)}%` }} />
                  </div>
                </div>

                {o.drawOdds > 0 && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-foreground">Empate</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">@{o.drawOdds.toFixed(2)}</span>
                        <span className="font-semibold text-muted-foreground">{probDraw.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-muted-foreground/40 transition-all" style={{ width: `${Math.max(probDraw, 2)}%` }} />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-foreground flex items-center gap-1">
                      {probAway === maxProb && <TrendingUp className="h-3 w-3 text-sport" />}
                      Vitória {o.awayTeam}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">@{o.awayOdds.toFixed(2)}</span>
                      <span className="font-semibold text-muted-foreground">{probAway.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-muted-foreground/30 transition-all" style={{ width: `${Math.max(probAway, 2)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PredictionsPage;
