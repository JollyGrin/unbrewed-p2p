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
import type { Quest, QuestsResult } from "@/lib/account/quests";
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
  const fetchStats = jest.fn(async (_after?: number) => {
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

  it("every refetch carries the pre-game totalGames as `after`, so the api can answer past its cache (#1666)", async () => {
    const { fetchStats } = scripted([ok(stats()), ok(stats({ totalGames: 41 }))]);
    const landed = pollUntilLanded({ totalGames: 40 }, { ...deps, fetchStats }, { cancelled: false });
    await flush();
    await jest.advanceTimersByTimeAsync(5_000);
    await landed;
    expect(fetchStats.mock.calls).toEqual([[40], [40]]);
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
  const before: EarnedSnapshot = { stats: { totalGames: 40, level: 7, xp: 3504, xpForNext: 3600, streak: 3, streakBest: 6, playedHeroes: [], bonuses: null, daily: null }, heroId: "hollow-oak", heroPoints: 220, unlocked: ["first-win"] };
  const cosmeticsOk: CosmeticsResult = {
    ok: true,
    value: { heroes: [{ ...emptyHeroCosmetics("hollow-oak", true), earned: 260 }], constants: { cardTierCosts: [50], tokenRimThresholds: [300, 900] } },
  };

  it("reads cosmetics and badges once each, with the api's ladder", async () => {
    const fetchCosmetics = jest.fn(async () => cosmeticsOk);
    const reprobeBadges = jest.fn(async () => [badge("first-win", true), badge("streak-5", true)]);
    const after = await readAfterLanding(stats({ totalGames: 41, xp: 3544, streaks: { current: 4, best: 6 } }), before, { fetchCosmetics, reprobeBadges }, [250]);
    expect(after).toEqual({
      stats: { totalGames: 41, level: 7, xp: 3544, xpForNext: 3600, streak: 4, streakBest: 6, playedHeroes: [], bonuses: null, daily: null },
      heroPoints: 260,
      unlocked: ["first-win", "streak-5"],
      thresholds: [300, 900],
      heroFirstGamePoints: null,
      quests: null,
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
    expect(casual.result.current).toEqual({ phase: "casual", practiceCap: null });

    const guest = renderHook(() => useGameEarned(input({ signedIn: false }), deps(fetchStats)));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000);
    });
    expect(guest.result.current).toBeNull();
    expect(fetchStats).not.toHaveBeenCalled();
  });

  describe("practice games (#1656)", () => {
    const practice = (used: number) => ({
      firstGame: { xp: 100, earned: true },
      practice: { cap: 5, used, xpPerGame: 10, xpPerWin: 5, xp: used * 10 },
      daily: null,
    });
    const played = [{ heroId: "hollow-oak", heroName: "Hollow Oak", games: 9, wins: 4 }];

    it("under the cap: polls like a counted game and lands with the XP", async () => {
      const { fetchStats } = scripted([ok(stats({ totalGames: 41, xp: 3519, byHero: played, bonuses: practice(3) }))]);
      const { result } = renderHook(() =>
        useGameEarned(input({ kind: { kind: "casual" }, stats: stats({ byHero: played, bonuses: practice(2) }) }), deps(fetchStats)),
      );
      await flush();
      await flush();
      expect(result.current).toMatchObject({ phase: "landed", practice: true, forfeit: false, delta: { xp: 15 }, after: { bonuses: { practice: { used: 3 } } } });
      expect(fetchStats).toHaveBeenCalledTimes(1);
    });

    it("past the cap: the note with the api's cap, and no request", async () => {
      const { fetchStats } = scripted([ok(stats({ totalGames: 41 }))]);
      const { result } = renderHook(() =>
        useGameEarned(input({ kind: { kind: "casual" }, stats: stats({ byHero: played, bonuses: practice(5) }) }), deps(fetchStats)),
      );
      await flush();
      expect(result.current).toEqual({ phase: "casual", practiceCap: 5 });
      expect(fetchStats).not.toHaveBeenCalled();
    });

    it("a counted game is never marked practice, and reads the api's hero-first constant for its bonus row", async () => {
      const { fetchStats } = scripted([ok(stats({ totalGames: 41, xp: 3544, byHero: played, bonuses: practice(5) }))]);
      const fetchCosmetics: EarnedPollDeps["fetchCosmetics"] = async () => ({
        ok: true,
        value: { heroes: [{ ...emptyHeroCosmetics("hollow-oak", true), earned: 310 }], constants: { ...FALLBACK_CONSTANTS, heroFirstGamePoints: 50 } },
      });
      const { result } = renderHook(() => useGameEarned(input({ stats: stats({ bonuses: practice(5) }) }), deps(fetchStats, { fetchCosmetics })));
      await flush();
      await flush();
      expect(result.current).toMatchObject({ phase: "landed", practice: false, delta: { points: 90, bonuses: [{ kind: "hero-first", points: 50 }] } });
    });
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

  describe("quest rows (#1666)", () => {
    const quest = (id: string, done: boolean, title = id): Quest => ({
      id,
      title,
      description: "",
      reward: { xp: 30, heroPoints: null, note: null },
      progress: { current: done ? 1 : 0, target: 1 },
      done,
    });
    const board = (starter: Quest[]): QuestsResult => ({ ok: true, value: { starter, daily: [quest("win-today", true)], resetsAt: null } });
    const withQuests = (xp: number | null) => ({ firstGame: { xp: 100, earned: true }, practice: null, daily: null, ...(xp === null ? {} : { quests: { xp } }) });

    it("reads the board when the room opens and again after landing; the starter quest that flipped is the row", async () => {
      const { fetchStats } = scripted([ok(stats({ totalGames: 41, xp: 3574, bonuses: withQuests(30) }))]);
      const boards = [board([quest("first-win", false, "Win a game")]), board([quest("first-win", true, "Win a game")])];
      const fetchQuests = jest.fn(async () => boards.shift() as QuestsResult);
      const base = { stats: stats({ bonuses: withQuests(0) }) };
      const { result, rerender } = renderHook((props: GameEarnedInput) => useGameEarned(props, deps(fetchStats, { fetchQuests })), {
        initialProps: input({ ...base, gameOver: false }),
      });
      await flush();
      expect(fetchQuests).toHaveBeenCalledTimes(1);
      expect(fetchStats).not.toHaveBeenCalled();

      rerender(input(base));
      await flush();
      await flush();
      expect(fetchQuests).toHaveBeenCalledTimes(2);
      expect(result.current).toMatchObject({
        phase: "landed",
        before: { questsDone: [] },
        // The daily quest restates the daily bonus and is never a quest row.
        delta: { xp: 70, bonuses: [{ kind: "quest", id: "first-win", title: "Win a game", xp: 30 }] },
      });
    });

    it("a page that loads onto a finished game reads no baseline; the api's total still shows, untitled", async () => {
      const { fetchStats } = scripted([ok(stats({ totalGames: 41, xp: 3574, bonuses: withQuests(30) }))]);
      const fetchQuests = jest.fn(async () => board([quest("first-win", true)]));
      const { result } = renderHook(() => useGameEarned(input({ stats: stats({ bonuses: withQuests(0) }) }), deps(fetchStats, { fetchQuests })));
      await flush();
      await flush();
      expect(fetchQuests).toHaveBeenCalledTimes(1);
      expect(result.current).toMatchObject({ phase: "landed", before: { questsDone: null }, delta: { bonuses: [{ kind: "quest", id: null, title: null, xp: 30 }] } });
    });

    it("an older api: no /me/quests (404) and no quests total → no quest row, everything else as before", async () => {
      const { fetchStats } = scripted([ok(stats({ totalGames: 41, xp: 3544, streaks: { current: 4, best: 6 } }))]);
      const fetchQuests = jest.fn(async (): Promise<QuestsResult> => ({ ok: false, reason: "unavailable" }));
      const { result, rerender } = renderHook((props: GameEarnedInput) => useGameEarned(props, deps(fetchStats, { fetchQuests })), {
        initialProps: input({ gameOver: false }),
      });
      await flush();
      rerender(input());
      await flush();
      await flush();
      expect(result.current).toMatchObject({ phase: "landed", before: { questsDone: null }, delta: { xp: 40, points: 40, newBadges: ["streak-5"], bonuses: [] } });
    });

    it("a rematch whose opening board is a cached pre-game one does not re-announce the quest", async () => {
      const { fetchStats } = scripted([
        ok(stats({ totalGames: 41, xp: 3574 })),
        ok(stats({ totalGames: 41, xp: 3574 })),
        ok(stats({ totalGames: 42, xp: 3614 })),
      ]);
      const open = board([quest("first-win", false)]);
      const done = board([quest("first-win", true)]);
      // room 1 opens, room 1 lands, room 2 opens (stale), room 2 lands.
      const boards = [open, done, open, done];
      const fetchQuests = jest.fn(async () => boards.shift() as QuestsResult);
      const { result, rerender } = renderHook((props: GameEarnedInput) => useGameEarned(props, deps(fetchStats, { fetchQuests })), {
        initialProps: input({ gameOver: false }),
      });
      await flush();
      rerender(input());
      await flush();
      await flush();
      expect(result.current).toMatchObject({ phase: "landed", delta: { bonuses: [{ kind: "quest", id: "first-win" }] } });

      rerender(input({ roomId: "ROOM2", gameOver: false }));
      await flush();
      rerender(input({ roomId: "ROOM2", gameOver: true }));
      await flush();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5_000);
      });
      await flush();
      expect(result.current).toMatchObject({ phase: "landed", before: { questsDone: ["first-win"] }, delta: { xp: 40, bonuses: [] } });
    });

    it("a guest's room never asks for quests", async () => {
      const { fetchStats } = scripted([ok(stats())]);
      const fetchQuests = jest.fn(async () => board([]));
      renderHook(() => useGameEarned(input({ signedIn: false, gameOver: false }), deps(fetchStats, { fetchQuests })));
      await flush();
      expect(fetchQuests).not.toHaveBeenCalled();
    });
  });
});
