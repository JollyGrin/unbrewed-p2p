/**
 * The post-game earned poll (p2p #1399): its stop conditions, the one-shot
 * cosmetics + badges read after landing, and the hook's phases — casual and
 * guest games never poll, a landed poll yields the delta, a timed-out one
 * stays a calm waiting state.
 */
import { act, renderHook } from "@testing-library/react";
import type { AccountStats, StatsResult } from "@/lib/account/stats";
import type { Badge } from "@/lib/account/badges";
import type { CosmeticsResult } from "@/lib/account/cosmetics";
import { FALLBACK_CONSTANTS, emptyHeroCosmetics } from "@/lib/account/cosmetics";
import type { EarnedSnapshot } from "./earned";
import { EarnedPollDeps, GameEarnedInput, PollToken, pollUntilLanded, readAfterLanding, useGameEarned } from "./useGameEarned";

const stats = (over: Partial<AccountStats> = {}): AccountStats =>
  ({
    totalGames: 40,
    wins: 25,
    losses: 15,
    draws: 0,
    firstGameAt: null,
    lastGameAt: null,
    byHero: [],
    level: 7,
    xp: 3504,
    xpForNext: 3600,
    avgDurationSeconds: null,
    avgTurns: null,
    streaks: { current: 3, best: 6 },
    recentForm: null,
    byOpponentHero: null,
    byMap: null,
    byOpponentKind: null,
    firstPlayer: null,
    ...over,
  }) as AccountStats;

const ok = (value: AccountStats): StatsResult => ({ ok: true, value });
const down: StatsResult = { ok: false, reason: "unavailable" };

const badge = (id: string, unlocked: boolean): Badge => ({ id, name: id, blurb: "", unlocked, unlockedWhy: "" });

/** A scripted `/me/stats`: each call pops the next reply, the last one repeats. */
const scripted = (replies: StatsResult[]) => {
  const calls: number[] = [];
  const fetchStats = jest.fn(async () => {
    calls.push(Date.now());
    return replies.length > 1 ? (replies.shift() as StatsResult) : replies[0];
  });
  return { fetchStats, calls };
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});
afterEach(() => {
  jest.useRealTimers();
});

describe("pollUntilLanded", () => {
  const deps = { intervalMs: 5_000, maxAttempts: 4 };

  it("fetches at once, then every interval, and resolves with the stats that counted one more game", async () => {
    const { fetchStats, calls } = scripted([ok(stats()), ok(stats()), ok(stats({ totalGames: 41, xp: 3544 }))]);
    const token: PollToken = { cancelled: false };
    const landed = pollUntilLanded({ totalGames: 40 }, { ...deps, fetchStats }, token);
    await flush();
    expect(fetchStats).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchStats).toHaveBeenCalledTimes(2);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchStats).toHaveBeenCalledTimes(3);
    await expect(landed).resolves.toMatchObject({ totalGames: 41, xp: 3544 });
    expect(calls.map((at) => at - calls[0])).toEqual([0, 5_000, 10_000]);
  });

  it("gives up after maxAttempts with null, and no further fetch is scheduled", async () => {
    const { fetchStats } = scripted([ok(stats())]);
    const landed = pollUntilLanded({ totalGames: 40 }, { ...deps, fetchStats }, { cancelled: false });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    await expect(landed).resolves.toBeNull();
    expect(fetchStats).toHaveBeenCalledTimes(4);
  });

  it("a failed fetch counts as an attempt and the poll carries on", async () => {
    const { fetchStats } = scripted([down, down, ok(stats({ totalGames: 41 }))]);
    const landed = pollUntilLanded({ totalGames: 40 }, { ...deps, fetchStats }, { cancelled: false });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    await expect(landed).resolves.toMatchObject({ totalGames: 41 });
    expect(fetchStats).toHaveBeenCalledTimes(3);
  });

  it("a cancelled token stops the loop on its next wake with null", async () => {
    const { fetchStats } = scripted([ok(stats())]);
    const token: PollToken = { cancelled: false };
    const landed = pollUntilLanded({ totalGames: 40 }, { ...deps, fetchStats }, token);
    await flush();
    token.cancelled = true;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    await expect(landed).resolves.toBeNull();
    expect(fetchStats).toHaveBeenCalledTimes(1);
  });
});

