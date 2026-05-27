import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type SportProfile = "futebol" | "basquete";

export interface Profile {
  id: string;
  user_id: string;
  nome: string;
  sport_profile: SportProfile;
  avatar_url?: string | null;
  bio?: string | null;
}

type ProfileUpdateInput = {
  nome?: string;
  sportProfile?: SportProfile;
  avatarUrl?: string | null;
  bio?: string | null;
};

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
  updateProfile: (input: ProfileUpdateInput) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_AUTH_USERS_KEY = "sportando.localAuth.users";
const LOCAL_AUTH_SESSION_KEY = "sportando.localAuth.session";
const AUTH_REQUEST_TIMEOUT_MS = 4000;

type LocalAuthUser = {
  id: string;
  email: string;
  senha: string;
  nome: string;
  sport_profile: SportProfile;
  avatar_url?: string | null;
  bio?: string | null;
};

const isFetchError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|fetch failed|networkerror|load failed|request timed out/i.test(message);
};

const withAuthTimeout = async <T,>(request: Promise<T>): Promise<T> =>
  Promise.race([
    request,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("Auth request timed out")), AUTH_REQUEST_TIMEOUT_MS);
    }),
  ]);

const readLocalUsers = (): LocalAuthUser[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_AUTH_USERS_KEY) ?? "[]") as LocalAuthUser[];
  } catch {
    return [];
  }
};

const writeLocalUsers = (users: LocalAuthUser[]) => {
  localStorage.setItem(LOCAL_AUTH_USERS_KEY, JSON.stringify(users));
};

const toLocalUser = (account: LocalAuthUser): User =>
  ({
    id: account.id,
    aud: "authenticated",
    role: "authenticated",
    email: account.email,
    app_metadata: { provider: "local" },
    user_metadata: {
      nome: account.nome,
      sport_profile: account.sport_profile,
      avatar_url: account.avatar_url || null,
      bio: account.bio || null,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }) as User;

const toLocalSession = (account: LocalAuthUser): Session =>
  ({
    access_token: `local-${account.id}`,
    refresh_token: `local-refresh-${account.id}`,
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 30,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    user: toLocalUser(account),
  }) as Session;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const applyLocalSession = (account: LocalAuthUser) => {
    const localSession = toLocalSession(account);
    setSession(localSession);
    setUser(localSession.user);
    setProfile({
      id: account.id,
      user_id: account.id,
      nome: account.nome,
      sport_profile: account.sport_profile,
      avatar_url: account.avatar_url || null,
      bio: account.bio || null,
    });
    localStorage.setItem(LOCAL_AUTH_SESSION_KEY, account.id);
  };

  const restoreLocalSession = () => {
    const sessionUserId = localStorage.getItem(LOCAL_AUTH_SESSION_KEY);
    if (!sessionUserId) return false;

    const account = readLocalUsers().find((item) => item.id === sessionUserId);
    if (!account) {
      localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
      return false;
    }

    applyLocalSession(account);
    return true;
  };

  const fetchProfile = (authUser: User) => {
    // Fire-and-forget; never await inside auth listener
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", authUser.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data) {
          setProfile({
            ...(data as Profile),
            avatar_url: (authUser.user_metadata?.avatar_url as string | undefined) || null,
            bio: (authUser.user_metadata?.bio as string | undefined) || null,
          });
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
    supabase.auth
      .getSession()
      .then(({ data: { session: existing } }) => {
        if (existing) {
          setSession(existing);
          setUser(existing.user);
          fetchProfile(existing.user);
        } else {
          restoreLocalSession();
        }
      })
      .catch((error) => {
        if (!isFetchError(error)) console.error("[auth] session restore error", error);
        restoreLocalSession();
      })
      .finally(() => setLoading(false));

    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (email: string, senha: string) => {
    try {
      const { error } = await withAuthTimeout(
        supabase.auth.signInWithPassword({ email, password: senha })
      );
      if (!error) return { error: null };
      if (!isFetchError(error)) return { error: error.message };
    } catch (error) {
      if (!isFetchError(error)) {
        return { error: error instanceof Error ? error.message : "Erro ao entrar." };
      }
    }

    const account = readLocalUsers().find(
      (item) => item.email.toLowerCase() === email.toLowerCase() && item.senha === senha
    );
    if (!account) return { error: "Conta local não encontrada ou senha inválida." };

    applyLocalSession(account);
    return { error: null };
  };

  const register = async (
    nome: string,
    email: string,
    senha: string,
    sportProfile: SportProfile
  ) => {
    try {
      const { error } = await withAuthTimeout(
        supabase.auth.signUp({
          email,
          password: senha,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { nome, sport_profile: sportProfile },
          },
        })
      );
      if (!error) return { error: null };
      if (!isFetchError(error)) return { error: error.message };
    } catch (error) {
      if (!isFetchError(error)) {
        return { error: error instanceof Error ? error.message : "Erro ao cadastrar." };
      }
    }

    const users = readLocalUsers();
    if (users.some((item) => item.email.toLowerCase() === email.toLowerCase())) {
      return { error: "Este e-mail já está cadastrado localmente." };
    }

    const account: LocalAuthUser = {
      id: crypto.randomUUID(),
      email,
      senha,
      nome,
      sport_profile: sportProfile,
    };
    writeLocalUsers([...users, account]);
    applyLocalSession(account);
    return { error: null };
  };

  const updateProfile = async ({ nome, sportProfile, avatarUrl, bio }: ProfileUpdateInput) => {
    if (!user) return { error: "Usuario nao autenticado." };

    const nextNome = (nome ?? profile?.nome ?? user.user_metadata?.nome ?? user.email?.split("@")[0] ?? "Usuario").trim();
    const nextSportProfile = sportProfile ?? profile?.sport_profile ?? "futebol";
    const nextAvatarUrl = avatarUrl?.trim() || null;
    const nextBio = bio?.trim() || null;

    if (user.app_metadata?.provider === "local") {
      const users = readLocalUsers();
      const existing = users.find((item) => item.id === user.id);
      if (!existing) return { error: "Conta local nao encontrada." };

      const updated: LocalAuthUser = {
        ...existing,
        nome: nextNome,
        sport_profile: nextSportProfile,
        avatar_url: nextAvatarUrl,
        bio: nextBio,
      };
      writeLocalUsers(users.map((item) => (item.id === user.id ? updated : item)));
      applyLocalSession(updated);
      return { error: null };
    }

    try {
      const metadata = {
        ...user.user_metadata,
        nome: nextNome,
        sport_profile: nextSportProfile,
        avatar_url: nextAvatarUrl,
        bio: nextBio,
      };
      const { data: authData, error: authError } = await supabase.auth.updateUser({ data: metadata });
      if (authError) return { error: authError.message };

      const { data, error } = await supabase
        .from("profiles")
        .update({ nome: nextNome, sport_profile: nextSportProfile })
        .eq("user_id", user.id)
        .select("*")
        .maybeSingle();

      if (error) return { error: error.message };

      if (authData.user) setUser(authData.user);
      setProfile({
        ...((data as Profile | null) || profile || {
          id: user.id,
          user_id: user.id,
          nome: nextNome,
          sport_profile: nextSportProfile,
        }),
        nome: nextNome,
        sport_profile: nextSportProfile,
        avatar_url: nextAvatarUrl,
        bio: nextBio,
      });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Erro ao atualizar perfil." };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      if (!isFetchError(error)) console.error("[auth] logout error", error);
    }
    localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
    setSession(null);
    setUser(null);
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
        updateProfile,
        logout,
        isAuthenticated: !!session || !!user,
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
