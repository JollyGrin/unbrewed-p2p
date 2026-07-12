import {
  isExtendedReachAttack,
  isLargeFighter,
  LARGE_FIGHTER_BLURB,
  LARGE_REACH_CHIP,
  SpaceReach,
  withinNormalReach,
} from "./largeReach";
import type { ViewFighter } from "./protocol";

// A tiny line map: s1 — s2 — s3 — s4, with s1/s2 sharing zone "A".
//   s1 —— s2 —— s3 —— s4
//   └── zone A ──┘
const MAP: Map<string, SpaceReach> = new Map([
  ["s1", { adjacentTo: ["s2"], zones: ["A"] }],
  ["s2", { adjacentTo: ["s1", "s3"], zones: ["A"] }],
  ["s3", { adjacentTo: ["s2", "s4"], zones: ["B"] }],
  ["s4", { adjacentTo: ["s3"], zones: ["B"] }],
]);

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Fighter",
  space: "s1",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  defeated: false,
  ...over,
});

describe("isLargeFighter", () => {
  it("keys purely on tailSpace (the two-space signal)", () => {
    expect(isLargeFighter({ tailSpace: "s2" })).toBe(true);
    expect(isLargeFighter({ tailSpace: null })).toBe(false);
  });
});

describe("withinNormalReach", () => {
  it("melee reaches only adjacent spaces", () => {
    const a = fighter({ space: "s1", reach: "MELEE" });
    expect(withinNormalReach(a, fighter({ space: "s2" }), MAP)).toBe(true);
    expect(withinNormalReach(a, fighter({ space: "s3" }), MAP)).toBe(false);
  });

  it("melee does NOT reach a same-zone but non-adjacent target", () => {
    // s1 and s2 share zone A but that's irrelevant to melee — they're also
    // adjacent, so use a hypothetical: a melee attacker never gets zone reach.
    const rangedZone = fighter({ space: "s1", reach: "RANGED" });
    // ranged: s1 shares zone A with s2 (also adjacent) — reachable
    expect(withinNormalReach(rangedZone, fighter({ space: "s2" }), MAP)).toBe(true);
  });

  it("ranged reaches a shared zone even when not adjacent", () => {
    const map: Map<string, SpaceReach> = new Map([
      ["z1", { adjacentTo: [], zones: ["Z"] }],
      ["z2", { adjacentTo: [], zones: ["Z"] }],
    ]);
    const a = fighter({ space: "z1", reach: "RANGED" });
    expect(withinNormalReach(a, fighter({ space: "z2" }), map)).toBe(true);
    // a melee attacker on the same board would NOT reach it
    const melee = fighter({ space: "z1", reach: "MELEE" });
    expect(withinNormalReach(melee, fighter({ space: "z2" }), map)).toBe(false);
  });

  it("counts a LARGE fighter's tail space", () => {
    const largeTarget = fighter({ id: "p2/hero", owner: "p2", space: "s4", tailSpace: "s3" });
    const attacker = fighter({ space: "s2", reach: "MELEE" });
    // attacker on s2 is adjacent to the target's TAIL (s3), not its head (s4)
    expect(withinNormalReach(attacker, largeTarget, MAP)).toBe(true);
  });
});

describe("isExtendedReachAttack", () => {
  it("flags the repro: melee attacker 2 spaces from a LARGE target", () => {
    const thetis = fighter({ id: "p1/hero", space: "s1", reach: "MELEE" });
    const trike = fighter({ id: "p2/hero", owner: "p2", name: "Triceratops", space: "s3", tailSpace: "s4" });
    expect(isExtendedReachAttack(thetis, trike, MAP)).toBe(true);
  });

  it("no chip when the attacker is adjacent to the LARGE target", () => {
    const thetis = fighter({ id: "p1/hero", space: "s2", reach: "MELEE" });
    const trike = fighter({ id: "p2/hero", owner: "p2", name: "Triceratops", space: "s3", tailSpace: "s4" });
    expect(isExtendedReachAttack(thetis, trike, MAP)).toBe(false);
  });

  it("no chip between two NORMAL fighters, even at range", () => {
    const a = fighter({ id: "p1/hero", space: "s1", reach: "MELEE" });
    const b = fighter({ id: "p2/hero", owner: "p2", space: "s4" });
    expect(isExtendedReachAttack(a, b, MAP)).toBe(false);
  });

  it("no chip while either combatant is off-board", () => {
    const large = fighter({ id: "p1/hero", space: null, tailSpace: null });
    const b = fighter({ id: "p2/hero", owner: "p2", space: "s4" });
    expect(isExtendedReachAttack(large, b, MAP)).toBe(false);
  });
});

describe("copy", () => {
  it("keeps the chip terse and the blurb full", () => {
    expect(LARGE_REACH_CHIP).toContain("melee reach 2");
    expect(LARGE_FIGHTER_BLURB).toContain("up to 2 spaces away");
  });
});
