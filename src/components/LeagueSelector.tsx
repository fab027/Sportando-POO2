import { useSport } from "@/contexts/SportContext";
import { getLeaguesByCategory, CATEGORY_LABELS, League } from "@/data/leagues";
import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const LeagueSelector = () => {
  const { sport, league, setLeague } = useSport();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const grouped = getLeaguesByCategory(sport);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
      >
        <span className="flex items-center gap-2 truncate">
          <span>{league.flag}</span>
          <span className="truncate">{league.name}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {Object.entries(grouped).map(([cat, leagues]) => (
            <div key={cat}>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary/30">
                {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] || cat}
              </p>
              {leagues.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setLeague(l); setOpen(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    league.id === l.id
                      ? "bg-sport-light text-sport font-medium"
                      : "text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <span>{l.flag}</span>
                  <span>{l.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{l.country}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeagueSelector;
