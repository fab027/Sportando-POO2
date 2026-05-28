import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveMatches } from "@/hooks/useSofaScoreData";
import { sofaScoreService } from "@/services/sofaScoreService";
import type { SofaLiveMatch } from "@/services/sofaScoreService";

const liveMatch = (minute: string): SofaLiveMatch => ({
  id: 1,
  homeTeam: "Time A",
  awayTeam: "Time B",
  homeScore: 0,
  awayScore: 0,
  status: "Live",
  minute,
  period: "2T",
  tournament: "Liga Teste",
  country: "Brasil",
});

describe("useLiveMatches", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T23:02:37-03:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("recarrega automaticamente depois do intervalo configurado", async () => {
    const getLiveMatches = vi
      .spyOn(sofaScoreService, "getLiveMatches")
      .mockResolvedValueOnce([liveMatch("70'")])
      .mockResolvedValueOnce([liveMatch("71'")]);

    const { result, unmount } = renderHook(() => useLiveMatches(30_000));

    await act(async () => {
      await Promise.resolve();
    });

    expect(getLiveMatches).toHaveBeenCalledTimes(1);
    expect(result.current.data[0].minute).toBe("70'");
    const firstRefresh = result.current.lastUpdatedAt;

    vi.setSystemTime(new Date("2026-05-27T23:03:07-03:00"));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getLiveMatches).toHaveBeenCalledTimes(2);
    expect(result.current.data[0].minute).toBe("71'");
    expect(result.current.lastUpdatedAt).not.toBe(firstRefresh);

    unmount();
  });
});
