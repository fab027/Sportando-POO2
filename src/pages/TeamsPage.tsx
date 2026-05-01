import { useMemo, useState } from "react";
import { Search, RefreshCw, Wifi, WifiOff, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSport } from "@/contexts/SportContext";
import { useStandings } from "@/hooks/useSofaScoreData";
import { useFavorites } from "@/contexts/FavoritesContext";
import FilterBar, { FilterDef } from "@/components/FilterBar";

const PositionBadge = ({ pos }: { pos: number }) => {
  if (pos <= 4) return <span className="text-sport font-bold text-sm">#{pos}</span>;
  if (pos >= 17) return <span className="text-destructive font-bold text-sm">#{pos}</span>;
  return <span className="text-muted-foreground text-sm">#{pos}</span>;
};

const TeamsPage = () => {
  const { sport, league } = useSport();
  const isFootball = sport === "football";
  const isBasketball = sport === "basketball";
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({ zone: "all", sortBy: "points" });
  const { toggleFavorite, isFavorite } = useFavorites();

  const { data: standings, status, error, refetch } = useStandings(league.sofascoreUrl);
  const isLoading = status === "loading";

  const filterDefs: FilterDef[] = [
    {
      key: "zone",
      label: "Zona",
      options: [
        { value: "top", label: isFootball ? "Top 4" : "Playoffs diretos (Top 8)" },
        { value: "mid", label: isFootball ? "Meio da tabela" : "Play-in (9º ao 12º)" },
        { value: "bottom", label: isFootball ? "Zona de rebaixamento" : "Últimas posições" },
      ],
    },
    {
      key: "sortBy",
      label: "Ordenar",
      options: [
        { value: "points", label: isFootball ? "Pontos" : "Classificação" },
        { value: "wins", label: "Vitórias" },
        { value: "scored", label: isFootball ? "Gols pró" : "Pontos feitos" },
        { value: "conceded", label: isFootball ? "Gols sofridos (asc)" : "Pontos sofridos (asc)" },
      ],
    },
  ];

  const processed = useMemo(() => {
    let list = standings.filter(
      (t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.shortName?.toLowerCase().includes(search.toLowerCase())
    );
    if (isBasketball) {
      if (filters.zone === "top") list = list.filter((t) => t.position <= 8);
      else if (filters.zone === "mid") list = list.filter((t) => t.position > 8 && t.position <= 12);
      else if (filters.zone === "bottom") list = list.filter((t) => t.position > 12);
    } else {
      if (filters.zone === "top") list = list.filter((t) => t.position <= 4);
      else if (filters.zone === "mid") list = list.filter((t) => t.position > 4 && t.position < 17);
      else if (filters.zone === "bottom") list = list.filter((t) => t.position >= 17);
    }

    const sorted = [...list];
    switch (filters.sortBy) {
      case "wins": sorted.sort((a, b) => b.wins - a.wins); break;
      case "scored": sorted.sort((a, b) => b.scored - a.scored); break;
      case "conceded": sorted.sort((a, b) => a.conceded - b.conceded); break;
      default: sorted.sort((a, b) => (isBasketball ? b.wins - a.wins : a.position - b.position));
    }
    return sorted;
  }, [standings, search, filters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Equipes — {league.flag} {league.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
            {isLoading ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando...</> : status === "error" ? <><WifiOff className="h-3.5 w-3.5 text-destructive" /> Dados offline</> : <><Wifi className="h-3.5 w-3.5 text-sport" />{processed.length} de {standings.length} equipes</>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={refetch} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />Atualizar
          </button>
          <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar equipe..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        </div>
      </div>

      <FilterBar filters={filterDefs} values={filters} onChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))} onClear={() => setFilters({ zone: "all", sortBy: "points" })} />

      {processed.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-12">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Time</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">J</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">V</th>
                {isFootball && <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">E</th>}
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">D</th>
                {isBasketball && <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Aprov.</th>}
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">{isFootball ? "GP" : "PF"}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">{isFootball ? "GC" : "PA"}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-foreground">{isFootball ? "Pts" : "V"}</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">⭐</th>
              </tr>
            </thead>
            <tbody>
              {processed.map((t) => {
                const favorited = isFavorite("equipe", String(t.id));
                const aproveitamento = t.played > 0 ? `${((t.wins / t.played) * 100).toFixed(1)}%` : "—";
                return (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3"><PositionBadge pos={t.position} /></td>
                    <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.played}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.wins}</td>
                    {isFootball && <td className="px-4 py-3 text-center text-muted-foreground">{t.draws}</td>}
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.losses}</td>
                    {isBasketball && <td className="px-4 py-3 text-center text-muted-foreground">{aproveitamento}</td>}
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.scored}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.conceded}</td>
                    <td className="px-4 py-3 text-center"><span className="inline-flex items-center justify-center rounded-md bg-sport-light px-2 py-0.5 text-xs font-bold text-sport">{isFootball ? t.points : t.wins}</span></td>
                    <td className="px-4 py-3 text-center"><button onClick={() => toggleFavorite({ tipo: "equipe", referenciaId: String(t.id), nome: t.name, esporte: sport })} className="transition-colors hover:scale-110"><Star className={`h-4 w-4 ${favorited ? "fill-sport text-sport" : "text-muted-foreground"}`} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeamsPage;
