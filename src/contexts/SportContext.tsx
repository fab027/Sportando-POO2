import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import { League, getDefaultLeague, LEAGUES } from "@/data/leagues";

export type Sport = "football";

interface SportContextType {
  sport: Sport;
  setSport: (sport: Sport) => void;
  sportLabel: string;
  sportClass: string;
  league: League;
  setLeague: (league: League) => void;
  isLocked: boolean;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

export const SportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [league, setLeagueState] = useState<League>(getDefaultLeague("football"));

  const setSport = useCallback((_sport: Sport) => {
    setLeagueState((current) => (current.sport === "football" ? current : getDefaultLeague("football")));
  }, []);

  const setLeague = useCallback((nextLeague: League) => {
    if (nextLeague.sport !== "football") return;
    setLeagueState(nextLeague);
  }, []);

  const value = useMemo(
    () => ({
      sport: "football" as const,
      setSport,
      sportLabel: "Futebol",
      sportClass: "sport-football",
      league,
      setLeague,
      isLocked: true,
    }),
    [league, setLeague, setSport]
  );

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
};

export const useSport = () => {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error("useSport must be used within SportProvider");
  return ctx;
};

export { LEAGUES };
