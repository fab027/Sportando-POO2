import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAGUES } from "@/data/leagues";
import { resolveSportsDashboard } from "@/services/aggregatorService";
import { sofaScoreService } from "@/services/sofaScoreService";

describe("resolveSportsDashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers trusted annual player totals for Neymar 2026", async () => {
    const league = LEAGUES.find((item) => item.id === "brasileirao-a")!;
    const dashboard = await resolveSportsDashboard(
      "Quantos Gols o neymar fez em 2026? https://www.ogol.com.br/jogador/neymar/54814",
      league
    );

    expect(dashboard?.titulo).toContain("Neymar");
    expect(dashboard?.titulo).not.toContain("ogol");
    expect(dashboard?.datasets).toEqual([
      { nome: "Jogos", dados: [14] },
      { nome: "Gols", dados: [6] },
    ]);
    expect(dashboard?.insights.join(" ")).toContain("6 gols em 14 jogos");
  });

  it("answers a specific player stat instead of falling back to league rankings", async () => {
    vi.spyOn(sofaScoreService, "searchPlayer").mockImplementation(async (query) =>
      query === "alan patrick"
        ? [{ id: 1, name: "Alan Patrick", url: "https://www.sofascore.com/player/alan-patrick/1", description: "" }]
        : []
    );
    vi.spyOn(sofaScoreService, "getPlayerStats").mockResolvedValue({
      name: "Alan Patrick",
      team: "Internacional",
      position: "Meio-campista",
      nationality: "Brasil",
      age: 35,
      height: "",
      foot: "",
      shirtNumber: 10,
      seasons: [
        {
          season: "2026",
          tournament: "Brasileirao Betano",
          team: "Internacional",
          matchesPlayed: 12,
          minutes: 900,
          goals: 3,
          assists: 2,
          rating: 7.1,
        },
      ],
    });
    const league = LEAGUES.find((item) => item.id === "brasileirao-a")!;
    const dashboard = await resolveSportsDashboard("Quantos gols o Alan Patrick do Internacional tem em 2026?", league);

    expect(dashboard?.titulo).toBe("Gols de Alan Patrick em 2026");
    expect(dashboard?.titulo).not.toContain("Artilheiros");
    expect(dashboard?.datasets).toEqual([{ nome: "Gols", dados: [3] }]);
  });
});
