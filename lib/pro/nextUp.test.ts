/**
 * "Next up" ranking (p2p #1657): an affordable upgrade beats every near-miss,
 * goals are ordered by how close they are, ties fall in a fixed order, and no
 * data means no rows.
 */
import type { Badge } from "@/lib/account/badges";
import type { HeroCosmetics } from "@/lib/account/cosmetics";
import { FALLBACK_CONSTANTS, emptyHeroCosmetics } from "@/lib/account/cosmetics";
import {
  NextUpGoal,
  NextUpInput,
  affordableTier,
  badgeProgress,
  collectionHref,
  heroAfterGame,
  nextUpCopy,
  nextUpRows,
  rankGoals,
} from "./nextUp";

const constants = FALLBACK_CONSTANTS; // cards 50/150/400/1000, rims 250/750/2000/5000

const hero = (over: Partial<HeroCosmetics> = {}): HeroCosmetics => ({
  ...emptyHeroCosmetics("hollow-oak", true),
  ...over,
});

const badge = (id: string, unlockedWhy: string, unlocked = false): Badge => ({
  id,
  name: id,
  blurb: "",
  unlocked,
  unlockedWhy,
});

const input = (over: Partial<NextUpInput> = {}): NextUpInput => ({
  guest: false,
  hero: null,
  constants,
  stats: null,
  winXp: null,
  badges: [],
  ...over,
});

const kinds = (rows: { kind: string }[]) => rows.map((row) => row.kind);

describe("nothing to show", () => {
  it("no sources → no rows", () => {
    expect(nextUpRows(input())).toEqual([]);
  });

  it("unknown points (an outage), no progression block, only unlocked or unmeasured badges → no rows", () => {
    expect(
      nextUpRows(
        input({
          hero: hero({ earned: null, available: null }),
          stats: { level: null, xp: null, xpForNext: null },
          badges: [badge("first-win", "Win a game (1/1)", true), badge("flawless", "Win without taking damage")],
        }),
      ),
    ).toEqual([]);
  });

  it("everything maxed → no rows", () => {
    expect(
      nextUpRows(
        input({
          hero: hero({ earned: 9000, available: 0, cards: [{ key: "feint", tier: 4 }] }),
          cardKeys: ["feint"],
        }),
      ),
    ).toEqual([]);
  });
});

describe("guests", () => {
  it("one row, pointing at sign-in, whatever else is known", () => {
    expect(nextUpRows(input({ guest: true, hero: hero({ available: 500 }) }))).toEqual([{ kind: "sign-in" }]);
  });
});

describe("affordable beats near-miss", () => {
  it("an upgrade in reach leads, even over a goal that is 99% there", () => {
    const rows = nextUpRows(
      input({
        hero: hero({ earned: 50, available: 50 }),
        stats: { level: 1, xp: 298, xpForNext: 300 },
        badges: [badge("regular", "Play 100 games (99/100)")],
      }),
    );
    expect(rows[0]).toEqual({ kind: "unlock", heroId: "hollow-oak", tier: 1 });
    // The card goal is replaced by the unlock, not listed beside it.
    expect(kinds(rows)).toEqual(["unlock", "level", "badge"]);
  });

  it("names the best tier in reach, not the cheapest", () => {
    const owned = hero({ earned: 400, available: 160, cards: [{ key: "feint", tier: 1 }] });
    expect(affordableTier(owned, constants)).toBe(2);
    // With the deck known and every card already bronze, bronze is no longer on offer.
    expect(affordableTier(hero({ available: 60, cards: [{ key: "feint", tier: 1 }] }), constants, ["feint"])).toBe(0);
    expect(affordableTier(hero({ available: 60, cards: [{ key: "feint", tier: 1 }] }), constants, ["feint", "skirmish"])).toBe(1);
  });

  it("one point short is a goal, not an unlock", () => {
    const rows = nextUpRows(input({ hero: hero({ earned: 49, available: 49 }) }));
    expect(rows[0]).toMatchObject({ kind: "card", tier: 1, toGo: 1 });
    expect(kinds(rows)).not.toContain("unlock");
  });
});

describe("nearest goals", () => {
  it("ranks by how far through the current step each one is", () => {
    const rows = nextUpRows(
      input({
        // card: 20/50 = 40%; rim: 220/250 = 88%
        hero: hero({ earned: 220, available: 20 }),
        // level 7 runs 2800 → 3600; 3200 is 50%
        stats: { level: 7, xp: 3200, xpForNext: 3600 },
        badges: [badge("regular", "Play 25 games (24/25)"), badge("veteran", "Play 100 games (24/100)")],
      }),
    );
    // badge 96% > rim 88% > level 50% > card 40% — and only three fit.
    expect(kinds(rows)).toEqual(["badge", "rim", "level"]);
    expect(rows[0]).toMatchObject({ id: "regular", current: 24, target: 25, toGo: 1 });
    expect(rows[1]).toMatchObject({ tier: 1, toGo: 30 });
    expect(rows[2]).toMatchObject({ level: 8, toGo: 400, oneMoreWin: false });
  });

  it("the card goal is the cheapest step still out of reach", () => {
    const rows = nextUpRows(input({ hero: hero({ earned: 300, available: 100, cards: [{ key: "feint", tier: 1 }] }), cardKeys: ["feint"] }));
    expect(rows.find((row) => row.kind === "card")).toMatchObject({ tier: 2, toGo: 50 });
  });

  it("'one more win' only when a win like the last one covers the gap", () => {
    const stats = { level: 7, xp: 3570, xpForNext: 3600 };
    expect(nextUpRows(input({ stats, winXp: 40 }))[0]).toMatchObject({ kind: "level", oneMoreWin: true });
    expect(nextUpRows(input({ stats, winXp: 20 }))[0]).toMatchObject({ kind: "level", oneMoreWin: false });
    expect(nextUpRows(input({ stats, winXp: null }))[0]).toMatchObject({ kind: "level", oneMoreWin: false });
  });
});

