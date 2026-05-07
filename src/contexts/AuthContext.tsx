import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SportProfile = "futebol" | "basquete";

export interface Profile {
  id: string;
  user_id: string;
  nome: string;
  sport_profile: SportProfile;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<{ error: string | null }>;
  register: (
    nome: string,
    email: string,
    senha: string,
    sportProfile: SportProfile
  ) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = (authUser: User) => {
    // Fire-and-forget; never await inside auth listener
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", authUser.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data) {
          setProfile(data as Profile);
          return;
        }

        const fallbackProfile = {
          user_id: authUser.id,
          nome:
            (authUser.user_metadata?.nome as string | undefined) ||
            (authUser.user_metadata?.name as string | undefined) ||
            authUser.email?.split("@")[0] ||
            "Usuário",
          sport_profile: ((authUser.user_metadata?.sport_profile as SportProfile | undefined) || "futebol") as SportProfile,
        };

        const { data: created } = await supabase
          .from("profiles")
          .upsert(fallbackProfile, { onConflict: "user_id" })
          .select("*")
          .maybeSingle();

        if (created) setProfile(created as Profile);
      });
  };

  useEffect(() => {
    // 1) Subscribe FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => fetchProfile(newSession.user), 0);
      } else {
        setProfile(null);
      }
    });

    // 2) THEN check existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) fetchProfile(existing.user);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return { error: error?.message ?? null };
  };

  const register = async (
    nome: string,
    email: string,
    senha: string,
    sportProfile: SportProfile
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome, sport_profile: sportProfile },
      },
    });
    return { error: error?.message ?? null };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!session,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
