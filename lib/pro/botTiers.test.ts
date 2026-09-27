/**
 * Bot-tier feature detection (#458).
 *
 * The whole point of this module is that the client learns the tier list from
 * the server's listing instead of shipping its own copy — so the tests that
 * matter are the SKEW cases: a server that advertises nothing (old build, or the
 * new tier still switched off) must land on exactly today's easy/medium/hard,
 * and a server that does advertise is taken at its word, per hero.
 */
import { availableBotTiers, botTierChoices, botTierMeta, ClientBotTier, coerceBotTier } from "./botTiers";
import type { BotDifficulty, HeroListing } from "./protocol";

const listing = (heroId: string, botTiers?: BotDifficulty[]): HeroListing => ({
  heroId,
  name: heroId,
  hp: 16,
  move: 3,
  reach: "MELEE",
  tier: "community",
  deckSection: "recommended",
  ...(botTiers ? { botTiers } : {}),
});

const EXPERT: BotDifficulty[] = ["easy", "medium", "hard", "expert"];
const PLAIN: ClientBotTier[] = ["easy", "medium", "hard"];

describe("availableBotTiers — no advertisement (old server / tier dormant)", () => {
  it("falls back to easy|medium|hard when the listing omits botTiers", () => {
    expect(availableBotTiers([listing("king-kong")], ["king-kong"])).toEqual(PLAIN);
  });

  it("falls back before the roster has arrived", () => {
    expect(availableBotTiers(null, ["king-kong"])).toEqual(PLAIN);
  });

  it("falls back when no hero is picked yet", () => {
    expect(availableBotTiers([listing("king-kong", EXPERT)], [])).toEqual(PLAIN);
    expect(availableBotTiers([listing("king-kong", EXPERT)], [null, undefined, ""])).toEqual(PLAIN);
  });

  it("falls back for a hero id the roster doesn't know", () => {
    expect(availableBotTiers([listing("king-kong", EXPERT)], ["who-dis"])).toEqual(PLAIN);
  });

  it("never yields an empty picker, even from a nonsense advertisement", () => {
    expect(availableBotTiers([listing("king-kong", [])], ["king-kong"])).toEqual(PLAIN);
  });
});

describe("availableBotTiers — the server advertises", () => {
  it("offers expert for a hero that carries it", () => {
    expect(availableBotTiers([listing("king-kong", EXPERT)], ["king-kong"])).toEqual(EXPERT);
  });

  it("does not offer expert for a hero that doesn't carry it", () => {
    const heroes = [listing("king-kong", EXPERT), listing("bigfoot", PLAIN)];
    expect(availableBotTiers(heroes, ["bigfoot"])).toEqual(PLAIN);
  });

  it("gates on EVERY named hero — the creator's deck counts too", () => {
    const heroes = [listing("king-kong", EXPERT), listing("bigfoot", PLAIN)];
    // creator on an expert hero, AI pinned to one without it → no expert
    expect(availableBotTiers(heroes, ["king-kong", "bigfoot"])).toEqual(PLAIN);
    // both measured → expert survives
    expect(availableBotTiers(heroes, ["king-kong", "king-kong"])).toEqual(EXPERT);
  });

  it("ignores unnamed seats (the server draws a random expert hero itself)", () => {
    expect(availableBotTiers([listing("king-kong", EXPERT)], ["king-kong", null])).toEqual(EXPERT);
  });

  it("takes an advertisement as-is, and renders it weakest-first", () => {
    const heroes = [listing("king-kong", ["expert", "easy"] as BotDifficulty[])];
    expect(availableBotTiers(heroes, ["king-kong"])).toEqual(["easy", "expert"]);
  });
});

describe("botTierChoices — labels and the alpha badge", () => {
  it("labels expert with an alpha badge and neutral, player-facing hover copy", () => {
    const expert = botTierChoices([listing("king-kong", EXPERT)], ["king-kong"]).find((c) => c.id === "expert");
    expect(expert).toMatchObject({ label: "Expert bot", chip: "AI·X", badge: "alpha", tooltip: "experimental - beware" });
  });

  it("gives the established tiers no badge", () => {
    for (const id of PLAIN) expect(botTierMeta(id).badge).toBeUndefined();
  });
});

describe("coerceBotTier — an armed tier that stops being offered", () => {
  it("keeps a tier that is still offered", () => {
    expect(coerceBotTier("expert", EXPERT)).toBe("expert");
  });

  it("drops to the strongest tier that remains", () => {
    expect(coerceBotTier("expert", PLAIN)).toBe("hard");
    expect(coerceBotTier("hard", ["easy", "medium"])).toBe("medium");
  });
});

describe("jev / jevx3 (#933)", () => {
  const ALL: BotDifficulty[] = ["easy", "medium", "hard", "expert", "jev", "jevx3"];

  it("a listing advertising jev never yields a jev choice — only jevx3 is new", () => {
    const ids = botTierChoices([listing("king-kong", ALL)], ["king-kong"]).map((c) => c.id);
    expect(ids).toEqual(["easy", "medium", "hard", "expert", "jevx3"]);
    expect(ids).not.toContain("jev");
  });

  it("jevx3 renders under its display name, chip and badge", () => {
    expect(botTierMeta("jevx3")).toMatchObject({ id: "jevx3", label: "Familiar 3", chip: "AI·F", badge: "preview" });
  });

  it("no player-facing text reveals the tech behind a tier", () => {
    const FORBIDDEN = /jev|llm|api|ismcts/i;
    for (const c of botTierChoices([listing("king-kong", ALL)], ["king-kong"])) {
      for (const text of [c.label, c.chip, c.badge, c.tooltip]) expect(text ?? "").not.toMatch(FORBIDDEN);
    }
  });
});