describe("ties", () => {
  it("equally close goals fall in a fixed order: card, rim, level, badge", () => {
    const goal = (kind: NextUpGoal["kind"]): NextUpGoal =>
      ({ kind, progress: 0.5, toGo: 5, heroId: "h", tier: 1, level: 2, oneMoreWin: false, id: "b", name: "b", current: 5, target: 10 }) as NextUpGoal;
    expect(kinds(rankGoals([goal("badge"), goal("level"), goal("rim"), goal("card")]))).toEqual(["card", "rim", "level", "badge"]);
  });

  it("a brand-new account (everything at zero) reads card, rim, level", () => {
    const rows = nextUpRows(
      input({
        hero: hero(),
        stats: { level: 0, xp: 0, xpForNext: 100 },
        badges: [badge("regular", "Play 25 games (0/25)")],
      }),
    );
    expect(kinds(rows)).toEqual(["card", "rim", "level"]);
  });

  it("two badges equally far along: the catalog's first one wins", () => {
    const rows = nextUpRows(input({ badges: [badge("a", "Win 10 (5/10)"), badge("b", "Play 20 (10/20)")] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "badge", id: "a" });
  });
});

describe("badgeProgress", () => {
  it("reads the trailing (n/m), commas included, and nothing else", () => {
    expect(badgeProgress("Play 25 games (12/25)")).toEqual({ current: 12, target: 25 });
    expect(badgeProgress("Earn XP (1,200 / 5,000)")).toEqual({ current: 1200, target: 5000 });
    expect(badgeProgress("Win without taking damage")).toBeNull();
    expect(badgeProgress("(3/0)")).toBeNull();
    expect(badgeProgress("")).toBeNull();
  });
});

describe("heroAfterGame", () => {
  it("moves earned to the landed total and available by the same amount", () => {
    const held = hero({ earned: 220, available: 20, spent: 200 });
    expect(heroAfterGame(held, "hollow-oak", 260)).toMatchObject({ earned: 260, available: 60, spent: 200 });
  });

  it("nothing landed → the held row, untouched (and null stays null)", () => {
    const held = hero({ earned: 220, available: 20 });
    expect(heroAfterGame(held, "hollow-oak", null)).toBe(held);
    expect(heroAfterGame(null, "hollow-oak", null)).toBeNull();
  });

  it("a hero the api never listed starts from zero once a total lands", () => {
    expect(heroAfterGame(null, "hollow-oak", 50)).toMatchObject({ heroId: "hollow-oak", earned: 50, available: 50 });
  });

  it("an unknown held balance stays unknown — it is never guessed from the delta", () => {
    expect(heroAfterGame(hero({ earned: null, available: null }), "hollow-oak", 260)).toMatchObject({
      earned: 260,
      available: null,
    });
  });
});

describe("copy", () => {
  it("says what each row is, in the hero's name", () => {
    expect(nextUpCopy({ kind: "unlock", heroId: "hollow-oak", tier: 1 }, "Hollow Oak").title).toBe(
      "Upgrade available: Bronze on Hollow Oak",
    );
    expect(nextUpCopy({ kind: "card", heroId: "h", tier: 2, toGo: 1, progress: 0 }, "Hollow Oak").title).toBe(
      "1 point to a Silver card",
    );
    expect(nextUpCopy({ kind: "rim", heroId: "h", tier: 1, toGo: 30, progress: 0 }, "Hollow Oak").title).toBe(
      "30 points to the Bronze token rim",
    );
    expect(nextUpCopy({ kind: "level", level: 8, toGo: 30, progress: 0, oneMoreWin: true }, "").title).toBe(
      "One more win to level 8",
    );
    expect(nextUpCopy({ kind: "level", level: 8, toGo: 1400, progress: 0, oneMoreWin: false }, "").title).toBe(
      "1,400 XP to level 8",
    );
    expect(
      nextUpCopy({ kind: "badge", id: "regular", name: "Regular", current: 24, target: 25, toGo: 1, progress: 0 }, "").title,
    ).toBe("Regular: 24 / 25");
  });

  it("deep-links to the hero on /collection", () => {
    expect(collectionHref("hollow-oak")).toBe("/collection?hero=hollow-oak");
  });
});
