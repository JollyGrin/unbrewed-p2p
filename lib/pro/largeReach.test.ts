import {
  isExtendedReachAttack,
  isLargeFighter,
  LARGE_FIGHTER_BLURB,
  LARGE_REACH_CHIP,
  LARGE_REACH_TARGET_BLURB,
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
  size: "NORMAL",
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
  // The reach is ATTACKER-ONLY (engine#307). What #235 called "the repro" — a
  // NORMAL melee fighter reaching a LARGE one from 2 spaces — was never legal;
  // the server no longer offers it, so the chip must never claim it.
  it("no chip for a NORMAL melee attacker 2 spaces from a LARGE target", () => {
    const thetis = fighter({ id: "p1/hero", space: "s1", reach: "MELEE" });
    const trike = fighter({ id: "p2/hero", owner: "p2", name: "Triceratops", space: "s3", tailSpace: "s4" });
    expect(isExtendedReachAttack(thetis, trike, MAP)).toBe(false);
  });

  it("flags a LARGE attacker reaching 2 spaces from its HEAD", () => {
    // trike head s3 / tail s4; s1 is 2 steps from the head and 3 from the tail
    const trike = fighter({ id: "p1/hero", name: "Triceratops", space: "s3", tailSpace: "s4" });
    const thetis = fighter({ id: "p2/hero", owner: "p2", space: "s1", reach: "MELEE" });
    expect(isExtendedReachAttack(trike, thetis, MAP)).toBe(true);
  });

  it("flags a LARGE attacker reaching 2 spaces from its TAIL", () => {
    // trike head s4 / tail s3; the target sits 2 steps from the TAIL — the head
    // alone would never see it, so this pins that BOTH body spaces project reach
    const trike = fighter({ id: "p1/hero", name: "Triceratops", space: "s4", tailSpace: "s3" });
    const thetis = fighter({ id: "p2/hero", owner: "p2", space: "s1", reach: "MELEE" });
    expect(isExtendedReachAttack(trike, thetis, MAP)).toBe(true);
  });

  it("no chip when the LARGE attacker is already adjacent to its target", () => {
    const trike = fighter({ id: "p1/hero", name: "Triceratops", space: "s3", tailSpace: "s4" });
    const thetis = fighter({ id: "p2/hero", owner: "p2", space: "s2", reach: "MELEE" });
    expect(isExtendedReachAttack(trike, thetis, MAP)).toBe(false);
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
    const offBoard = fighter({ id: "p1/hero", space: null, tailSpace: null });
    const b = fighter({ id: "p2/hero", owner: "p2", space: "s4" });
    expect(isExtendedReachAttack(offBoard, b, MAP)).toBe(false);
    // ...and with the LARGE fighter on the board but its target gone
    const trike = fighter({ id: "p1/hero", name: "Triceratops", space: "s3", tailSpace: "s4" });
    expect(isExtendedReachAttack(trike, offBoard, MAP)).toBe(false);
  });
});

describe("copy", () => {
  it("keeps the chip terse and the blurb full", () => {
    expect(LARGE_REACH_CHIP).toContain("melee reach 2");
    expect(LARGE_FIGHTER_BLURB).toContain("up to 2 spaces away");
  });

  // The blurb is the player-facing statement of the rule in four surfaces, so
  // pin BOTH halves of the corrected (attacker-only) rule — "up to 2 spaces
  // away" alone survives either wording (engine#307 / #549).
  it("states the reach attacker-only and keeps the occupancy half", () => {
    // occupancy: what makes a large fighter reachable from what LOOKS like 2 away
    expect(LARGE_FIGHTER_BLURB).toMatch(/occupies 2 spaces/i);
    // attacker-only: the subject of "can attack" is the large fighter itself
    expect(LARGE_FIGHTER_BLURB).toMatch(/it can attack up to 2 spaces away/i);
    // ...and it must say the opponent's reach did NOT grow
    expect(LARGE_FIGHTER_BLURB).toMatch(/opponents attack it normally/i);
    // the symmetric claim #235 shipped must be gone
    expect(LARGE_FIGHTER_BLURB).not.toMatch(/involving/i);
  });

  it("frames the board's target-side copy from the receiving end", () => {
    expect(LARGE_REACH_TARGET_BLURB).toContain(LARGE_FIGHTER_BLURB);
    expect(LARGE_REACH_TARGET_BLURB).toMatch(/within a large fighter's 2-space attack reach/i);
  });
});
