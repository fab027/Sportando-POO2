import { useMemo, useState } from "react";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useSport } from "@/contexts/SportContext";
import { Star, Trash2 } from "lucide-react";
import FilterBar, { FilterDef } from "@/components/FilterBar";

const FavoritesPage = () => {
  const { favorites, toggleFavorite } = useFavorites();
  const { sport, sportLabel } = useSport();
  const [filters, setFilters] = useState<Record<string, string>>({ tipo: "all" });

  const filterDefs: FilterDef[] = [
    {
      key: "tipo",
      label: "Tipo",
      options: [
        { value: "equipe", label: "Equipes" },
        { value: "atleta", label: "Atletas" },
      ],
    },
  ];

  // RF03: only show favorites of the user's profile sport
  const visible = useMemo(() => {
    return favorites.filter((f) => {
      if (f.esporte !== sport) return false;
      if (filters.tipo !== "all" && f.tipo !== filters.tipo) return false;
      return true;
    });
  }, [favorites, sport, filters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Favoritos — {sportLabel}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seus atletas e equipes favoritos para acesso rápido
        </p>
      </div>

      <FilterBar
        filters={filterDefs}
        values={filters}
        onChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
        onClear={() => setFilters({ tipo: "all" })}
      />

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Star className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum favorito ainda.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Adicione equipes e atletas para vê-los aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((fav) => (
            <div
              key={`${fav.tipo}-${fav.referenciaId}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Star className="h-4 w-4 fill-sport text-sport" />
                <div>
                  <p className="text-sm font-medium text-foreground">{fav.nome}</p>
                  <p className="text-xs text-muted-foreground capitalize">{fav.tipo}</p>
                </div>
              </div>
              <button
                onClick={() => toggleFavorite(fav)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remover favorito"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FavoritesPage;
