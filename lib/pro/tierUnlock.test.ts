/**
 * The jevx3 unlock gate (#933). One case per row of the ticket's state table —
 * every state short of a confirmed 15-win record must fail CLOSED.
 */
import type { AccountStats, BotStat } from "../account/stats";
import { botTierMeta, coerceBotTier } from "./botTiers";
import {
  applyTierLocks,
  GUEST_HINT,
  LOADING_HINT,
  lockedTiers,
  TIER_UNLOCK,
  tierUnlockProgress,
  UNAVAILABLE_HINT,
  winsVsRequired,
} from "./tierUnlock";

const stats = (bots: BotStat[] | null): AccountStats =>
  ({
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    byOpponentKind: bots ? { human: null, bots } : null,
  }) as unknown as AccountStats;

const expertWins = (wins: number) => stats([{ difficulty: "expert", games: wins + 3, wins }]);

const CHOICES = (["easy", "medium", "hard", "expert", "jevx3"] as const).map(botTierMeta);

describe("TIER_UNLOCK", () => {
  it("gates jevx3 on 15 wins vs expert", () => {
    expect(TIER_UNLOCK).toEqual({ tier: "jevx3", requires: "expert", wins: 15 });
  });
});

describe("tierUnlockProgress", () => {
  it("signed in with 15 wins → unlocked, no hint", () => {
    expect(tierUnlockProgress("ready", expertWins(15))).toEqual({ unlocked: true, wins: 15 });
  });

  it("more than 15 wins also unlocks", () => {
    expect(tierUnlockProgress("ready", expertWins(40)).unlocked).toBe(true);
  });

  it("signed in with 14 wins → locked with N/15 progress", () => {
    expect(tierUnlockProgress("ready", expertWins(14))).toEqual({
      unlocked: false,
      wins: 14,
      hint: "14/15 wins vs Expert to unlock",
    });
  });

  it("counts only wins vs expert, not other tiers", () => {
    const s = stats([
      { difficulty: "hard", games: 50, wins: 50 },
      { difficulty: "expert", games: 20, wins: 12 },
    ]);
    expect(tierUnlockProgress("ready", s)).toMatchObject({ unlocked: false, wins: 12, hint: "12/15 wins vs Expert to unlock" });
  });

  it("guest → locked with the sign-in hint", () => {
    expect(tierUnlockProgress("guest", null)).toEqual({ unlocked: false, wins: null, hint: GUEST_HINT });
    expect(GUEST_HINT).toBe("Sign in and win 15 vs Expert to unlock");
  });

  it("offline accounts API → locked with the sign-in hint", () => {
    expect(tierUnlockProgress("offline", null)).toEqual({ unlocked: false, wins: null, hint: GUEST_HINT });
  });

  it("stats loading → locked with a neutral hint carrying no count", () => {
    const p = tierUnlockProgress("loading", null);
    expect(p).toEqual({ unlocked: false, wins: null, hint: LOADING_HINT });
    expect(p.hint).not.toMatch(/\d+\/15/);
  });

  it("stats loading never unlocks even if a stale record is in hand", () => {
    expect(tierUnlockProgress("loading", expertWins(99)).unlocked).toBe(false);
  });

  it("stats failed / unavailable → locked, says the record couldn't be loaded", () => {
    const p = tierUnlockProgress("unavailable", null);
    expect(p).toEqual({ unlocked: false, wins: null, hint: UNAVAILABLE_HINT });
    expect(p.hint).toMatch(/couldn't load your record/i);
  });

  it("byOpponentKind absent → treated as 0/15", () => {
    expect(winsVsRequired(stats(null))).toBe(0);
    expect(tierUnlockProgress("ready", stats(null))).toEqual({
      unlocked: false,
      wins: 0,
      hint: "0/15 wins vs Expert to unlock",
    });
  });

  it("no expert row → 0/15", () => {
    expect(tierUnlockProgress("ready", stats([{ difficulty: "easy", games: 3, wins: 3 }])).wins).toBe(0);
  });
});

describe("applyTierLocks / lockedTiers", () => {
  it("locks only jevx3, carrying the hint", () => {
    const out = applyTierLocks(CHOICES, tierUnlockProgress("ready", expertWins(14)));
    expect(out.filter((c) => c.locked).map((c) => c.id)).toEqual(["jevx3"]);
    expect(out.find((c) => c.id === "jevx3")?.lockHint).toBe("14/15 wins vs Expert to unlock");
    expect(out.find((c) => c.id === "expert")).toEqual(botTierMeta("expert"));
  });

  it("unlocked → choices returned untouched (normal tooltip)", () => {
    const out = applyTierLocks(CHOICES, tierUnlockProgress("ready", expertWins(15)));
    expect(out).toBe(CHOICES);
    expect(out.find((c) => c.id === "jevx3")?.locked).toBeUndefined();
  });

  it("server not advertising jevx3 → nothing to lock, no chip", () => {
    const plain = CHOICES.filter((c) => c.id !== "jevx3");
    const out = applyTierLocks(plain, tierUnlockProgress("guest", null));
    expect(out).toEqual(plain);
    expect(out.some((c) => c.id === "jevx3")).toBe(false);
  });

  it("an armed locked tier coerces down to expert", () => {
    const locked = lockedTiers(tierUnlockProgress("guest", null));
    expect(locked).toEqual(["jevx3"]);
    const selectable = CHOICES.map((c) => c.id).filter((t) => !locked.includes(t));
    expect(coerceBotTier("jevx3", selectable)).toBe("expert");
  });

  it("unlocked → nothing locked, jevx3 stays armed", () => {
    const locked = lockedTiers(tierUnlockProgress("ready", expertWins(15)));
    expect(locked).toEqual([]);
    expect(coerceBotTier("jevx3", CHOICES.map((c) => c.id))).toBe("jevx3");
  });
});
