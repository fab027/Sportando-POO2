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
        { value: "top", label: "Top 4 (G4)" },
        { value: "mid", label: "Meio da tabela" },
        { value: "bottom", label: "Zona de rebaixamento" },
      ],
    },
    {
      key: "sortBy",
      label: "Ordenar",
      options: [
        { value: "points", label: "Pontos" },
        { value: "wins", label: "Vitórias" },
        { value: "scored", label: "Gols pró" },
        { value: "conceded", label: "Gols sofridos (asc)" },
      ],
    },
  ];

  const processed = useMemo(() => {
    let list = standings.filter(
      (t) =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.shortName?.toLowerCase().includes(search.toLowerCase())
    );
    if (filters.zone === "top") list = list.filter((t) => t.position <= 4);
    else if (filters.zone === "mid") list = list.filter((t) => t.position > 4 && t.position < 17);
    else if (filters.zone === "bottom") list = list.filter((t) => t.position >= 17);

    const sorted = [...list];
    switch (filters.sortBy) {
      case "wins": sorted.sort((a, b) => b.wins - a.wins); break;
      case "scored": sorted.sort((a, b) => b.scored - a.scored); break;
      case "conceded": sorted.sort((a, b) => a.conceded - b.conceded); break;
      default: sorted.sort((a, b) => a.position - b.position);
    }
    return sorted;
  }, [standings, search, filters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Equipes — {league.flag} {league.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
            {isLoading ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando...</>
            ) : status === "error" ? (
              <><WifiOff className="h-3.5 w-3.5 text-destructive" /> Dados offline</>
            ) : (
              <><Wifi className="h-3.5 w-3.5 text-sport" />
                {processed.length} de {standings.length} equipes
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={refetch}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar equipe..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <FilterBar
        filters={filterDefs}
        values={filters}
        onChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
        onClear={() => setFilters({ zone: "all", sortBy: "points" })}
      />

      {processed.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-12">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Time</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">J</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">V</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">E</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">D</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">GP</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">GC</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-foreground">Pts</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">⭐</th>
              </tr>
            </thead>
            <tbody>
              {processed.map((t) => {
                const favorited = isFavorite("equipe", String(t.id));
                return (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3"><PositionBadge pos={t.position} /></td>
                    <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.played}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.wins}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.draws}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.losses}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.scored}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.conceded}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-md bg-sport-light px-2 py-0.5 text-xs font-bold text-sport">
                        {t.points}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleFavorite({ tipo: "equipe", referenciaId: String(t.id), nome: t.name, esporte: sport })}
                        className="transition-colors hover:scale-110"
                      >
                        <Star className={`h-4 w-4 ${favorited ? "fill-sport text-sport" : "text-muted-foreground"}`} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && standings.length > 0 && processed.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhuma equipe corresponde aos filtros aplicados.</p>
      )}

      {isLoading && standings.length === 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
              <div className="h-4 bg-secondary rounded w-3/4 mb-3" />
              <div className="h-4 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {error && standings.length === 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <WifiOff className="mx-auto h-8 w-8 text-destructive/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Não foi possível carregar dados.</p>
          <button onClick={refetch} className="rounded-lg bg-sport px-4 py-2 text-xs font-medium text-sport-foreground hover:opacity-90">
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
};

export default TeamsPage;
