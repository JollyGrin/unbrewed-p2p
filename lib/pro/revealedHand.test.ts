import type { GameEvent } from "./protocol";
import { advanceRevealedHand as advance, EMPTY_REVEAL_STATE, RevealState } from "./revealedHand";

const played: GameEvent = { type: "SCHEME_PLAYED", player: "p1", card: "superman/keen-hearing#1" };
const rev = (card: string, player: "p1" | "p2" = "p2"): GameEvent => ({ type: "CARD_REVEALED", player, card });

// panel-only view for the single-batch cases
const advanceRevealedHand = (
  prev: RevealState["panel"],
  events: GameEvent[],
  turn: number
): RevealState["panel"] => advance({ ...EMPTY_REVEAL_STATE, panel: prev }, events, turn).panel;

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

  it("does not fold a later unrelated reveal in the same batch into the hand", () => {
    const events: GameEvent[] = [
      played,
      rev("a/x#1"),
      { type: "ACTION_SPENT", player: "p1", action: "SCHEME" },
      rev("a/deck-top#7"),
    ];
    expect(advanceRevealedHand(null, events, 3)?.cards).toEqual(["a/x#1"]);
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

  describe("across batches (ffa: opponent prompt between the play and the reveal)", () => {
    const first = advance(EMPTY_REVEAL_STATE, [played, { type: "PROMPT_OPENED", player: "p1", kind: "CHOOSE_TARGET", promptId: "q" }], 2);

    it("remembers who played it until the reveal arrives", () => {
      expect(first).toEqual({ panel: null, armed: "p1" });
      const second = advance(first, [rev("a/x#1"), rev("a/y#2")], 2);
      expect(second.panel).toEqual({ revealer: "p1", owner: "p2", cards: ["a/x#1", "a/y#2"], turn: 2 });
      expect(second.armed).toBeNull();
    });

    it("stops waiting once the player acts again or the turn ends (empty hand → no reveal)", () => {
      const acted = advance(first, [{ type: "ACTION_SPENT", player: "p1", action: "ATTACK" }, rev("a/deck#9")], 2);
      expect(acted).toEqual(EMPTY_REVEAL_STATE);
      const ended = advance(first, [{ type: "TURN_ENDED", player: "p1" }, rev("a/deck#9")], 2);
      expect(ended).toEqual(EMPTY_REVEAL_STATE);
    });
  });
});