describe("readAfterLanding", () => {
  const before: EarnedSnapshot = { stats: { totalGames: 40, level: 7, xp: 3504, xpForNext: 3600, streak: 3, streakBest: 6 }, heroId: "hollow-oak", heroPoints: 220, unlocked: ["first-win"] };
  const cosmeticsOk: CosmeticsResult = {
    ok: true,
    value: { heroes: [{ ...emptyHeroCosmetics("hollow-oak", true), earned: 260 }], constants: { cardTierCosts: [50], tokenRimThresholds: [300, 900] } },
  };

  it("reads cosmetics and badges once each, with the api's ladder", async () => {
    const fetchCosmetics = jest.fn(async () => cosmeticsOk);
    const reprobeBadges = jest.fn(async () => [badge("first-win", true), badge("streak-5", true)]);
    const after = await readAfterLanding(stats({ totalGames: 41, xp: 3544, streaks: { current: 4, best: 6 } }), before, { fetchCosmetics, reprobeBadges }, [250]);
    expect(after).toEqual({
      stats: { totalGames: 41, level: 7, xp: 3544, xpForNext: 3600, streak: 4, streakBest: 6 },
      heroPoints: 260,
      unlocked: ["first-win", "streak-5"],
      thresholds: [300, 900],
    });
    expect(fetchCosmetics).toHaveBeenCalledTimes(1);
    expect(reprobeBadges).toHaveBeenCalledTimes(1);
  });

  it("a hero the api left out of a good payload has 0 points; a degraded one is unknown; a failed badge probe diffs as nothing new", async () => {
    const empty: CosmeticsResult = { ok: true, value: { heroes: [], constants: FALLBACK_CONSTANTS } };
    const good = await readAfterLanding(stats({ totalGames: 41 }), before, { fetchCosmetics: async () => empty, reprobeBadges: async () => null }, [250]);
    expect(good.heroPoints).toBe(0);
    expect(good.unlocked).toEqual(["first-win"]);

    const degraded: CosmeticsResult = { ok: false, reason: "unavailable", degraded: null };
    const bad = await readAfterLanding(stats({ totalGames: 41 }), before, { fetchCosmetics: async () => degraded, reprobeBadges: async () => null }, [250]);
    expect(bad.heroPoints).toBeNull();
    expect(bad.thresholds).toEqual([250]);
  });
});

