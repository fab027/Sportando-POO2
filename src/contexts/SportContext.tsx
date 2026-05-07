import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { League, getDefaultLeague, LEAGUES } from "@/data/leagues";
import { useAuth } from "@/contexts/AuthContext";

export type Sport = "football" | "basketball";

interface SportContextType {
  sport: Sport;
  setSport: (sport: Sport) => void;
  sportLabel: string;
  sportClass: string;
  league: League;
  setLeague: (league: League) => void;
  /** True when the sport is locked by the user's profile (RF03). */
  isLocked: boolean;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

const profileToSport = (p?: string | null): Sport =>
  p === "basquete" ? "basketball" : "football";

export const SportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const profileSport = profileToSport(profile?.sport_profile);

  const [sport, setSportState] = useState<Sport>(profileSport);
  const [league, setLeagueState] = useState<League>(getDefaultLeague(profileSport));

  // Lock to profile sport whenever the profile loads/changes
  useEffect(() => {
    if (!profile) return;
    const s = profileToSport(profile.sport_profile);
    setSportState(s);
    setLeagueState((cur) => (cur.sport === s ? cur : getDefaultLeague(s)));
  }, [profile]);

  const isLocked = !!profile;

  const setSport = useCallback(
    (s: Sport) => {
      if (isLocked) return; // RF03: locked by profile
      setSportState(s);
      setLeagueState(getDefaultLeague(s));
    },
    [isLocked]
  );

  const setLeague = useCallback(
    (l: League) => {
      // Only allow leagues of the active sport
      if (l.sport !== sport) return;
      setLeagueState(l);
    },
    [sport]
  );

  const sportLabel = sport === "football" ? "Futebol" : "Basquete";
  const sportClass = sport === "football" ? "sport-football" : "sport-basketball";

  const value = useMemo(
    () => ({ sport, setSport, sportLabel, sportClass, league, setLeague, isLocked }),
    [sport, setSport, sportLabel, sportClass, league, setLeague, isLocked]
  );

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
};

export const useSport = () => {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error("useSport must be used within SportProvider");
  return ctx;
};

export { LEAGUES };
