import {
  boughtRangeAttacks,
  boughtRangeBlurb,
  boughtRangeChip,
  RANGE_PURCHASE_HEROES,
  rangeCostFor,
  rangePurchaseRuleFor,
  rangeSpendLineFor,
  reachIndex,
  targetingGraph,
  withinSpaces,
  type RangePurchaseView,
} from "./rangePurchase";
import { HERO_STATE_COUNTERS } from "./heroStateFlags";
import type { Action, ProMapSpace, ViewFighter } from "./protocol";

/**
 * Cecil Palmer's bought attack range (issue #668 ↔ engine #456).
 *
 * The whole module is an EXPLANATION of options the server already offered, so what
 * is pinned here is that its price agrees with the engine's — `rangeCostFor` is a
 * transcription of engine/rangePurchase.ts and its `inAttackRange` mirror is a
 * transcription of engine/map.ts. If those drift, the board shows a price the engine
 * does not charge, which is worse than showing nothing.
 */

// A line of spaces with one branch, and two zones:
//   a1 — a2 — a3 — b1 — b2
//                   └── b3
// a1..a3 are zone A; b1 is BOTH zones (a multi-zone space, which is how Cecil earns
// tokens in the first place); b2/b3 are zone B.
const SPACES: ProMapSpace[] = [
  { id: "a1", x: 0, y: 0, zones: ["A"], adjacentTo: ["a2"] },
  { id: "a2", x: 0, y: 0, zones: ["A"], adjacentTo: ["a1", "a3"] },
  { id: "a3", x: 0, y: 0, zones: ["A"], adjacentTo: ["a2", "b1"] },
  { id: "b1", x: 0, y: 0, zones: ["A", "B"], adjacentTo: ["a3", "b2", "b3"] },
  { id: "b2", x: 0, y: 0, zones: ["B"], adjacentTo: ["b1"] },
  { id: "b3", x: 0, y: 0, zones: ["B"], adjacentTo: ["b1"] },
];

const IDX = reachIndex(SPACES);

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Cecil Palmer",
  space: "a1",
  tailSpace: null,
  hp: 13,
  maxHp: 13,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const cecil = (space: string) => fighter({ space });
const khoshekh = (space: string) =>
  fighter({ id: "p1/khoshekh", kind: "SIDEKICK", name: "Khoshekh", hp: 6, maxHp: 6, space });
const enemy = (space: string, over: Partial<ViewFighter> = {}) =>
  fighter({ id: "p2/hero", owner: "p2", name: "Mandalorian", space, ...over });

const view = (
  fighters: ViewFighter[],
  counters: Record<string, number>,
  heroId = "cecil-palmer"
): RangePurchaseView => ({
  you: "p1",
  fighters,
  players: [
    { id: "p1", heroId, counters },
    { id: "p2", heroId: "mandalorian", counters: {} },
  ],
  map: { spaces: SPACES },
});

const declare = (attacker: string, target: string): Action => ({
  type: "DECLARE_ATTACK",
  player: "p1",
  attacker,
  target,
});

describe("the registry", () => {
  it("names Cecil's engine counter key exactly, and nobody else buys range", () => {
    // The key is `BROADCAST`, not the "Broadcast tokens" flavour of the rule card.
    expect(rangePurchaseRuleFor("cecil-palmer")?.counter).toBe("BROADCAST");
    expect(Object.keys(RANGE_PURCHASE_HEROES)).toEqual(["cecil-palmer"]);
    expect(rangePurchaseRuleFor("skull-kid")).toBeNull();
    expect(rangePurchaseRuleFor(undefined)).toBeNull();
  });

  it("spends the SAME counter the nameplate pill and token badge render", () => {
    // Two registries, one resource: a price drawn from a pool the plate does not
    // show is exactly the "where did my tokens go?" bug this ticket exists to fix.
    const row = HERO_STATE_COUNTERS.find((e) => e.heroes.includes("cecil-palmer"));
    expect(row?.counter).toBe(rangePurchaseRuleFor("cecil-palmer")!.counter);
    expect(row?.nameplate).toBeTruthy();
    expect(row?.token).toBeTruthy();
    expect(row?.outOf).toBe(6); // the rule card's "You have 6 Broadcast tokens"
  });
});

