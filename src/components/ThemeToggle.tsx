import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

type ThemeToggleProps = {
  className?: string;
  label?: boolean;
};

const ThemeToggle = ({ className = "", label = true }: ThemeToggleProps) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary ${className}`}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      <Icon className="h-4 w-4" />
      {label && <span>{isDark ? "Modo claro" : "Modo escuro"}</span>}
    </button>
  );
};

export default ThemeToggle;
