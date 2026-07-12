/**
 * God-view render adapter (#122): folds a both-sides-face-up ReplayStep back into
 * the redacted PlayerView shape the live table components consume.
 */
import type { ReplayExpansion, ReplayStep, ReplayStepPlayer } from "./protocol";
import { opponentHand, opponentSeats, seatIds, stepIndexForTurn, toPlayerView, turnMarkers } from "./godView";
import { deriveTeams } from "./teams";

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

const seat = (heroId: string, hand: string[]): ReplayStepPlayer => ({
  heroId,
  hand,
  deckCount: 10,
  discard: [],
  committedCard: null,
  counters: {},
});

// ffa-3: three seats face-up. `players` (typed p1/p2 required) carries p3 too.
const ffa3 = (): ReplayStep => ({
  ...step(0, 1),
  players: {
    p1: seat("king-kong", ["king-kong/clobber#1"]),
    p2: seat("thrall", ["thrall/hex#1"]),
    p3: seat("r2-d2", ["r2-d2/beep#1", "r2-d2/beep#2"]),
  } as ReplayStep["players"],
});

// team-2v2: four seats, teammates share a `team` value (mirrors the engine's
// uniform `team` on replay steps). p1+p3 vs p2+p4.
const team2v2 = (): ReplayStep => ({
  ...step(0, 1),
  players: {
    p1: { ...seat("king-kong", ["king-kong/clobber#1"]), team: "A" },
    p2: { ...seat("thrall", ["thrall/hex#1"]), team: "B" },
    p3: { ...seat("r2-d2", ["r2-d2/beep#1"]), team: "A" },
    p4: { ...seat("piper", ["piper/pipe#1"]), team: "B" },
  } as ReplayStep["players"],
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

describe("multiplayer (ffa-3)", () => {
  it("lists every seat in runtime order", () => {
    expect(seatIds(ffa3())).toEqual(["p1", "p2", "p3"]);
  });

  it("builds a plate per seat, with the focus seat marked self", () => {
    const v = toPlayerView(ffa3(), exp, "p3");
    expect(v.you).toBe("p3");
    expect(v.players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    const focusSeat = v.players.find((p) => p.id === "p3");
    expect(focusSeat?.you).toBe(true);
    expect(focusSeat?.hand).toEqual(["r2-d2/beep#1", "r2-d2/beep#2"]);
    // non-focus seats never carry the hand array (counts only), like the live view
    expect(v.players.filter((p) => !p.you).every((p) => p.hand === undefined)).toBe(true);
    // opponent alias = first non-focus seat in runtime order
    expect(v.opponent?.id).toBe("p1");
  });

  it("fans every non-focus seat's hand at the top", () => {
    const seats = opponentSeats(ffa3(), "p1");
    expect(seats.map((s) => s.id)).toEqual(["p2", "p3"]);
    expect(seats.map((s) => s.heroId)).toEqual(["thrall", "r2-d2"]);
    expect(seats[1].hand).toEqual(["r2-d2/beep#1", "r2-d2/beep#2"]);
  });

  it("keeps the duel top-fan identical (one opponent)", () => {
    expect(opponentSeats(step(0, 1), "p1").map((s) => s.id)).toEqual(["p2"]);
    expect(opponentSeats(step(0, 1), "p1")[0].hand).toEqual(["thrall/hex#1", "thrall/hex#2"]);
  });
});

describe("teams (2v2 god-view)", () => {
  it("carries each seat's team through to the mapped view players (#211)", () => {
    const v = toPlayerView(team2v2(), exp, "p1");
    expect(v.players.map((p) => p.team)).toEqual(["A", "B", "A", "B"]);
  });

  it("derives a real team format from the scrubbed step (ALLY chips light up)", () => {
    // Same derivation ProHud runs — scrubbing a 2v2 replay must match live play.
    const v = toPlayerView(team2v2(), exp, "p1");
    const t = deriveTeams(v.players, v.you);
    expect(t.active).toBe(true);
    expect(t.allies).toEqual(["p3"]);
    expect(t.relationOf("p3")).toBe("ally");
    expect(t.relationOf("p2")).toBe("hostile");
  });

  it("is absent-safe for pre-team bundles (no team → no team chrome)", () => {
    const v = toPlayerView(step(0, 1), exp, "p1");
    expect(v.players.every((p) => p.team === undefined)).toBe(true);
    expect(deriveTeams(v.players, v.you).active).toBe(false);
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
