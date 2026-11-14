import type { GameEvent, PileEntry } from "./protocol";
import {
  PILE_TRACKS,
  pileTrackFor,
  trackCompletionOf,
  trackGoalSubtitle,
  trackRewardText,
  trackTuckLine,
} from "./pileTracks";

const A = (n: number) => `pomni/adventure-${n}#1`;
const R = (n: number) => `pomni/reward-${n}#1`;

// The seat's piles at setup, exactly as the engine seeds them (pomni.rules.ts).
const SETUP: Record<string, PileEntry[]> = {
  ADV_PENDING: [1, 2, 3, 4, 5].map(A),
  ADV_REWARDS: [1, 2, 3, 4, 5].map(R),
};

describe("PILE_TRACKS registry", () => {
  it("pins POMNI's pile keys and card ids against the engine rules file", () => {
    const [pomni] = PILE_TRACKS;
    expect(pomni.heroes).toEqual(["pomni"]);
    expect(pomni.piles).toEqual({
      active: "ADV_ACTIVE",
      pending: "ADV_PENDING",
      held: "ADV_DONE",
      spent: "EXILE",
      goalBack: "ADV_FLIPPED",
      rewardBack: "ADV_REWARDS",
    });
    expect(pomni.steps).toEqual(
      [1, 2, 3, 4, 5].map((n) => ({ n, goal: `pomni/adventure-${n}`, reward: `pomni/reward-${n}` }))
    );
    expect(pomni.repeatable).toEqual({ step: 2, lapFlag: "POMNI_ADV2_ONCE" });
    expect(pomni.removesFromOthers).toBe(2);
  });
});

