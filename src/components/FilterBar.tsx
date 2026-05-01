import React from "react";
import { Filter, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FilterDef = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};

interface FilterBarProps {
  filters: FilterDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear?: () => void;
}

const FilterBar: React.FC<FilterBarProps> = ({ filters, values, onChange, onClear }) => {
  const hasActive = Object.values(values).some((v) => v && v !== "all");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Filter className="h-3.5 w-3.5" /> Filtros:
      </div>
      {filters.map((f) => (
        <Select
          key={f.key}
          value={values[f.key] ?? "all"}
          onValueChange={(v) => onChange(f.key, v)}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{f.label}: Todos</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {hasActive && onClear && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" /> Limpar
        </button>
      )}
    </div>
  );
};

export default FilterBar;
