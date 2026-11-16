/**
 * "Next up" ranking (p2p #1657): an affordable upgrade beats every near-miss,
 * goals are ordered by how close they are, ties fall in a fixed order, and no
 * data means no rows.
 */
import type { Badge } from "@/lib/account/badges";
import type { HeroCosmetics } from "@/lib/account/cosmetics";
import { FALLBACK_CONSTANTS, emptyHeroCosmetics } from "@/lib/account/cosmetics";
import {
  LadderInput,
  NewHeroInput,
  NextUpGoal,
  NextUpInput,
  affordableTier,
  badgeProgress,
  badgeProgressOf,
  botTierPlayed,
  collectionHref,
  heroAfterGame,
  ladderStep,
  newHeroHref,
  nextUpCopy,
  nextUpRows,
  pickNewHero,
  rankGoals,
} from "./nextUp";
import type { BotDifficulty } from "./protocol";
import type { FinishedGameSetup } from "./rematch";
import { parseRematchQuery, rematchCreateRoomArgs } from "./rematch";

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

describe("badgeProgressOf (#1666): the structured field first, the text parse as fallback", () => {
  it("uses `progress` when the api sends it, whatever the text says", () => {
    expect(badgeProgressOf({ unlockedWhy: "Play 50 games", progress: { current: 40, target: 50 } })).toEqual({ current: 40, target: 50 });
    expect(badgeProgressOf({ unlockedWhy: "Play 50 games (1/50)", progress: { current: 40, target: 50 } })).toEqual({ current: 40, target: 50 });
  });

  it("falls back to the trailing (n/m) on an older api, and on a field it cannot use", () => {
    expect(badgeProgressOf({ unlockedWhy: "Play 50 games (40/50)" })).toEqual({ current: 40, target: 50 });
    expect(badgeProgressOf({ unlockedWhy: "Play 50 games (40/50)", progress: null })).toEqual({ current: 40, target: 50 });
    expect(badgeProgressOf({ unlockedWhy: "Play 50 games (40/50)", progress: { current: 4, target: 0 } })).toEqual({ current: 40, target: 50 });
    expect(badgeProgressOf({ unlockedWhy: "Win without taking damage" })).toBeNull();
  });

  it("a badge whose text carries no counter becomes a goal once the field says how close it is", () => {
    const structured = { ...badge("regular", "Play 50 games"), progress: { current: 40, target: 50 } };
    expect(nextUpRows(input({ badges: [structured] }))).toEqual([
      { kind: "badge", id: "regular", name: "regular", current: 40, target: 50, toGo: 10, progress: 0.8 },
    ]);
    // The same badge from an older api: no counter anywhere, no row.
    expect(nextUpRows(input({ badges: [badge("regular", "Play 50 games")] }))).toEqual([]);
    // A one-step feat (0/1) that is locked is a far goal, and a full one is not a goal at all.
    expect(nextUpRows(input({ badges: [{ ...badge("flawless", "Win without taking damage"), progress: { current: 1, target: 1 } }] }))).toEqual([]);
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

// --- what to play next (p2p #1659) -------------------------------------------

const TIERS = ["easy", "medium", "hard", "expert"];

const setup = (bot: BotDifficulty | null = "easy", over: Partial<FinishedGameSetup> = {}): FinishedGameSetup => ({
  formatId: "duel",
  itemsWereOff: false,
  mapId: "sarpedon",
  turnTimerSeconds: 60,
  mulliganWasOn: true,
  yourHeroId: "hollow-oak",
  otherSeats: [{ player: "p2", heroId: "thetis", bot }],
  ...over,
});

const ladder = (over: Partial<LadderInput> = {}): LadderInput => ({
  setup: setup(),
  won: true,
  offered: TIERS,
  practiceSpent: false,
  ...over,
});

const roster = [
  { heroId: "appa", name: "Appa" },
  { heroId: "batman", name: "Batman" },
  { heroId: "thrall", name: "Thrall" },
];

const newHero = (over: Partial<NewHeroInput> = {}): NewHeroInput => ({
  roster,
  piloted: ["appa"],
  points: 50,
  ...over,
});

/** A row's link, read back the way the page reads a rematch link. */
const created = (href: string) => {
  const query = Object.fromEntries(new URLSearchParams(href.slice(href.indexOf("?") + 1)));
  const parsed = parseRematchQuery(query);
  if (!parsed) throw new Error(`not a rematch link: ${href}`);
  return { parsed, args: rematchCreateRoomArgs(parsed) };
};

const only = <K extends string>(rows: { kind: string }[], kind: K) => rows.find((row) => row.kind === kind) as never as
  | Extract<ReturnType<typeof nextUpRows>[number], { kind: K }>
  | undefined;

describe("bot ladder", () => {
  it("a win vs easy / medium / hard offers the next tier up", () => {
    expect(ladderStep("easy", TIERS, false)).toBe("medium");
    expect(ladderStep("medium", TIERS, false)).toBe("hard");
    expect(ladderStep("hard", TIERS, false)).toBe("expert");
  });

  it("the top rung, the hidden tier and a non-bot game lead nowhere", () => {
    expect(ladderStep("expert", [...TIERS, "jevx3"], false)).toBeNull();
    expect(ladderStep("jevx3", [...TIERS, "jevx3"], false)).toBeNull();
    expect(ladderStep(null, TIERS, false)).toBeNull();
  });

  it("never offers a tier the server does not serve for these heroes", () => {
    expect(ladderStep("hard", ["easy", "medium", "hard"], false)).toBeNull();
  });

  it("practice cap used up: easy and medium both point at hard, where XP continues", () => {
    expect(ladderStep("easy", TIERS, true)).toBe("hard");
    expect(ladderStep("medium", TIERS, true)).toBe("hard");
    const row = only(nextUpRows(input({ ladder: ladder({ practiceSpent: true }) })), "ladder");
    expect(row).toMatchObject({ from: "easy", to: "hard", practiceSpent: true });
    expect(nextUpCopy(row!, "")).toEqual({
      title: "Ready for the Hard bot?",
      caption: "Practice XP is used up. Hard bots are where XP continues.",
    });
  });

  it("the cap is about easy/medium pay: a win vs hard reads as an ordinary step", () => {
    const row = only(nextUpRows(input({ ladder: ladder({ setup: setup("hard"), practiceSpent: true }) })), "ladder");
    expect(row).toMatchObject({ from: "hard", to: "expert", practiceSpent: false });
    expect(nextUpCopy(row!, "").caption).toBe("You beat the Hard bot. Same setup, one step up.");
  });

  it("the row is the rematch link with only the bot's tier moved", () => {
    const row = only(nextUpRows(input({ ladder: ladder() })), "ladder");
    expect(nextUpCopy(row!, "").title).toBe("Ready for the Medium bot?");
    const { parsed, args } = created(row!.href);
    expect(parsed).toMatchObject({ heroId: "hollow-oak", formatId: "duel", mapId: "sarpedon", turnTimerSeconds: 60, mulligan: true });
    expect(args.bot).toEqual({ difficulty: "medium", heroId: "thetis" });
  });

  it("every bot seat of a multiplayer room moves together", () => {
    const seats = setup("medium", {
      formatId: "ffa-3",
      otherSeats: [
        { player: "p2", heroId: "thetis", bot: "medium" },
        { player: "p3", heroId: "batman", bot: "medium" },
      ],
    });
    const row = only(nextUpRows(input({ ladder: ladder({ setup: seats }) })), "ladder");
    expect(created(row!.href).args.botSeats.map((seat) => seat.difficulty)).toEqual(["hard", "hard"]);
  });

  it("no row after a loss, vs a human, vs mixed tiers, or before the setup is known", () => {
    expect(only(nextUpRows(input({ ladder: ladder({ won: false }) })), "ladder")).toBeUndefined();
    expect(only(nextUpRows(input({ ladder: ladder({ setup: setup(null) }) })), "ladder")).toBeUndefined();
    expect(only(nextUpRows(input({ ladder: ladder({ setup: null }) })), "ladder")).toBeUndefined();
    const mixed = setup("easy", {
      otherSeats: [
        { player: "p2", heroId: "thetis", bot: "easy" },
        { player: "p3", heroId: "batman", bot: null },
      ],
    });
    expect(botTierPlayed(mixed)).toBeNull();
    expect(only(nextUpRows(input({ ladder: ladder({ setup: mixed }) })), "ladder")).toBeUndefined();
  });
});

describe("hidden bot progress", () => {
  it("shows from the first expert win up to the unlock", () => {
    const row = only(nextUpRows(input({ expertWins: 9 })), "hidden-bot");
    expect(row).toEqual({ kind: "hidden-bot", wins: 9, target: 15, progress: 9 / 15 });
    expect(nextUpCopy(row!, "").title).toBe("9/15 expert wins");
  });

  it("no expert wins, no record, or already unlocked → no row", () => {
    for (const expertWins of [0, null, undefined, 15, 22]) {
      expect(nextUpRows(input({ expertWins }))).toEqual([]);
    }
  });
});

describe("try a new hero", () => {
  it("suggests a hero never piloted, with the api's first-game points", () => {
    const row = only(nextUpRows(input({ newHero: newHero() })), "new-hero");
    expect(row).toMatchObject({ heroId: "batman", heroName: "Batman", points: 50 });
    expect(nextUpCopy(row!, "")).toEqual({ title: "Try Batman", caption: "First game as a new hero pays +50 points" });
  });

  it("prefers the least-played hero overall when that is at hand; a hero nobody has played counts as zero", () => {
    expect(pickNewHero(newHero({ heroPlays: { batman: 900, thrall: 12 } }))?.heroId).toBe("thrall");
    expect(pickNewHero(newHero({ heroPlays: { thrall: 12 } }))?.heroId).toBe("batman");
    expect(pickNewHero(newHero({ heroPlays: { batman: 5, thrall: 5 } }))?.heroId).toBe("batman");
  });

  it("every hero piloted, or no roster → no row", () => {
    expect(nextUpRows(input({ newHero: newHero({ piloted: ["appa", "batman", "thrall"] }) }))).toEqual([]);
    expect(nextUpRows(input({ newHero: newHero({ roster: [] }) }))).toEqual([]);
  });

  it("an api that publishes no first-game points → no row (the number is never ours)", () => {
    expect(nextUpRows(input({ newHero: newHero({ points: null }) }))).toEqual([]);
    expect(nextUpRows(input({ newHero: newHero({ points: undefined }) }))).toEqual([]);
  });

  it("one tap is a duel as that hero vs one bot, at the tier just played when it is an everyday one", () => {
    const at = (tier?: BotDifficulty | null) => created(only(nextUpRows(input({ newHero: newHero({ tier }) })), "new-hero")!.href);
    expect(at().args).toMatchObject({ heroId: "batman", bot: { difficulty: "medium" }, botSeats: [] });
    expect(at().parsed).toMatchObject({ formatId: "duel", mapId: null, turnTimerSeconds: 0, mulligan: true, joinHeroId: null });
    expect(at("easy").args.bot).toEqual({ difficulty: "easy" });
    expect(at("hard").args.bot).toEqual({ difficulty: "hard" });
    expect(at("expert").args.bot).toEqual({ difficulty: "medium" });
    expect(at("jevx3").args.bot).toEqual({ difficulty: "medium" });
    expect(newHeroHref("batman", "easy")).toBe("/pro/game?rematch=1&hero=batman&bots=p2%3Aeasy%3A");
  });
});

describe("where the suggestions rank", () => {
  const all = { ladder: ladder(), expertWins: 9, newHero: newHero() };

  it("an available unlock still wins", () => {
    const rows = nextUpRows(input({ ...all, hero: hero({ earned: 50, available: 50 }) }));
    expect(kinds(rows)).toEqual(["unlock", "ladder", "hidden-bot"]);
  });

  it("near-miss goals sit above them, far-off goals below", () => {
    const rows = nextUpRows(
      input({
        ladder: ladder(),
        // level: 60% through → near; card 10/50 = 20% → far.
        stats: { level: 0, xp: 60, xpForNext: 100 },
        hero: hero({ earned: 10, available: 10 }),
      }),
    );
    expect(kinds(rows)).toEqual(["level", "ladder", "card"]);
  });

  it("exactly half way counts as near", () => {
    const rows = nextUpRows(input({ ladder: ladder(), hero: hero({ earned: 25, available: 25 }) }));
    expect(kinds(rows)).toEqual(["card", "ladder", "rim"]);
  });

  it("enough near misses fill the strip and the suggestions wait", () => {
    const rows = nextUpRows(
      input({
        ...all,
        stats: { level: 0, xp: 90, xpForNext: 100 },
        hero: hero({ earned: 240, available: 40 }),
        badges: [badge("regular", "Play 50 games (40/50)")],
      }),
    );
    // rim 240/250 = 96%, level 90%, card 40/50 = 80%, badge 80%.
    expect(kinds(rows)).toEqual(["rim", "level", "card"]);
  });

  it("nothing else qualifies → they are the strip, in a fixed order", () => {
    expect(kinds(nextUpRows(input(all)))).toEqual(["ladder", "hidden-bot", "new-hero"]);
  });

  it("a brand-new account's 0% bars do not bury what to play next", () => {
    const rows = nextUpRows(
      input({ ladder: ladder(), newHero: newHero(), hero: hero({ earned: 0, available: 0 }), stats: { level: 0, xp: 0, xpForNext: 100 } }),
    );
    expect(kinds(rows)).toEqual(["ladder", "new-hero", "card"]);
  });

  it("a guest still gets the sign-in row and nothing else", () => {
    expect(kinds(nextUpRows(input({ ...all, guest: true })))).toEqual(["sign-in"]);
  });
});

describe("practice pay just ran out (#1666)", () => {
  const spent = { ladder: ladder({ practiceSpent: true }) };
  // level 65% and badge 60% are near misses; the card (35/50) is too, when there is no unlock.
  const near = { stats: { level: 0, xp: 65, xpForNext: 100 }, badges: [badge("hot-streak", "Win 5 in a row (3/5)")] };

  it("the 'XP continues at hard' row outranks the near-miss goals", () => {
    const rows = nextUpRows(input({ ...spent, ...near, hero: hero({ earned: 35, available: 35 }) }));
    expect(kinds(rows)).toEqual(["ladder", "card", "level"]);
    expect(rows[0]).toMatchObject({ kind: "ladder", to: "hard", practiceSpent: true });
  });

  it("the strip that used to crowd it out (unlock + two near goals) now shows it second", () => {
    const rows = nextUpRows(input({ ...spent, ...near, hero: hero({ earned: 50, available: 50 }) }));
    expect(kinds(rows)).toEqual(["unlock", "ladder", "level"]);
  });

  it("an ordinary ladder step keeps its old place, below the near misses", () => {
    const rows = nextUpRows(input({ ladder: ladder(), ...near, hero: hero({ earned: 50, available: 50 }) }));
    expect(kinds(rows)).toEqual(["unlock", "level", "badge"]);
  });

  it("after a loss: the same message, in the same place, with no ladder link", () => {
    const rows = nextUpRows(input({ ladder: ladder({ practiceSpent: true, won: false }), ...near, hero: hero({ earned: 50, available: 50 }) }));
    expect(kinds(rows)).toEqual(["unlock", "practice-spent", "level"]);
    expect(rows[1]).toEqual({ kind: "practice-spent", to: "hard" });
    expect(nextUpCopy(rows[1], "")).toEqual({ title: "Practice XP is used up", caption: "Hard bots are where XP continues." });
  });

  it("a loss says nothing while practice still pays, vs a hard bot, vs a human, or when hard is not served", () => {
    const lost = (over: Partial<LadderInput>) => kinds(nextUpRows(input({ ladder: ladder({ won: false, practiceSpent: true, ...over }) })));
    expect(lost({ practiceSpent: false })).toEqual([]);
    expect(lost({ setup: setup("hard") })).toEqual([]);
    expect(lost({ setup: setup(null) })).toEqual([]);
    expect(lost({ offered: ["easy", "medium"] })).toEqual([]);
    expect(lost({ setup: null })).toEqual([]);
    expect(lost({})).toEqual(["practice-spent"]);
  });
});
