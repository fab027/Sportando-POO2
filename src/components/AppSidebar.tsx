import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSport } from "@/contexts/SportContext";
import { useAuth } from "@/contexts/AuthContext";
import LeagueSelector from "./LeagueSelector";
import { LayoutDashboard, Users, Trophy, CalendarDays, BrainCircuit, Star, Sparkles, LogOut, LogIn, Lock } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/equipes", label: "Equipes", icon: Trophy },
  { to: "/atletas", label: "Atletas", icon: Users },
  { to: "/partidas", label: "Partidas", icon: CalendarDays },
  { to: "/previsoes", label: "Previsões ML", icon: BrainCircuit },
  { to: "/favoritos", label: "Favoritos", icon: Star },
  { to: "/agregador", label: "Agregador", icon: Sparkles },
];

const AppSidebar = () => {
  const { sportClass, sport, sportLabel } = useSport();
  const { profile, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside className={`${sportClass} flex h-screen w-64 flex-col border-r border-border bg-card`}>
      <div className="flex items-center gap-2 border-b border-border px-5 py-5"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sport text-sport-foreground font-display font-bold text-sm">S</div><span className="font-display text-xl font-bold tracking-tight text-foreground">Sportando</span></div>
      <div className="space-y-2 px-4 py-4">
        <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Esporte</span>
          <span className="flex items-center gap-1.5 rounded-md bg-sport px-2 py-1 text-xs font-semibold text-sport-foreground"><Lock className="h-3 w-3" />{sport === "football" ? "⚽" : "🏀"} {sportLabel}</span>
        </div>
        <LeagueSelector />
      </div>
      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return <NavLink key={item.to} to={item.to} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-sport-light text-sport" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><item.icon className="h-4 w-4" />{item.label}</NavLink>;
        })}
      </nav>
      <div className="border-t border-border p-4">
        {isAuthenticated && profile ? (
          <div className="space-y-3"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-sport text-sport-foreground text-xs font-bold">{profile.nome.charAt(0).toUpperCase()}</div><div className="flex-1 min-w-0"><p className="truncate text-sm font-medium text-foreground">{profile.nome}</p><p className="truncate text-xs text-muted-foreground capitalize">Perfil: {profile.sport_profile}</p></div></div><button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"><LogOut className="h-4 w-4" />Sair</button></div>
        ) : (
          <NavLink to="/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"><LogIn className="h-4 w-4" />Entrar</NavLink>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
