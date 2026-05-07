import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down";
  trendValue?: string;
}

const StatCard = ({ title, value, subtitle, icon: Icon, trend, trendValue }: StatCardProps) => {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          {trend && trendValue && (
            <p className={`mt-1 text-xs font-medium ${trend === "up" ? "text-football" : "text-destructive"}`}>
              {trend === "up" ? "↑" : "↓"} {trendValue}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sport-light">
          <Icon className="h-5 w-5 text-sport" />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
