import { afterEach, describe, expect, it, vi } from "vitest";
import { LEAGUES } from "@/data/leagues";
import { resolveSportsDashboard, resolveSportsLocalResponse } from "@/services/aggregatorService";
import { freeSportsDataService } from "@/services/freeSportsDataService";
import { ogolService } from "@/services/ogolService";
import { sofaScoreService } from "@/services/sofaScoreService";

describe("resolveSportsDashboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers a player season stat from an external source summary", async () => {
    const searchPlayerSpy = vi.spyOn(sofaScoreService, "searchPlayer");
    vi.spyOn(ogolService, "getPlayerSeasonSummary").mockResolvedValue({
      playerName: "Atacante Fonte",
      season: "2025/26",
      scope: "Clube Fonte, Selecao Fonte",
      sourceUrl: "https://www.ogol.com.br/jogador/atacante-fonte/1",
      rows: [
        { competition: "Liga Fonte", matchesPlayed: 30, minutes: 2100, goals: 12, assists: 3 },
        { competition: "Copa Fonte", matchesPlayed: 4, minutes: 260, goals: 1, assists: 1 },
        { competition: "Eliminatorias Fonte", matchesPlayed: 6, minutes: 540, goals: 4, assists: 1 },
      ],
      total: { competition: "Total", matchesPlayed: 40, minutes: 2900, goals: 17, assists: 5 },
    });

    const league = LEAGUES.find((item) => item.id === "brasileirao-a")!;
    const dashboard = await resolveSportsDashboard("Quantos gols o Atacante Fonte tem na temporada 25/26 ate o momento?", league);

    expect(dashboard?.titulo).toBe("Gols de Atacante Fonte - temporada 2025/26");
    expect(dashboard?.labels).toEqual(["Liga Fonte", "Copa Fonte", "Eliminatorias Fonte"]);
    expect(dashboard?.datasets).toEqual([{ nome: "Gols", dados: [12, 1, 4] }]);
    expect(dashboard?.insights.join(" ")).toContain("17 gols");
    expect(searchPlayerSpy).not.toHaveBeenCalled();
  });

  it("does not replace unresolved player stat questions with a league scorer ranking", async () => {
    vi.spyOn(ogolService, "getPlayerSeasonSummary").mockResolvedValue(null);
    vi.spyOn(sofaScoreService, "searchPlayer").mockResolvedValue([]);

    const league = LEAGUES.find((item) => item.id === "brasileirao-a")!;
    const dashboard = await resolveSportsDashboard(
      "Quantos gols o Atacante Inexistente tem na temporada 25/26 ate o momento?",
      league
    );

    expect(dashboard).toBeNull();
  });

  it("does not treat player comparisons as selected-league rankings", async () => {
    const league = LEAGUES.find((item) => item.id === "brasileirao-a")!;
    const dashboard = await resolveSportsDashboard("Quem tem mais gols, Jogador A ou Jogador B?", league);

    expect(dashboard).toBeNull();
  });

  it("answers simple player profile questions as text instead of dashboard JSON", async () => {
    vi.spyOn(freeSportsDataService, "searchPlayer").mockResolvedValue({
      idPlayer: "1",
      strPlayer: "Neymar",
      strTeam: "Santos",
      strNationality: "Brazil",
      dateBorn: "1992-02-05",
      strPosition: "Left Wing",
    });

    const league = LEAGUES.find((item) => item.id === "brasileirao-a")!;
    const response = await resolveSportsLocalResponse("Qual a idade do Neymar?", league);

    expect(response?.format).toBe("text");
    expect(response?.content).toContain("Neymar");
    expect(response?.content).toContain("Fonte: TheSportsDB API v1");
    expect(response?.content).not.toContain('"titulo"');
  });

  it("falls back to profile data when the external source is unavailable", async () => {
    vi.spyOn(ogolService, "getPlayerSeasonSummary").mockResolvedValue(null);
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

    expect(dashboard?.titulo).toBe("Gols de Jogador Teste nas temporadas que incluem 2026");
    expect(dashboard?.datasets).toEqual([{ nome: "Gols", dados: [7] }]);
    expect(dashboard?.insights.join(" ")).toContain("7 gols");
  });
});
