/**
 * God-view render adapter (#122): folds a both-sides-face-up ReplayStep back into
 * the redacted PlayerView shape the live table components consume.
 */
import type { ReplayExpansion, ReplayStep } from "./protocol";
import { opponentHand, stepIndexForTurn, toPlayerView, turnMarkers } from "./godView";

const step = (index: number, turnNumber: number): ReplayStep => ({
  index,
  phase: "PLAY",
  turnNumber,
  activePlayer: "p1",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  fighters: [],
  tokens: [],
  combat: null,
  prompt: null,
  winner: null,
  players: {
    p1: { heroId: "king-kong", hand: ["king-kong/clobber#1"], deckCount: 20, discard: ["king-kong/roar#1"], committedCard: null, counters: { rage: 1 } },
    p2: { heroId: "thrall", hand: ["thrall/hex#1", "thrall/hex#2"], deckCount: 18, discard: [], committedCard: "thrall/hex#3", counters: {} },
  },
});

const exp: Pick<ReplayExpansion, "map" | "catalog"> = {
  map: { schemaVersion: "1.0", id: "mended-drum", meta: { title: "Drum", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
};

describe("toPlayerView", () => {
  it("maps the focused seat to self and the other to opponent (counts only there)", () => {
    const v = toPlayerView(step(3, 4), exp, "p1");
    expect(v.you).toBe("p1");
    expect(v.self.heroId).toBe("king-kong");
    expect(v.self.hand).toEqual(["king-kong/clobber#1"]);
    expect(v.self.counters).toEqual({ rage: 1 });
    expect(v.opponent?.id).toBe("p2");
    expect(v.opponent?.handCount).toBe(2);
    expect(v.opponent?.hasCommitted).toBe(true);
    // the PlayerView opponent shape never carries the hand array itself
    expect((v.opponent as unknown as Record<string, unknown>).hand).toBeUndefined();
  });

  it("flips perspective when focus is p2", () => {
    const v = toPlayerView(step(3, 4), exp, "p2");
    expect(v.you).toBe("p2");
    expect(v.self.heroId).toBe("thrall");
    expect(v.self.committedCard).toBe("thrall/hex#3");
    expect(v.opponent?.heroId).toBe("king-kong");
    expect(v.opponent?.handCount).toBe(1);
  });
});

describe("opponentHand", () => {
  it("exposes the OTHER seat's real hand (God-view only)", () => {
    expect(opponentHand(step(0, 1), "p1")).toEqual(["thrall/hex#1", "thrall/hex#2"]);
    expect(opponentHand(step(0, 1), "p2")).toEqual(["king-kong/clobber#1"]);
  });
});

describe("turn navigation", () => {
  const steps = [step(0, 0), step(1, 1), step(2, 1), step(3, 2), step(4, 3)];
  it("lists distinct ascending turn markers", () => {
    expect(turnMarkers(steps)).toEqual([0, 1, 2, 3]);
  });
  it("jumps to the first step at/after a turn", () => {
    expect(stepIndexForTurn(steps, 1)).toBe(1);
    expect(stepIndexForTurn(steps, 2)).toBe(3);
    expect(stepIndexForTurn(steps, 99)).toBe(steps.length - 1);
  });
});
