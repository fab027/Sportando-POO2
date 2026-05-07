import { useSport, Sport } from "@/contexts/SportContext";

const SportSwitcher = () => {
  const { sport, setSport } = useSport();

  return (
    <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
      <button
        onClick={() => setSport("football")}
        className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
          sport === "football"
            ? "bg-football text-football-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        ⚽ Futebol
      </button>
      <button
        onClick={() => setSport("basketball")}
        className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
          sport === "basketball"
            ? "bg-basketball text-basketball-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        🏀 Basquete
      </button>
    </div>
  );
};

export default SportSwitcher;