describe("targetingGraph", () => {
  it("mirrors the engine's adjacentSpaces: one-way edges count BOTH ways", () => {
    // Range is line-of-targeting, not a movement path (engine map.ts adjacentSpaces).
    const g = targetingGraph([
      { id: "up", x: 0, y: 0, zones: [], adjacentTo: [], oneWayTo: ["down"] },
      { id: "down", x: 0, y: 0, zones: [], adjacentTo: [] },
    ]);
    expect(g.get("up")).toContain("down");
    expect(g.get("down")).toContain("up");
  });

  it("treats a space as NOT within n steps of itself", () => {
    expect(withinSpaces(IDX.graph, "a1", "a1", 3)).toBe(false);
    expect(withinSpaces(IDX.graph, "a1", "a3", 2)).toBe(true);
    expect(withinSpaces(IDX.graph, "a1", "a3", 1)).toBe(false);
  });
});

describe("rangeCostFor", () => {
  it("charges NOTHING for an adjacent target, even with a full dial", () => {
    // The engine buys the SHORTFALL, never the dial (RULING R5) — so free reach
    // stays free and the board must not chip a price onto it.
    expect(rangeCostFor(cecil("a1"), enemy("a2"), IDX, 6)).toBe(0);
  });

  it("charges the shortfall — distance minus melee reach 1", () => {
    expect(rangeCostFor(cecil("a1"), enemy("a3"), IDX, 6)).toBe(1);
    expect(rangeCostFor(cecil("a1"), enemy("b1"), IDX, 6)).toBe(2);
    expect(rangeCostFor(cecil("a1"), enemy("b2"), IDX, 6)).toBe(3);
  });

  it("returns null when the dial cannot cover the gap", () => {
    expect(rangeCostFor(cecil("a1"), enemy("b2"), IDX, 2)).toBeNull();
    expect(rangeCostFor(cecil("a1"), enemy("a3"), IDX, 0)).toBeNull();
  });

  it("prices from EITHER end of a LARGE body, and off its 2-space base reach", () => {
    const large = fighter({ space: "a1", tailSpace: "a2", size: "LARGE" });
    // base 2 steps from the tail reaches b1; nothing to buy
    expect(rangeCostFor(large, enemy("b1"), IDX, 6)).toBe(0);
    expect(rangeCostFor(large, enemy("b2"), IDX, 6)).toBe(1);
  });

  it("keeps the shared-space rule OUT of the distance widening", () => {
    // Two fighters on one space is the SMALL rule (engine v0.35.0), never a bought
    // step: `from === to` is not "within n steps" at any price.
    expect(rangeCostFor(cecil("a1"), enemy("a1"), IDX, 6)).toBeNull();
    expect(rangeCostFor(cecil("a1"), enemy("a1", { size: "SMALL" }), IDX, 6)).toBe(0);
  });

  it("returns null the instant either fighter is off-board", () => {
    expect(rangeCostFor(cecil("a1"), enemy("a3", { space: null }), IDX, 6)).toBeNull();
    expect(rangeCostFor(fighter({ space: null }), enemy("a3"), IDX, 6)).toBeNull();
  });
});

