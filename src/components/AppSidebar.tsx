import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSport } from "@/contexts/SportContext";
import { useAuth } from "@/contexts/AuthContext";
import LeagueSelector from "./LeagueSelector";
import BrandLogo from "./BrandLogo";
import ThemeToggle from "./ThemeToggle";
import {
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
} from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/equipes", label: "Equipes", icon: Trophy },
  { to: "/atletas", label: "Atletas", icon: Users },
  { to: "/partidas", label: "Partidas", icon: CalendarDays },
  { to: "/previsoes", label: "Notícias", icon: Newspaper },
  { to: "/favoritos", label: "Favoritos", icon: Star },
  { to: "/agregador", label: "Agregador", icon: Sparkles },
];

const AppSidebar = () => {
  const { sportClass, sport, sportLabel } = useSport();
  const { profile, user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const displayName =
    profile?.nome ||
    (user?.user_metadata?.nome as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Usuário";
  const displayProfile = profile?.sport_profile || (user?.user_metadata?.sport_profile as string | undefined) || sportLabel;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
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
        {/* RF03: Sport locked by profile, shown as info badge */}
        <div className="flex items-center justify-between rounded-lg bg-white/[0.08] px-3 py-2">
          <span className="text-xs font-medium text-white/60">Esporte</span>
          <span className="flex items-center gap-1.5 rounded-md bg-sport px-2 py-1 text-xs font-semibold text-sport-foreground">
            <Lock className="h-3 w-3" />
            {sport === "football" ? "⚽" : "🏀"} {sportLabel}
          </span>
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
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sport text-sport-foreground text-xs font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">{displayName}</p>
                <p className="truncate text-xs text-white/[0.55] capitalize">
                  Perfil: {displayProfile}
                </p>
              </div>
            </div>
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
