import { diffTokenGestures } from "./tokenLife";
import { PlayerView, ViewCombat, ViewFighter, ProMapDef } from "./protocol";

const map: ProMapDef = {
  schemaVersion: "1",
  id: "m",
  meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false },
  zones: [],
  // a1 (left) and a2 (right) — a horizontal axis so recoil/lunge point along +x
  spaces: [
    { id: "a1", x: 0.2, y: 0.5, zones: [], adjacentTo: ["a2"] },
    { id: "a2", x: 0.8, y: 0.5, zones: [], adjacentTo: ["a1"] },
  ],
};

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Hero",
  space: "a1",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  defeated: false,
  ...over,
});

const combat = (over: Partial<ViewCombat>): ViewCombat => ({
  attackerPlayer: "p1",
  defenderPlayer: "p2",
  attacker: "p1/hero",
  target: "p2/hero",
  stage: "DAMAGE",
  attackerCard: null,
  defenderCard: null,
  outcome: null,
  attackDamageDealt: null,
  ...over,
});

const view = (over: Partial<PlayerView>): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map,
  catalog: {},
  fighters: [
    fighter({ id: "p1/hero", owner: "p1", space: "a1" }),
    fighter({ id: "p2/hero", owner: "p2", name: "Villain", space: "a2" }),
  ],
  tokens: [],
  self: { id: "p1", heroId: "h1", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false },
  opponent: { id: "p2", heroId: "h2", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
  players: [
    { id: "p1", heroId: "h1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
    { id: "p2", heroId: "h2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

describe("diffTokenGestures", () => {
  it("emits nothing on the first snapshot (join/reconnect is not a play)", () => {
    expect(diffTokenGestures(null, view({}), [])).toEqual({});
  });

  it("emits nothing when nothing changed", () => {
    const v = view({ combat: combat({}) });
    expect(diffTokenGestures(v, v, [])).toEqual({});
  });

  it("recoils the defender away from the attacker and lunges the attacker toward it", () => {
    const c = combat({});
    const prev = view({ combat: c });
    const next = view({
      combat: c,
      fighters: [fighter({ id: "p1/hero", space: "a1" }), fighter({ id: "p2/hero", owner: "p2", space: "a2", hp: 8 })],
    });
    const g = diffTokenGestures(prev, next, []);
    // defender recoils; attacker→target axis is +x (a1→a2), so it recoils +x
    expect(g["p2/hero"].kind).toBe("recoil");
    expect(g["p2/hero"].amount).toBe(2);
    expect(g["p2/hero"].dx).toBeCloseTo(1);
    expect(g["p2/hero"].dy).toBeCloseTo(0);
    // attacker lunges along the same +x axis
    expect(g["p1/hero"].kind).toBe("lunge");
    expect(g["p1/hero"].dx).toBeCloseTo(1);
  });

  it("flinches in place (zero axis) for non-combat damage", () => {
    const prev = view({ combat: null });
    const next = view({
      combat: null,
      fighters: [fighter({ id: "p1/hero", space: "a1", hp: 7 }), fighter({ id: "p2/hero", owner: "p2", space: "a2" })],
    });
    const g = diffTokenGestures(prev, next, []);
    expect(g["p1/hero"].kind).toBe("recoil");
    expect(g["p1/hero"].dx).toBe(0);
    expect(g["p1/hero"].dy).toBe(0);
    expect(g["p1/hero"].amount).toBe(3);
    // no combat → no attacker → no lunge
    expect(Object.keys(g)).toEqual(["p1/hero"]);
  });

  it("braces the target and lunges the attacker on a blocked strike", () => {
    const c = combat({ outcome: "RESOLVED" as ViewCombat["outcome"], attackDamageDealt: 0 });
    const prev = view({ combat: combat({ outcome: null, attackDamageDealt: null }) });
    const next = view({ combat: c });
    const g = diffTokenGestures(prev, next, []);
    expect(g["p2/hero"].kind).toBe("brace");
    expect(g["p1/hero"].kind).toBe("lunge");
  });

  it("topples on defeat, carrying the fighter's last space, and beats a same-snapshot recoil", () => {
    const c = combat({});
    const prev = view({ combat: c });
    const next = view({
      combat: c,
      fighters: [
        fighter({ id: "p1/hero", space: "a1" }),
        fighter({ id: "p2/hero", owner: "p2", space: "a2", hp: 0, defeated: true }),
      ],
    });
    const g = diffTokenGestures(prev, next, []);
    expect(g["p2/hero"].kind).toBe("topple");
    expect(g["p2/hero"].space).toBe("a2");
  });
});