describe("pileTrackFor", () => {
  it("is null for a hero with no track, and for a track hero whose seat carries no track pile", () => {
    expect(pileTrackFor("king-kong", SETUP)).toBeNull();
    expect(pileTrackFor(undefined, SETUP)).toBeNull();
    expect(pileTrackFor("pomni", undefined)).toBeNull();
    expect(pileTrackFor("pomni", {})).toBeNull();
    expect(pileTrackFor("pomni", { EXILE: ["pomni/ricochet-super-move#1"] })).toBeNull();
  });

  it("before the first turn: nothing active, Adventure 1 is next, nothing completed", () => {
    const t = pileTrackFor("pomni", SETUP)!;
    expect(t.active).toBeNull();
    expect(t.next?.n).toBe(1);
    expect(t.completed).toBe(0);
    expect(t.steps.map((s) => s.state)).toEqual(["upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(t.steps.map((s) => s.faceUp)).toEqual([1, 2, 3, 4, 5].map(A));
  });

  it("mid-game: one active, held rewards in card order, the reward face is the one face up", () => {
    const t = pileTrackFor("pomni", {
      ADV_ACTIVE: [A(3)],
      ADV_PENDING: [A(4), A(5)],
      ADV_DONE: [R(2), R(1)], // pile order is earn order, not card order
      ADV_FLIPPED: [A(1), A(2)],
      ADV_REWARDS: [R(3), R(4), R(5)],
    })!;
    expect(t.active?.n).toBe(3);
    expect(t.next).toBeNull();
    expect(t.held.map((s) => s.n)).toEqual([1, 2]);
    expect(t.completed).toBe(2);
    expect(t.steps.map((s) => s.state)).toEqual(["held", "held", "active", "upcoming", "upcoming"]);
    expect(t.steps[0]).toMatchObject({ goal: A(1), reward: R(1), faceUp: R(1) });
    expect(t.steps[2]).toMatchObject({ goal: A(3), reward: R(3), faceUp: A(3) });
  });

  it("a used Reward 3 is SPENT: out of the completed count, but not back in the deck", () => {
    const t = pileTrackFor("pomni", {
      ADV_ACTIVE: [A(4)],
      ADV_PENDING: [A(5), A(2)],
      ADV_DONE: [R(1)],
      ADV_FLIPPED: [A(1), A(3)],
      ADV_REWARDS: [R(4), R(5), R(2)],
      // the sealed pile also holds ordinary cards — only track faces count as steps
      EXILE: [R(3), "pomni/ricochet-super-move#1"],
    })!;
    expect(t.steps.map((s) => s.state)).toEqual(["held", "upcoming", "spent", "active", "upcoming"]);
    // two cards show their reward side; only one reward still counts for her cards
    expect(t.completed).toBe(2);
    expect(t.held.map((s) => s.n)).toEqual([1]);
    expect(t.steps[2].faceUp).toBe(R(3));
  });

  it("orders the next placement by the engine's ladder: a returned Adventure 2 goes last", () => {
    const piles = {
      ADV_PENDING: [A(2), A(4), A(5)], // array order is NOT the play order
      ADV_DONE: [R(1), R(3)],
      ADV_FLIPPED: [A(1), A(3)],
      ADV_REWARDS: [R(4), R(5), R(2)],
    };
    // first lap not finished (no latch): 2 is simply the lowest number left
    expect(pileTrackFor("pomni", piles)!.next?.n).toBe(2);
    // Adventure 2 has been completed once: it waits behind 4 and 5
    expect(pileTrackFor("pomni", piles, { POMNI_ADV2_ONCE: true })!.next?.n).toBe(4);
    // ... and is placed once it is the only one left
    expect(
      pileTrackFor("pomni", { ...piles, ADV_PENDING: [A(2)], ADV_ACTIVE: [] }, { POMNI_ADV2_ONCE: true })!.next?.n
    ).toBe(2);
  });

  it("reads v33 object pile entries the same as bare ids", () => {
    const t = pileTrackFor("pomni", { ADV_ACTIVE: [{ card: A(1), controller: "p1" }], ADV_PENDING: [A(2)] })!;
    expect(t.active?.n).toBe(1);
  });
});

describe("display helpers", () => {
  it("takes the goal's name from after the colon and drops the stray newline / no-break space", () => {
    expect(trackGoalSubtitle("Adventure1: YOur new Home")).toBe("YOur new Home");
    expect(trackGoalSubtitle("Adventure 2:President Pomni 2: Last stand")).toBe("President Pomni 2: Last stand");
    expect(trackGoalSubtitle("Adventure 4:\nPomni’s Perilous Pilgrimage")).toBe("Pomni’s Perilous Pilgrimage");
    expect(trackGoalSubtitle("Adventure 5: \nOvertime at Spudsy's Delivery Service")).toBe(
      "Overtime at Spudsy's Delivery Service"
    );
    expect(trackGoalSubtitle("Reward 1")).toBe("");
    expect(trackGoalSubtitle(undefined)).toBe("");
  });

  it("strips a reward face's own leading label, whatever its casing", () => {
    expect(trackRewardText("Reward: Flip your charcter card. Pomni is a ranged fighter.")).toBe(
      "Flip your charcter card. Pomni is a ranged fighter."
    );
    expect(trackRewardText("REWARD: Once per turn")).toBe("Once per turn");
    expect(trackRewardText(undefined)).toBe("");
  });
});

describe("trackTuckLine (feed)", () => {
  const titles: Record<string, string> = {
    "pomni/adventure-2": "Adventure 2:President Pomni 2: Last stand (scheme)",
    "pomni/adventure-5": "Adventure 5: \nOvertime at Spudsy's Delivery Service (scheme)",
    "darth-vader/form-v": "Form V (0/1)",
    "pomni/ricochet-super-move": "ricochet super move (3/1)",
  };
  // p1 is the viewer. Default table: p1 Darth Vader, p2 POMNI.
  const DUEL: Record<string, string> = { p1: "darth-vader", p2: "pomni" };
  const ctx = (you = "p1", table: Record<string, string> | null = DUEL) => ({
    you,
    label: (c: string) => titles[c.split("#")[0]] ?? c,
    seat: (p: string) => (p === you ? "You" : "Opponent"),
    ...(table ? { heroOf: (p: string) => table[p] } : {}),
  });
  const tuck = (player: string, card: string, pile: string): GameEvent =>
    ({ type: "CARD_TUCKED", player, card, pile }) as GameEvent;
  const line = (events: GameEvent[], i: number, you?: string, table?: Record<string, string> | null) => {
    const e = events[i];
    if (e.type !== "CARD_TUCKED") throw new Error("not a tuck");
    return trackTuckLine(e, events, i, ctx(you, table));
  };

  it("names a placed Adventure, with its title cleaned up and no card-stats suffix", () => {
    expect(line([tuck("p2", A(2), "ADV_ACTIVE")], 0)).toEqual({
      text: "Opponent: Adventure 2 is now active — President Pomni 2: Last stand",
      actor: "p2",
      cards: [A(2)],
    });
    expect(line([tuck("p1", A(5), "ADV_ACTIVE")], 0)?.text).toBe(
      "You: Adventure 5 is now active — Overtime at Spudsy's Delivery Service"
    );
  });

  it("a completion is ONE line: the reward landing; the Adventure face flipping is silent", () => {
    const batch = [tuck("p2", A(1), "ADV_FLIPPED"), tuck("p2", R(1), "ADV_DONE")];
    expect(line(batch, 0)).toBeNull();
    expect(line(batch, 1)?.text).toBe("Opponent completed Adventure 1 — Reward 1 earned");
  });

  it("Reward 2 flipping back is one line; Reward 3 leaving the game is another", () => {
    const back = [tuck("p2", R(2), "ADV_REWARDS"), tuck("p2", A(2), "ADV_PENDING")];
    expect(line(back, 0)?.text).toBe(
      "Opponent used Reward 2 — Adventure 2 goes back to the bottom of the Adventure deck"
    );
    expect(line(back, 1)).toBeNull();
    expect(line([tuck("p1", R(3), "EXILE")], 0)?.text).toBe("You used Reward 3 — it is removed from the game");
  });

  it("a card Reward 2 removes from ANOTHER seat is credited to the player whose effect did it", () => {
    // exactly the batch the engine sends: Pomni (p2) answers the pick, her hero trigger
    // resolves, and the tuck lands on the VICTIM's seat (player: p1) with no actor on it
    const batch: GameEvent[] = [
      { type: "PROMPT_RESOLVED", player: "p2", promptId: "p50", optionId: "darth-vader/form-v#2" } as GameEvent,
      { type: "EFFECT_RESOLVING", source: "hero:p2", window: "TRIGGER", player: "p2" } as GameEvent,
      tuck("p1", "darth-vader/form-v#2", "EXILE"),
    ];
    // the victim's screen
    expect(line(batch, 2, "p1")).toEqual({
      text: "Opponent removed your Form V from the game (Reward 2)",
      actor: "p2",
      cards: ["darth-vader/form-v#2"],
    });
    // Pomni's own screen
    expect(line(batch, 2, "p2")?.text).toBe("You removed Opponent's Form V from the game (Reward 2)");
  });

  it("a card its own owner removes (ricochet super move) is not credited to anyone else", () => {
    const batch: GameEvent[] = [
      { type: "EFFECT_RESOLVING", source: "pomni/ricochet-super-move#2", window: "AFTER", player: "p2" } as GameEvent,
      tuck("p2", "pomni/ricochet-super-move#2", "EXILE"),
    ];
    expect(line(batch, 1)).toEqual({
      text: "Opponent: ricochet super move is removed from the game",
      actor: "p2",
      cards: ["pomni/ricochet-super-move#2"],
    });
  });

  // EXILE is the engine's GENERIC removed pile: Kenshiro (live before POMNI) exiles an
  // opponent's discards with Vacuum Finger Strike and his own Death Omen Star.
  describe("the EXILE key is not POMNI's alone", () => {
    const vacuum = (actor: string, victim: string, card: string): GameEvent[] => [
      { type: "PROMPT_RESOLVED", player: actor, promptId: "p9", optionId: card } as GameEvent,
      { type: "EFFECT_RESOLVING", source: "kenshiro/hokuto-vacuum-finger-strike#1", window: "AFTER", player: actor } as GameEvent,
      tuck(victim, card, "EXILE"),
    ];

    it("Kenshiro vs Darth Vader: his removals are NOT narrated as a Reward 2, from either seat", () => {
      const table = { p1: "darth-vader", p2: "kenshiro" };
      const batch = vacuum("p2", "p1", "darth-vader/form-v#2");
      expect(line(batch, 2, "p1", table)).toBeUndefined();
      expect(line(batch, 2, "p2", table)).toBeUndefined();
      // his own Death Omen Star leaving the game is his deck's business too
      const own: GameEvent[] = [
        { type: "EFFECT_RESOLVING", source: "kenshiro/death-omen-star#1", window: "AFTER", player: "p2" } as GameEvent,
        tuck("p2", "kenshiro/death-omen-star#1", "EXILE"),
      ];
      expect(line(own, 1, "p1", table)).toBeUndefined();
    });

    it("Pomni vs Kenshiro: only the removals HER effect did carry her reward's name", () => {
      const table = { p1: "kenshiro", p2: "pomni" };
      // Kenshiro (p1) exiles a card out of Pomni's discard pile: not a Reward 2
      expect(line(vacuum("p1", "p2", "pomni/ricochet-super-move#1"), 2, "p1", table)).toBeUndefined();
      expect(line(vacuum("p1", "p2", "pomni/ricochet-super-move#1"), 2, "p2", table)).toBeUndefined();
      // Pomni (p2) uses Reward 2 on Kenshiro's discard pile: hers
      const hers: GameEvent[] = [
        { type: "EFFECT_RESOLVING", source: "hero:p2", window: "TRIGGER", player: "p2" } as GameEvent,
        tuck("p1", "darth-vader/form-v#2", "EXILE"),
      ];
      expect(line(hers, 1, "p1", table)?.text).toBe("Opponent removed your Form V from the game (Reward 2)");
      // her own track faces are recognised by card id whoever else is seated
      expect(line([tuck("p2", R(3), "EXILE")], 0, "p1", table)?.text).toBe(
        "Opponent used Reward 3 — it is removed from the game"
      );
    });

    it("with no way to know who is seated, an ordinary card's removal is left alone", () => {
      const batch: GameEvent[] = [
        { type: "EFFECT_RESOLVING", source: "hero:p2", window: "TRIGGER", player: "p2" } as GameEvent,
        tuck("p1", "darth-vader/form-v#2", "EXILE"),
      ];
      expect(line(batch, 1, "p1", null)).toBeUndefined();
    });

    it("a Pomni mirror credits the seat whose effect it was", () => {
      const table = { p1: "pomni", p2: "pomni" };
      const batch: GameEvent[] = [
        { type: "EFFECT_RESOLVING", source: "hero:p2", window: "TRIGGER", player: "p2" } as GameEvent,
        tuck("p1", "pomni/ricochet-super-move#1", "EXILE"),
      ];
      expect(line(batch, 1, "p1", table)?.text).toBe(
        "Opponent removed your ricochet super move from the game (Reward 2)"
      );
    });
  });

  it("leaves every other deck's tucks to the caller", () => {
    expect(line([tuck("p1", "luke-skywalker/training-size-matters-not#1", "TRAINING")], 0)).toBeUndefined();
    expect(line([tuck("p2", "boba-fett/bounty#1", "BOUNTY_PAYMENT")], 0)).toBeUndefined();
  });
});

describe("trackCompletionOf", () => {
  it("is the reward face landing in the held pile, and nothing else", () => {
    expect(trackCompletionOf({ type: "CARD_TUCKED", player: "p2", card: R(4), pile: "ADV_DONE" } as GameEvent)).toEqual({
      player: "p2",
      goalWord: "Adventure",
      n: 4,
    });
    expect(trackCompletionOf({ type: "CARD_TUCKED", player: "p2", card: A(4), pile: "ADV_FLIPPED" } as GameEvent)).toBeNull();
    expect(trackCompletionOf({ type: "CARD_TUCKED", player: "p2", card: R(2), pile: "ADV_REWARDS" } as GameEvent)).toBeNull();
    expect(trackCompletionOf({ type: "CARD_TUCKED", player: "p2", card: R(3), pile: "EXILE" } as GameEvent)).toBeNull();
    expect(trackCompletionOf({ type: "REACH_CHANGED", fighter: "p2/hero", reach: "RANGED" } as GameEvent)).toBeNull();
  });
});