describe("boughtRangeAttacks", () => {
  it("prices only the offers that actually cost something", () => {
    const v = view([cecil("a1"), enemy("a2"), enemy("b1", { id: "p2/sk", name: "The Child" })], {
      BROADCAST: 4,
    });
    const out = boughtRangeAttacks(v, [declare("p1/hero", "p2/hero"), declare("p1/hero", "p2/sk")]);
    expect(out).toEqual([
      { attacker: "p1/hero", target: "p2/sk", cost: 2, rule: RANGE_PURCHASE_HEROES["cecil-palmer"] },
    ]);
  });

  it("prices a SIDEKICK's attack too — `who: 'ANY_OWN'` means the player buys", () => {
    const v = view([cecil("b3"), khoshekh("a1"), enemy("a3")], { BROADCAST: 6 });
    const out = boughtRangeAttacks(v, [declare("p1/khoshekh", "p2/hero")]);
    expect(out.map((b) => [b.attacker, b.cost])).toEqual([["p1/khoshekh", 1]]);
  });

  it("is silent for a deck that buys no range", () => {
    const v = view([cecil("a1"), enemy("b1")], { TIME: 4 }, "skull-kid");
    expect(boughtRangeAttacks(v, [declare("p1/hero", "p2/hero")])).toEqual([]);
  });

  it("is silent with an empty dial — nothing to spend, nothing to explain", () => {
    const v = view([cecil("a1"), enemy("b1")], {});
    expect(boughtRangeAttacks(v, [declare("p1/hero", "p2/hero")])).toEqual([]);
  });

  it("is ATTACKER-ONLY: never prices an attack by a fighter this seat does not own", () => {
    // Buying range must never draw a threat ring on the opponent's side (engine #307's
    // rule, restated by #456). A stray action naming their fighter as attacker is
    // dropped rather than annotated.
    const v = view([cecil("a1"), enemy("b1")], { BROADCAST: 6 });
    const theirs: Action = { type: "DECLARE_ATTACK", player: "p2", attacker: "p2/hero", target: "p1/hero" };
    expect(boughtRangeAttacks(v, [theirs])).toEqual([]);
  });

  it("says the price and the reason in words the player can act on", () => {
    const b = { cost: 2, rule: RANGE_PURCHASE_HEROES["cecil-palmer"] };
    expect(boughtRangeChip(b)).toBe("−2 📻");
    expect(boughtRangeBlurb(b)).toContain("2 Broadcast tokens");
    expect(boughtRangeBlurb({ ...b, cost: 1 })).toContain("1 Broadcast token to close");
  });
});

describe("rangeSpendLineFor", () => {
  const v = view([cecil("a1"), enemy("b1")], { BROADCAST: 2 });
  const declared = [{ type: "ATTACK_DECLARED", attacker: "p1/hero", target: "p2/hero" }];

  it("narrates the spend from the COUNTER_CHANGED that rides beside ATTACK_DECLARED", () => {
    expect(rangeSpendLineFor(declared, "p1", "BROADCAST", 2, v)).toBe(
      "Cecil Palmer spent 2 Broadcast tokens to reach Mandalorian"
    );
    expect(rangeSpendLineFor(declared, "p1", "BROADCAST", 1, v)).toContain("1 Broadcast token to reach");
  });

  it("leaves every other BROADCAST movement to the generic counter line", () => {
    // No attack in the batch ⇒ this is income (ending movement on a multi-zone
    // space) or some future card's spend, and the generic wording is correct.
    expect(rangeSpendLineFor([], "p1", "BROADCAST", 2, v)).toBeNull();
    // Wrong counter, wrong hero, or a non-decrease: all fall through.
    expect(rangeSpendLineFor(declared, "p1", "MITIGATION", 2, v)).toBeNull();
    expect(rangeSpendLineFor(declared, "p2", "BROADCAST", 2, v)).toBeNull();
    expect(rangeSpendLineFor(declared, "p1", "BROADCAST", 0, v)).toBeNull();
  });

  it("ignores an ATTACK_DECLARED by somebody else's fighter", () => {
    const theirs = [{ type: "ATTACK_DECLARED", attacker: "p2/hero", target: "p1/hero" }];
    expect(rangeSpendLineFor(theirs, "p1", "BROADCAST", 2, v)).toBeNull();
  });
});
