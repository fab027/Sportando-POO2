import { Settings } from "lucide-react";
import { useSport } from "@/contexts/SportContext";

const SportSwitcher = () => {
  const { sport, setSport, isLocked, profileSportMode, setProfileSportMode } = useSport();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
        <button
          onClick={() => setSport("football")}
          disabled={isLocked}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            sport === "football"
              ? "bg-football text-football-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Futebol
        </button>
        <button
          onClick={() => setSport("basketball")}
          disabled={isLocked}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            sport === "basketball"
              ? "bg-basketball text-basketball-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Basquete
        </button>
      </div>
      <label className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-muted-foreground">
        <Settings className="h-3.5 w-3.5" />
        Perfil
        <select
          value={profileSportMode}
          onChange={(event) => setProfileSportMode(event.target.value === "both" ? "both" : "profile")}
          className="bg-transparent text-foreground outline-none"
        >
          <option value="profile">Esporte do cadastro</option>
          <option value="both">Futebol e Basquete</option>
        </select>
      </label>
    </div>
  );
};

export default SportSwitcher;