describe("useGameEarned", () => {
  const input = (over: Partial<GameEarnedInput> = {}): GameEarnedInput => ({
    roomId: "ROOM1",
    gameOver: true,
    signedIn: true,
    kind: { kind: "counted", forfeit: false },
    heroId: "hollow-oak",
    stats: stats(),
    cosmeticHeroes: [{ ...emptyHeroCosmetics("hollow-oak", true), earned: 220 }],
    cosmeticConstants: FALLBACK_CONSTANTS,
    badges: [badge("first-win", true), badge("streak-5", false)],
    ...over,
  });

  const deps = (fetchStats: EarnedPollDeps["fetchStats"], over: Partial<EarnedPollDeps> = {}): EarnedPollDeps => ({
    fetchStats,
    fetchCosmetics: async () => ({ ok: true, value: { heroes: [{ ...emptyHeroCosmetics("hollow-oak", true), earned: 260 }], constants: FALLBACK_CONSTANTS } }),
    reprobeBadges: async () => [badge("first-win", true), badge("streak-5", true)],
    intervalMs: 5_000,
    maxAttempts: 3,
    ...over,
  });

  it("snapshots at game end, waits, then lands with the delta", async () => {
    const { fetchStats } = scripted([ok(stats()), ok(stats({ totalGames: 41, xp: 3544, streaks: { current: 4, best: 6 } }))]);
    const { result } = renderHook(() => useGameEarned(input(), deps(fetchStats)));
    await flush();
    expect(result.current).toMatchObject({ phase: "waiting", forfeit: false, before: { heroPoints: 220, unlocked: ["first-win"], stats: { totalGames: 40, xp: 3504 } } });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    await flush();
    expect(result.current).toMatchObject({
      phase: "landed",
      after: { totalGames: 41, xp: 3544, streak: 4 },
      delta: { xp: 40, points: 40, heroPoints: 260, streak: { from: 3, to: 4 }, newBadges: ["streak-5"], levelUp: false },
    });
    expect(fetchStats).toHaveBeenCalledTimes(2);
  });

  it("times out into the calm fallback, keeping the baseline", async () => {
    const { fetchStats } = scripted([ok(stats())]);
    const { result } = renderHook(() => useGameEarned(input(), deps(fetchStats)));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
    });
    await flush();
    expect(result.current).toMatchObject({ phase: "timeout", before: { stats: { xp: 3504 } } });
    expect(fetchStats).toHaveBeenCalledTimes(3);
  });

  it("nothing before the game ends; a casual game or a guest never polls", async () => {
    const { fetchStats } = scripted([ok(stats({ totalGames: 41 }))]);
    const live = renderHook(() => useGameEarned(input({ gameOver: false }), deps(fetchStats)));
    await flush();
    expect(live.result.current).toBeNull();

    const casual = renderHook(() => useGameEarned(input({ kind: { kind: "casual" } }), deps(fetchStats)));
    await flush();
    expect(casual.result.current).toEqual({ phase: "casual" });

    const guest = renderHook(() => useGameEarned(input({ signedIn: false }), deps(fetchStats)));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(guest.result.current).toBeNull();
    expect(fetchStats).not.toHaveBeenCalled();
  });

  it("no pre-game stats → the one-line no-baseline state, no poll", async () => {
    const { fetchStats } = scripted([ok(stats({ totalGames: 41 }))]);
    const { result } = renderHook(() => useGameEarned(input({ stats: null }), deps(fetchStats)));
    await flush();
    expect(result.current).toEqual({ phase: "no-baseline" });
    expect(fetchStats).not.toHaveBeenCalled();
  });

  it("forfeit rides on the view live; unmount cancels the poll", async () => {
    const { fetchStats } = scripted([ok(stats())]);
    const { result, unmount } = renderHook(() => useGameEarned(input({ kind: { kind: "counted", forfeit: true } }), deps(fetchStats)));
    await flush();
    expect(result.current).toMatchObject({ phase: "waiting", forfeit: true });
    unmount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchStats).toHaveBeenCalledTimes(1);
  });

  it("a new room resets; its baseline is the LAST landed stats, not the page-load fetch", async () => {
    const { fetchStats } = scripted([ok(stats({ totalGames: 41, xp: 3544 })), ok(stats({ totalGames: 41, xp: 3544 })), ok(stats({ totalGames: 42, xp: 3600 }))]);
    const { result, rerender } = renderHook((props: GameEarnedInput) => useGameEarned(props, deps(fetchStats)), { initialProps: input() });
    await flush();
    await flush();
    expect(result.current).toMatchObject({ phase: "landed", delta: { xp: 40 } });

    rerender(input({ roomId: "ROOM2", gameOver: false }));
    await flush();
    expect(result.current).toBeNull();
    rerender(input({ roomId: "ROOM2", gameOver: true }));
    await flush();
    expect(result.current).toMatchObject({ phase: "waiting", before: { stats: { totalGames: 41, xp: 3544 } } });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    await flush();
    expect(result.current).toMatchObject({ phase: "landed", delta: { xp: 56 } });
  });
});
