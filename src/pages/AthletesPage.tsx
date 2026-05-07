import { useMemo, useState, useCallback } from "react";
import { Search, RefreshCw, User, ArrowLeft, Shield, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSport } from "@/contexts/SportContext";
import { useStandings, usePlayerSearch, usePlayerStats, useTeamPlayers } from "@/hooks/useSofaScoreData";
import { PlayerDetail, TeamPlayer } from "@/services/sofaScoreService";
import FilterBar, { FilterDef } from "@/components/FilterBar";
import { useFavorites } from "@/contexts/FavoritesContext";

const PlayerCard = ({
  player,
  playerUrl,
  onBack,
}: {
  player: PlayerDetail;
  playerUrl: string;
  onBack: () => void;
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { sport } = useSport();
  const esporte: "football" | "basketball" = sport === "basketball" ? "basketball" : "football";
  const fav = isFavorite("atleta", playerUrl);

  const getRatingColor = (r: number) => {
    if (r >= 7.5) return "bg-green-600 text-white";
    if (r >= 7.0) return "bg-green-500 text-white";
    if (r >= 6.5) return "bg-yellow-500 text-white";
    return "bg-muted text-foreground";
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sport/10 text-sport">
            <User className="h-10 w-10" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-2xl font-bold text-foreground">{player.name}</h2>
              <button
                onClick={() =>
                  toggleFavorite({
                    tipo: "atleta",
                    referenciaId: playerUrl,
                    nome: player.name,
                    esporte,
                  })
                }
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  fav
                    ? "border-sport bg-sport/10 text-sport"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
                aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Star className={`h-4 w-4 ${fav ? "fill-current" : ""}`} />
                {fav ? "Favorito" : "Favoritar"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {player.team && <span>🏟️ {player.team}</span>}
              {player.position && <span>📋 {player.position}</span>}
              {player.nationality && <span>🌍 {player.nationality}</span>}
              {player.age && <span>🎂 {player.age} anos</span>}
              {player.height && <span>📏 {player.height}</span>}
              {player.foot && <span>🦶 {player.foot}</span>}
              {player.shirtNumber && <span>👕 #{player.shirtNumber}</span>}
            </div>
          </div>
        </div>
      </div>

      {player.seasons && player.seasons.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <h3 className="font-display text-sm font-semibold text-foreground">Estatísticas por Temporada</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Ano</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Time</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">MP</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">MIN</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">GLS</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">AST</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">ASR</th>
                </tr>
              </thead>
              <tbody>
                {player.seasons.map((s, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{s.season}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.team}</td>
                    <td className="px-4 py-3 text-center text-foreground">{s.matchesPlayed}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{s.minutes}</td>
                    <td className="px-4 py-3 text-center font-semibold text-foreground">{s.goals}</td>
                    <td className="px-4 py-3 text-center text-foreground">{s.assists}</td>
                    <td className="px-4 py-3 text-center">
                      {s.rating > 0 ? (
                        <span className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold ${getRatingColor(s.rating)}`}>
                          {s.rating.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const positionGroup = (pos?: string) => {
  if (!pos) return "other";
  const p = pos.toLowerCase();
  if (/(goleiro|goalkeeper|gk)/.test(p)) return "GOL";
  if (/(zagueiro|defender|lateral|defens|cb|lb|rb)/.test(p)) return "DEF";
  if (/(meia|midfielder|volante|cm|dm|am)/.test(p)) return "MEI";
  if (/(atacante|forward|striker|winger|cf|st|lw|rw)/.test(p)) return "ATA";
  return "other";
};

const ageBucket = (age?: number) => {
  if (!age) return "unknown";
  if (age < 21) return "u21";
  if (age <= 28) return "21-28";
  return "29+";
};

const AthletesPage = () => {
  const { league } = useSport();
  const [search, setSearch] = useState("");
  const [selectedPlayerUrl, setSelectedPlayerUrl] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [mode, setMode] = useState<"search" | "team">("search");
  const [filters, setFilters] = useState<Record<string, string>>({ position: "all", age: "all" });

  const { results: searchResults, status: searchStatus, search: doSearch } = usePlayerSearch();
  const { data: playerData, status: playerStatus } = usePlayerStats(selectedPlayerUrl);
  const { data: standings } = useStandings(league.sofascoreUrl);
  const { data: teamPlayers, status: teamPlayersStatus } = useTeamPlayers(selectedTeam);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (value.length >= 3) doSearch(value);
  }, [doSearch]);

  const handlePlayerFromTeam = (player: TeamPlayer) => {
    // Only open directly when we have a SofaScore profile URL — that's the source
    // player_stats knows how to scrape. Otherwise fall back to a name search.
    if (player.url && /sofascore\.com\/.*\/player\//i.test(player.url)) {
      setSelectedPlayerUrl(player.url);
      return;
    }
    doSearch(player.name);
    setMode("search");
    setSearch(player.name);
  };

  const filterDefs: FilterDef[] = [
    {
      key: "position",
      label: "Posição",
      options: [
        { value: "GOL", label: "Goleiro" },
        { value: "DEF", label: "Defesa" },
        { value: "MEI", label: "Meio-campo" },
        { value: "ATA", label: "Ataque" },
      ],
    },
    {
      key: "age",
      label: "Idade",
      options: [
        { value: "u21", label: "Até 20 anos" },
        { value: "21-28", label: "21–28 anos" },
        { value: "29+", label: "29+ anos" },
      ],
    },
  ];

  const filteredTeamPlayers = useMemo(() => {
    return teamPlayers.filter((p) => {
      if (filters.position !== "all" && positionGroup(p.position) !== filters.position) return false;
      if (filters.age !== "all" && ageBucket(p.age) !== filters.age) return false;
      return true;
    });
  }, [teamPlayers, filters]);

  if (selectedPlayerUrl && playerData) {
    return (
      <div className="space-y-6">
        <PlayerCard
          player={playerData}
          playerUrl={selectedPlayerUrl}
          onBack={() => {
            setSelectedPlayerUrl(null);
          }}
        />
      </div>
    );
  }

  if (selectedPlayerUrl && playerStatus === "loading") {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedPlayerUrl(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-sport" />
          <span className="ml-3 text-sm text-muted-foreground">Carregando dados do jogador...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Atletas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Busque jogadores e veja estatísticas detalhadas do SofaScore
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-secondary p-1 w-fit">
        <button
          onClick={() => { setMode("search"); setSelectedTeam(null); }}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
            mode === "search" ? "bg-sport text-sport-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🔍 Buscar por Nome
        </button>
        <button
          onClick={() => setMode("team")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
            mode === "team" ? "bg-sport text-sport-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🏟️ Por Equipe ({league.name})
        </button>
      </div>

      {mode === "search" && (
        <div className="space-y-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Ex: Neymar, Haaland, Messi..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {searchStatus === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" /> Buscando jogadores...
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedPlayerUrl(r.url)}
                  className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left hover:shadow-md transition-shadow"
                >
                  {r.imageUrl ? (
                    <img
                      src={r.imageUrl}
                      alt={r.name}
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                      className="h-12 w-12 rounded-full object-cover bg-sport/10 flex-shrink-0"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-sport/10 text-sport">
                      <User className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{r.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {r.team ? <span>🏟️ {r.team}</span> : null}
                      {r.age ? <span>🎂 {r.age} anos</span> : null}
                      {!r.team && !r.age && (
                        <span className="line-clamp-1">{r.description || "Clique para ver detalhes"}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">›</div>
                </button>
              ))}
            </div>
          )}

          {search.length >= 3 && searchResults.length === 0 && searchStatus === "success" && (
            <p className="text-sm text-muted-foreground py-4">Nenhum jogador encontrado para "{search}".</p>
          )}

          {search.length < 3 && (
            <p className="text-sm text-muted-foreground py-4">
              Digite pelo menos 3 caracteres para buscar um jogador no SofaScore.
            </p>
          )}
        </div>
      )}

      {mode === "team" && !selectedTeam && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Selecione uma equipe para ver o elenco profissional masculino:</p>
          {standings.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" /> Carregando equipes de {league.name}...
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {standings.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTeam(t.name)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:shadow-md transition-shadow"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sport/10 text-sport font-bold text-sm">
                    {t.position}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.shortName} · {t.points} pts</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "team" && selectedTeam && (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedTeam(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar às equipes
          </button>

          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-sport" />
            <h2 className="font-display text-xl font-bold text-foreground">
              Elenco — {selectedTeam}
            </h2>
          </div>

          <FilterBar
            filters={filterDefs}
            values={filters}
            onChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
            onClear={() => setFilters({ position: "all", age: "all" })}
          />

          {teamPlayersStatus === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <RefreshCw className="h-4 w-4 animate-spin" /> Carregando elenco profissional masculino...
            </div>
          )}

          {teamPlayersStatus === "error" && (
            <p className="text-sm text-destructive py-4">Erro ao carregar o elenco. Tente novamente.</p>
          )}

          {teamPlayersStatus === "success" && filteredTeamPlayers.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              {teamPlayers.length === 0
                ? `Nenhum jogador encontrado para ${selectedTeam}.`
                : "Nenhum jogador corresponde aos filtros aplicados."}
            </p>
          )}

          {filteredTeamPlayers.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground w-12">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Jogador</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Posição</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Nacionalidade</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Idade</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeamPlayers.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => handlePlayerFromTeam(p)}
                      className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-center font-mono text-muted-foreground">
                        {p.shirtNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sport/10 text-sport">
                            <User className="h-4 w-4" />
                          </div>
                          <span className="font-medium text-foreground">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.position}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.nationality}</td>
                      <td className="px-4 py-3 text-center text-foreground">{p.age ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AthletesPage;
