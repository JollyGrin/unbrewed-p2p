import { describe, expect, test } from "@jest/globals";
import { turnStripFor, yourTurnCueDue } from "./turnStrip";
import type { PlayerView } from "./protocol";

const view = (over: Partial<PlayerView>): PlayerView =>
  ({ you: "p1", activePlayer: "p1", phase: "PLAY", turnNumber: 3, actionsRemaining: 2, winner: null, ...over } as unknown as PlayerView);
const nameOf = (id: string) => (id === "p2" ? "King Kong" : "Me");

describe("turnStripFor", () => {
  test("shows my turn with the turn number and one pip per remaining action", () => {
    expect(turnStripFor(view({}), nameOf)).toEqual({ tone: "mine", label: "YOUR TURN · TURN 3", pips: 2 });
  });

  test("names whoever is on turn otherwise, without pips", () => {
    expect(turnStripFor(view({ activePlayer: "p2" }), nameOf)).toEqual({ tone: "theirs", label: "KING KONG'S TURN…", pips: 0 });
  });

  test("says SETUP during setup instead of a turn-0 label", () => {
    expect(turnStripFor(view({ phase: "SETUP", turnNumber: 0, activePlayer: "p2" }), nameOf)).toEqual({ tone: "setup", label: "SETUP", pips: 0 });
  });

  test("disappears once the game has a winner", () => {
    expect(turnStripFor(view({ winner: "p1" } as Partial<PlayerView>), nameOf)).toBeNull();
  });
});

describe("yourTurnCueDue", () => {
  const at = (activePlayer: string, turnNumber: number, over: Partial<PlayerView> = {}) =>
    view({ activePlayer, turnNumber, ...over } as Partial<PlayerView>);

  test("fires when the turn passes from another seat to me", () => {
    expect(yourTurnCueDue(at("p2", 3), at("p1", 4))).toBe(true);
  });

  test("stays quiet while it simply remains my turn", () => {
    expect(yourTurnCueDue(at("p1", 4), at("p1", 4))).toBe(false);
  });

  test("stays quiet when snapshots step back to an earlier turn (undo / replayed catch-up)", () => {
    expect(yourTurnCueDue(at("p2", 4), at("p1", 3))).toBe(false);
  });

  test("stays quiet on the first view, during setup and once the game is won", () => {
    expect(yourTurnCueDue(null, at("p1", 4))).toBe(false);
    expect(yourTurnCueDue(at("p2", 0, { phase: "SETUP" }), at("p1", 0, { phase: "SETUP" }))).toBe(false);
    expect(yourTurnCueDue(at("p2", 3), at("p1", 4, { winner: "p1" } as Partial<PlayerView>))).toBe(false);
  });
});
