import { useState, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export interface DashboardData {
  titulo: string;
  descricao: string;
  tipo: "tabela" | "barras" | "linhas" | "pizza";
  labels: string[];
  datasets: { nome: string; dados: number[] }[];
  insights: string[];
}

const CHART_COLORS = [
  "hsl(160, 60%, 40%)", "hsl(30, 90%, 52%)", "hsl(220, 70%, 55%)",
  "hsl(340, 70%, 55%)", "hsl(50, 80%, 50%)", "hsl(280, 60%, 55%)",
];

interface DynamicDashboardProps {
  data: DashboardData;
}

const DynamicDashboard = ({ data }: DynamicDashboardProps) => {
  const chartData = data.labels.map((label, i) => {
    const point: any = { name: label };
    data.datasets.forEach(ds => {
      point[ds.nome] = ds.dados[i] ?? 0;
    });
    return point;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h3 className="font-display text-lg font-bold text-foreground">{data.titulo}</h3>
        <p className="text-sm text-muted-foreground">{data.descricao}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        {data.tipo === "tabela" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
                  {data.datasets.map(ds => (
                    <th key={ds.nome} className="px-3 py-2 text-left font-medium text-muted-foreground">{ds.nome}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.labels.map((label, i) => (
                  <tr key={label} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-3 py-2 font-medium text-foreground">{label}</td>
                    {data.datasets.map(ds => (
                      <td key={ds.nome} className="px-3 py-2 text-muted-foreground">{ds.dados[i]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.tipo === "barras" && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
              <XAxis dataKey="name" fontSize={12} stroke="hsl(220, 10%, 46%)" />
              <YAxis fontSize={12} stroke="hsl(220, 10%, 46%)" />
              <Tooltip contentStyle={{ background: "hsl(0, 0%, 100%)", border: "1px solid hsl(220, 15%, 90%)", borderRadius: "8px", fontSize: "12px" }} />
              <Legend />
              {data.datasets.map((ds, i) => (
                <Bar key={ds.nome} dataKey={ds.nome} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}

        {data.tipo === "linhas" && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
              <XAxis dataKey="name" fontSize={12} stroke="hsl(220, 10%, 46%)" />
              <YAxis fontSize={12} stroke="hsl(220, 10%, 46%)" />
              <Tooltip contentStyle={{ background: "hsl(0, 0%, 100%)", border: "1px solid hsl(220, 15%, 90%)", borderRadius: "8px", fontSize: "12px" }} />
              <Legend />
              {data.datasets.map((ds, i) => (
                <Line key={ds.nome} type="monotone" dataKey={ds.nome} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}

        {data.tipo === "pizza" && (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={chartData} dataKey={data.datasets[0]?.nome || "value"} nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {data.insights.length > 0 && (
        <div className="rounded-xl border border-border bg-sport-light p-4">
          <h4 className="mb-2 text-sm font-semibold text-foreground">💡 Insights</h4>
          <ul className="space-y-1">
            {data.insights.map((insight, i) => (
              <li key={i} className="text-sm text-muted-foreground">• {insight}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DynamicDashboard;
