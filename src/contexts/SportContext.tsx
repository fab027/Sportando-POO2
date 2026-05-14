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
  profileSportMode: "profile" | "both";
  setProfileSportMode: (mode: "profile" | "both") => void;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

const profileToSport = (p?: string | null): Sport =>
  p === "basquete" ? "basketball" : "football";

const PROFILE_SPORT_MODE_KEY = "sportando.profileSportMode";

export const SportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();
  const profileSport = profileToSport(profile?.sport_profile);

  const [sport, setSportState] = useState<Sport>(profileSport);
  const [league, setLeagueState] = useState<League>(getDefaultLeague(profileSport));
  const [profileSportMode, setProfileSportModeState] = useState<"profile" | "both">(() => {
    if (typeof window === "undefined") return "profile";
    return localStorage.getItem(PROFILE_SPORT_MODE_KEY) === "both" ? "both" : "profile";
  });

  // Lock to profile sport whenever the profile loads/changes
  useEffect(() => {
    if (!profile || profileSportMode === "both") return;
    const s = profileToSport(profile.sport_profile);
    setSportState(s);
    setLeagueState((cur) => (cur.sport === s ? cur : getDefaultLeague(s)));
  }, [profile, profileSportMode]);

  const isLocked = !!profile && profileSportMode === "profile";

  const setProfileSportMode = useCallback((mode: "profile" | "both") => {
    setProfileSportModeState(mode);
    localStorage.setItem(PROFILE_SPORT_MODE_KEY, mode);
  }, []);

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
    () => ({ sport, setSport, sportLabel, sportClass, league, setLeague, isLocked, profileSportMode, setProfileSportMode }),
    [sport, setSport, sportLabel, sportClass, league, setLeague, isLocked, profileSportMode, setProfileSportMode]
  );

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
};

export const useSport = () => {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error("useSport must be used within SportProvider");
  return ctx;
};

export { LEAGUES };
