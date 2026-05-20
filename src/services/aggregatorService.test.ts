import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAGUES } from "@/data/leagues";
import { resolveSportsDashboard } from "@/services/aggregatorService";
import { sofaScoreService } from "@/services/sofaScoreService";

describe("resolveSportsDashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers a specific player yearly goal question from mocked profile data", async () => {
    vi.spyOn(sofaScoreService, "searchPlayer").mockResolvedValue([
      {
        id: 1,
        name: "Jogador Teste",
        url: "https://www.sofascore.com/player/jogador-teste/1",
        description: "",
      },
    ]);
    vi.spyOn(sofaScoreService, "getPlayerStats").mockResolvedValue({
      name: "Jogador Teste",
      team: "Clube Teste",
      position: "Atacante",
      nationality: "Brasil",
      age: 25,
      height: "",
      foot: "",
      shirtNumber: 9,
      seasons: [
        {
          season: "2026",
          tournament: "Campeonato Teste",
          team: "Clube Teste",
          matchesPlayed: 12,
          minutes: 900,
          goals: 7,
          assists: 2,
          rating: 7.1,
        },
      ],
    });

    const league = LEAGUES.find((item) => item.id === "brasileirao-a")!;
    const dashboard = await resolveSportsDashboard("Quantos gols o Jogador Teste tem em 2026?", league);

    expect(dashboard?.titulo).toBe("Gols de Jogador Teste em 2026");
    expect(dashboard?.datasets).toEqual([{ nome: "Gols", dados: [7] }]);
    expect(dashboard?.insights.join(" ")).toContain("7 gols");
  });

  it("answers a specific player stat instead of falling back to league rankings", async () => {
    vi.spyOn(sofaScoreService, "searchPlayer").mockResolvedValue([
      {
        id: 2,
        name: "Meia Teste",
        url: "https://www.sofascore.com/player/meia-teste/2",
        description: "",
      },
    ]);
    vi.spyOn(sofaScoreService, "getPlayerStats").mockResolvedValue({
      name: "Meia Teste",
      team: "Clube Teste",
      position: "Meio-campista",
      nationality: "Brasil",
      age: 28,
      height: "",
      foot: "",
      shirtNumber: 10,
      seasons: [
        {
          season: "2026",
          tournament: "Campeonato Teste",
          team: "Clube Teste",
          matchesPlayed: 12,
          minutes: 900,
          goals: 3,
          assists: 6,
          rating: 7.4,
        },
      ],
    });

    const league = LEAGUES.find((item) => item.id === "brasileirao-a")!;
    const dashboard = await resolveSportsDashboard("Quantas assistencias o Meia Teste tem em 2026?", league);

    expect(dashboard?.titulo).toBe("Assistencias de Meia Teste em 2026");
    expect(dashboard?.titulo).not.toContain("Lideres");
    expect(dashboard?.datasets).toEqual([{ nome: "Assistencias", dados: [6] }]);
  });
});
