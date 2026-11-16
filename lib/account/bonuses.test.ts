/**
 * The onboarding blocks of `/me/stats` (p2p #1656): both optional, both null
 * when the api sent nothing usable, and never invented.
 */
import { normalizeBonuses, normalizeDaily } from "./bonuses";
import { normalizeCosmetics } from "./cosmetics";
import { normalizeStats } from "./stats";

describe("normalizeBonuses", () => {
  it("reads the contract's block verbatim", () => {
    expect(
      normalizeBonuses({
        firstGame: { xp: 100, earned: true },
        practice: { cap: 5, used: 2, xpPerGame: 10, xpPerWin: 5, xp: 25 },
        daily: { xp: 45 },
      }),
    ).toEqual({
      firstGame: { xp: 100, earned: true },
      practice: { cap: 5, used: 2, xpPerGame: 10, xpPerWin: 5, xp: 25 },
      daily: { xp: 45 },
    });
  });

  it("null when absent or empty; a missing inner block stays null", () => {
    expect(normalizeBonuses(undefined)).toBeNull();
    expect(normalizeBonuses("nope")).toBeNull();
    expect(normalizeBonuses({})).toBeNull();
    expect(normalizeBonuses({ firstGame: { xp: 100, earned: false } })).toEqual({
      firstGame: { xp: 100, earned: false },
      practice: null,
      daily: null,
    });
  });

  it("reads `quests: { xp }` when the api sends it, and leaves the key off entirely when it does not (#1666)", () => {
    expect(normalizeBonuses({ firstGame: { xp: 100, earned: true }, quests: { xp: 60 } })).toEqual({
      firstGame: { xp: 100, earned: true },
      practice: null,
      daily: null,
      quests: { xp: 60 },
    });
    expect(normalizeBonuses({ quests: { xp: 30 } })?.quests).toEqual({ xp: 30 });
    expect(normalizeBonuses({ firstGame: { xp: 100, earned: true } })).not.toHaveProperty("quests");
    // The flat practice pay of the same api change is read as sent.
    expect(normalizeBonuses({ practice: { cap: 5, used: 2, xpPerGame: 15, xpPerWin: 0, xp: 30 } })?.practice).toEqual({ cap: 5, used: 2, xpPerGame: 15, xpPerWin: 0, xp: 30 });
  });
});

describe("normalizeDaily", () => {
  it("reads the contract's block; null without a streak", () => {
    const block = {
      streak: 3,
      bestStreak: 4,
      playedToday: true,
      wonToday: false,
      playXpToday: 20,
      playXpTomorrow: 25,
      firstWinXp: 20,
      resetsAt: "2026-11-16T00:00:00.000Z",
    };
    expect(normalizeDaily(block)).toEqual(block);
    expect(normalizeDaily(undefined)).toBeNull();
    expect(normalizeDaily({ playedToday: true })).toBeNull();
  });
});

describe("the fetch layers", () => {
  it("/me/stats without the blocks reads as null, with them as the blocks", () => {
    expect(normalizeStats({ totalGames: 3 })).toMatchObject({ bonuses: null, daily: null });
    const stats = normalizeStats({ totalGames: 3, bonuses: { firstGame: { xp: 100, earned: true } }, daily: { streak: 1 } });
    expect(stats.bonuses?.firstGame).toEqual({ xp: 100, earned: true });
    expect(stats.daily?.streak).toBe(1);
  });

  it("/me/cosmetics publishes heroFirstGamePoints only when the api does", () => {
    expect(normalizeCosmetics({ heroes: [] }).constants.heroFirstGamePoints).toBeUndefined();
    expect(normalizeCosmetics({ heroes: [], constants: { heroFirstGamePoints: 50 } }).constants.heroFirstGamePoints).toBe(50);
  });
});
