import type { GameEvent } from "./protocol";
import { advanceRevealedHand } from "./revealedHand";

const played: GameEvent = { type: "SCHEME_PLAYED", player: "p1", card: "superman/keen-hearing#1" };
const rev = (card: string, player: "p1" | "p2" = "p2"): GameEvent => ({ type: "CARD_REVEALED", player, card });

describe("advanceRevealedHand", () => {
  it("captures exactly the revealed cards, labelled with the turn", () => {
    const p = advanceRevealedHand(null, [played, rev("a/x#1"), rev("a/y#2")], 3);
    expect(p).toEqual({ revealer: "p1", owner: "p2", cards: ["a/x#1", "a/y#2"], turn: 3 });
  });

  it("is identical for either seat (events are the same on both views)", () => {
    const events = [played, rev("a/x#1")];
    expect(advanceRevealedHand(null, events, 3)).toEqual(advanceRevealedHand(null, events, 3));
  });

  it("ignores reveals that are not a Keen Hearing hand reveal", () => {
    expect(advanceRevealedHand(null, [rev("a/x#1")], 3)).toBeNull();
    expect(
      advanceRevealedHand(null, [{ type: "SCHEME_PLAYED", player: "p1", card: "appa/antics#1" }, rev("a/x#1")], 3)
    ).toBeNull();
  });

  it("does not show the revealer's own revealed cards as the target's hand", () => {
    expect(advanceRevealedHand(null, [played, rev("a/x#1", "p1")], 3)).toBeNull();
  });

  it("keeps the panel across the opponent's turn and clears at the revealer's next turn start", () => {
    const held = advanceRevealedHand(null, [played, rev("a/x#1")], 3);
    expect(advanceRevealedHand(held, [{ type: "TURN_STARTED", player: "p2", turnNumber: 4 }], 4)).toEqual(held);
    expect(advanceRevealedHand(held, [{ type: "TURN_STARTED", player: "p1", turnNumber: 5 }], 5)).toBeNull();
  });

  it("a new reveal replaces the old one", () => {
    const held = advanceRevealedHand(null, [played, rev("a/x#1")], 3);
    const next = advanceRevealedHand(held, [played, rev("a/z#9")], 3);
    expect(next?.cards).toEqual(["a/z#9"]);
  });

  it("an empty-hand play (no reveal events) leaves the prior snapshot untouched", () => {
    const held = advanceRevealedHand(null, [played, rev("a/x#1")], 3);
    expect(advanceRevealedHand(held, [played], 5)).toEqual(held);
  });
});
