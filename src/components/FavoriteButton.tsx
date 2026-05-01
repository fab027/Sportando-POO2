import { Star } from "lucide-react";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useSport } from "@/contexts/SportContext";

interface FavoriteButtonProps {
  tipo: "atleta" | "equipe";
  referenciaId: string;
  nome: string;
}

const FavoriteButton = ({ tipo, referenciaId, nome }: FavoriteButtonProps) => {
  const { toggleFavorite, isFavorite } = useFavorites();
  const { sport } = useSport();
  const favorited = isFavorite(tipo, referenciaId);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite({ tipo, referenciaId, nome, esporte: sport });
      }}
      className="transition-colors hover:scale-110"
      title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
    >
      <Star
        className={`h-4 w-4 ${favorited ? "fill-basketball text-basketball" : "text-muted-foreground"}`}
      />
    </button>
  );
};

export default FavoriteButton;
