import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSport } from "@/contexts/SportContext";
import { SportProfile, useAuth } from "@/contexts/AuthContext";
import LeagueSelector from "./LeagueSelector";
import BrandLogo from "./BrandLogo";
import ThemeToggle from "./ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Camera,
  LayoutDashboard,
  Users,
  Trophy,
  CalendarDays,
  Newspaper,
  Star,
  Sparkles,
  LogOut,
  LogIn,
  Lock,
  Save,
  Settings2,
  Upload,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/equipes", label: "Classificacao", icon: Trophy },
  { to: "/atletas", label: "Atletas/Equipes", icon: Users },
  { to: "/partidas", label: "Partidas", icon: CalendarDays },
  { to: "/noticias", label: "Notícias", icon: Newspaper },
  { to: "/favoritos", label: "Favoritos", icon: Star },
  { to: "/agregador", label: "Agregador", icon: Sparkles },
];

type ProfileSportChoice = "football" | "basketball" | "both";

const sportProfileToChoice = (sportProfile?: string | null): ProfileSportChoice =>
  sportProfile === "basquete" ? "basketball" : "football";

const choiceToSportProfile = (choice: ProfileSportChoice, fallback: SportProfile): SportProfile => {
  if (choice === "basketball") return "basquete";
  if (choice === "football") return "futebol";
  return fallback;
};

const AppSidebar = () => {
  const { sportClass, sport, sportLabel, profileSportMode, setProfileSportMode, setSport } = useSport();
  const { profile, user, logout, isAuthenticated, updateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const displayName =
    profile?.nome ||
    (user?.user_metadata?.nome as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Usuário";
  const displayAvatar = profile?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined) || "";
  const displayBio = profile?.bio || (user?.user_metadata?.bio as string | undefined) || "";
  const displayProfile = profileSportMode === "both" ? "Futebol e Basquete" : sportLabel;
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState(displayName);
  const [profileAvatar, setProfileAvatar] = useState(displayAvatar);
  const [profileBio, setProfileBio] = useState(displayBio);
  const [profileSportChoice, setProfileSportChoice] = useState<ProfileSportChoice>(
    profileSportMode === "both"
      ? "both"
      : sportProfileToChoice(profile?.sport_profile || (user?.user_metadata?.sport_profile as string | undefined))
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileInitial = useMemo(() => displayName.charAt(0).toUpperCase(), [displayName]);

  useEffect(() => {
    if (!profileOpen) return;
    setProfileName(displayName);
    setProfileAvatar(displayAvatar);
    setProfileBio(displayBio);
    setProfileSportChoice(
      profileSportMode === "both"
        ? "both"
        : sportProfileToChoice(profile?.sport_profile || (user?.user_metadata?.sport_profile as string | undefined))
    );
    setProfileError(null);
  }, [displayAvatar, displayBio, displayName, profile?.sport_profile, profileOpen, profileSportMode, user?.user_metadata?.sport_profile]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleProfileImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setProfileAvatar(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileName.trim()) {
      setProfileError("Informe um nome para o perfil.");
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    const fallbackSport = (profile?.sport_profile || (sport === "basketball" ? "basquete" : "futebol")) as SportProfile;
    const nextSportProfile = choiceToSportProfile(profileSportChoice, fallbackSport);
    const { error } = await updateProfile({
      nome: profileName,
      sportProfile: nextSportProfile,
      avatarUrl: profileAvatar,
      bio: profileBio,
    });
    setProfileSaving(false);

    if (error) {
      setProfileError(error);
      return;
    }

    if (profileSportChoice === "both") {
      setProfileSportMode("both");
    } else {
      setProfileSportMode("profile");
      setSport(profileSportChoice);
    }
    setProfileOpen(false);
  };

  return (
    <aside className={`${sportClass} flex h-screen w-64 flex-col border-r border-white/10 bg-sidebar text-sidebar-foreground`}>
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <BrandLogo className="h-10 w-10 rounded-xl" />
        <span className="font-display text-xl font-bold tracking-tight text-white">
          Sportando
        </span>
      </div>

      <div className="space-y-2 px-4 py-4">
        {/* RF03: Sport is locked unless the profile is configured for both sports. */}
        <div className="flex items-center justify-between rounded-lg bg-white/[0.08] px-3 py-2">
          <span className="text-xs font-medium text-white/60">Esporte</span>
          {profileSportMode === "both" ? (
            <div className="flex rounded-md bg-black/20 p-0.5">
              {[
                { key: "football" as const, label: "Futebol" },
                { key: "basketball" as const, label: "Basquete" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSport(option.key)}
                  className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
                    sport === option.key
                      ? "bg-sport text-sport-foreground"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="flex items-center gap-1.5 rounded-md bg-sport px-2 py-1 text-xs font-semibold text-sport-foreground">
              <Lock className="h-3 w-3" />
              {sportLabel}
            </span>
          )}
        </div>
        <LeagueSelector />
        <ThemeToggle className="w-full !border-white/10 !bg-white/[0.08] !text-white hover:!bg-white/[0.12]" />
      </div>

      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sport text-sport-foreground"
                  : "text-white/[0.68] hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        {isAuthenticated ? (
          <div className="space-y-3">
            <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-white/10 bg-sport">
                  <AvatarImage src={displayAvatar} alt={displayName} className="object-cover" />
                  <AvatarFallback className="bg-sport text-xs font-bold text-sport-foreground">
                    {profileInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{displayName}</p>
                  <p className="truncate text-xs text-white/[0.55]">
                    Perfil: {displayProfile}
                  </p>
                </div>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    title="Configurar perfil"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/50 text-sidebar transition-colors hover:bg-sport hover:text-sport-foreground"
                  >
                    <Settings2 className="h-3 w-3" />
                  </button>
                </DialogTrigger>
              </div>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Configurar perfil</DialogTitle>
                  <DialogDescription>Atualize como seu perfil aparece no Sportando.</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleProfileSave} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border border-border bg-sport">
                      <AvatarImage src={profileAvatar} alt={profileName} className="object-cover" />
                      <AvatarFallback className="bg-sport text-lg font-bold text-sport-foreground">
                        {(profileName || displayName).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
                        <Upload className="h-3.5 w-3.5" />
                        Escolher imagem
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => handleProfileImage(event.currentTarget.files?.[0])}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setProfileAvatar("")}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Remover foto
                      </button>
                    </div>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-foreground">Nome do perfil</span>
                    <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-foreground">URL da foto</span>
                    <Input
                      value={profileAvatar}
                      onChange={(event) => setProfileAvatar(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-foreground">Bio curta</span>
                    <Input
                      value={profileBio}
                      onChange={(event) => setProfileBio(event.target.value)}
                      placeholder="Ex: Analista, torcedor, estudante..."
                    />
                  </label>

                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-foreground">Esportes do perfil</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "football" as const, label: "Futebol" },
                        { value: "basketball" as const, label: "Basquete" },
                        { value: "both" as const, label: "Ambos" },
                      ].map((option) => {
                        const active = profileSportChoice === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setProfileSportChoice(option.value)}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                              active
                                ? "border-sport bg-sport text-sport-foreground"
                                : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {profileError && <p className="text-xs text-destructive">{profileError}</p>}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="flex items-center gap-2 rounded-lg bg-sport px-3 py-2 text-xs font-bold text-sport-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {profileSaving ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/[0.68] transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        ) : (
          <NavLink
            to="/login"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/[0.68] transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogIn className="h-4 w-4" />
            Entrar
          </NavLink>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
