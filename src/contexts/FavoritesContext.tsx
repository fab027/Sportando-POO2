import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface Favorite {
  tipo: "atleta" | "equipe";
  referenciaId: string;
  nome: string;
  esporte: "football" | "basketball";
}

interface FavoritesContextType {
  favorites: Favorite[];
  toggleFavorite: (fav: Favorite) => Promise<void>;
  isFavorite: (tipo: string, id: string) => boolean;
  loading: boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);

  // Load favorites from DB whenever the user changes
  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("favorites")
        .select("tipo, referencia_id, nome, esporte")
        .eq("user_id", user.id);
      if (cancelled) return;
      if (error) {
        console.error("[favorites] load error", error);
        toast({ title: "Erro ao carregar favoritos", description: error.message, variant: "destructive" });
      } else {
        setFavorites(
          (data ?? []).map((f) => ({
            tipo: f.tipo as "atleta" | "equipe",
            referenciaId: f.referencia_id,
            nome: f.nome,
            esporte: f.esporte as "football" | "basketball",
          }))
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggleFavorite = useCallback(
    async (fav: Favorite) => {
      if (!user) {
        toast({
          title: "Faça login",
          description: "Você precisa estar logado para favoritar.",
          variant: "destructive",
        });
        return;
      }
      const exists = favorites.some(
        (f) => f.tipo === fav.tipo && f.referenciaId === fav.referenciaId && f.esporte === fav.esporte
      );

      if (exists) {
        // Optimistic remove
        const prev = favorites;
        setFavorites((p) =>
          p.filter((f) => !(f.tipo === fav.tipo && f.referenciaId === fav.referenciaId && f.esporte === fav.esporte))
        );
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("tipo", fav.tipo)
          .eq("referencia_id", fav.referenciaId)
          .eq("esporte", fav.esporte);
        if (error) {
          setFavorites(prev);
          toast({ title: "Erro ao remover favorito", description: error.message, variant: "destructive" });
        }
      } else {
        // Optimistic add
        const prev = favorites;
        setFavorites((p) => [...p, fav]);
        const { error } = await supabase.from("favorites").insert({
          user_id: user.id,
          tipo: fav.tipo,
          referencia_id: fav.referenciaId,
          nome: fav.nome,
          esporte: fav.esporte,
        });
        if (error) {
          setFavorites(prev);
          toast({ title: "Erro ao adicionar favorito", description: error.message, variant: "destructive" });
        }
      }
    },
    [favorites, user]
  );

  const isFavorite = useCallback(
    (tipo: string, id: string) => favorites.some((f) => f.tipo === tipo && f.referenciaId === id),
    [favorites]
  );

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite, loading }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
};
