import { diffIncomingMove } from "./moveTween";
import { GameEvent, PlayerView, ViewFighter } from "./protocol";

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p2/hero",
  owner: "p2",
  kind: "HERO",
  name: "Baba Yaga",
  space: "b1",
  tailSpace: null,
  hp: 14,
  maxHp: 14,
  reach: "RANGED",
  size: "NORMAL",
  defeated: false,
  ...over,
});

// The viewer is always p1; p2 is the opponent whose moves should now tween.
const view = (fighters: ViewFighter[], over: Partial<PlayerView> = {}): PlayerView => ({
  you: "p1",
  phase: "PLAY",
  turnNumber: 1,
  activePlayer: "p2",
  actionsRemaining: 2,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1", id: "m", meta: { title: "m", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
  fighters,
  tokens: [],
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  ],
  combat: null,
  prompt: null,
  winner: null,
  ...over,
});

describe("diffIncomingMove", () => {
  it("returns null on the first snapshot (join/reconnect is not a play)", () => {
    expect(diffIncomingMove(null, view([fighter({})]), [])).toBeNull();
  });

  it("returns null when nothing moved", () => {
    const v = view([fighter({ space: "b1" })]);
    expect(diffIncomingMove(v, v, [])).toBeNull();
  });

  it("tweens an opponent move with a straight [from, to] when there is no event", () => {
    const prev = view([fighter({ space: "b1" })]);
    const next = view([fighter({ space: "b3" })]);
    expect(diffIncomingMove(prev, next, [])).toEqual({
      fighterId: "p2/hero",
      path: ["b1", "b3"],
    });
  });

  it("prefers the structured FIGHTER_MOVED path when present", () => {
    const prev = view([fighter({ space: "b1" })]);
    const next = view([fighter({ space: "b4" })]);
    const events: GameEvent[] = [{ type: "FIGHTER_MOVED", fighter: "p2/hero", path: ["b1", "b2", "b3", "b4"] }];
    expect(diffIncomingMove(prev, next, events)).toEqual({
      fighterId: "p2/hero",
      path: ["b1", "b2", "b3", "b4"],
    });
  });

  it("prepends the origin when the event path omits the starting space", () => {
    const prev = view([fighter({ space: "b1" })]);
    const next = view([fighter({ space: "b3" })]);
    const events: GameEvent[] = [{ type: "FIGHTER_MOVED", fighter: "p2/hero", path: ["b2", "b3"] }];
    expect(diffIncomingMove(prev, next, events)).toEqual({
      fighterId: "p2/hero",
      path: ["b1", "b2", "b3"],
    });
  });

  it("ignores a stale event path that does not end at the fighter's new space", () => {
    const prev = view([fighter({ space: "b1" })]);
    const next = view([fighter({ space: "b3" })]);
    // Path lands on b9, not the b3 the fighter actually reached — fall back to A→B.
    const events: GameEvent[] = [{ type: "FIGHTER_MOVED", fighter: "p2/hero", path: ["b1", "b9"] }];
    expect(diffIncomingMove(prev, next, events)).toEqual({
      fighterId: "p2/hero",
      path: ["b1", "b3"],
    });
  });

  it("ignores your OWN fighter's move (that tweens optimistically already)", () => {
    const mine = (space: string): ViewFighter => fighter({ id: "p1/hero", owner: "p1", space });
    const prev = view([mine("a1")]);
    const next = view([mine("a3")]);
    expect(diffIncomingMove(prev, next, [])).toBeNull();
  });

  it("ignores a placement (off-board → on-board) so setup does not tween", () => {
    const prev = view([fighter({ space: null })]);
    const next = view([fighter({ space: "b1" })]);
    expect(diffIncomingMove(prev, next, [])).toBeNull();
  });

  it("ignores a fighter leaving the board (defeat/eject to off-board)", () => {
    const prev = view([fighter({ space: "b1" })]);
    const next = view([fighter({ space: null })]);
    expect(diffIncomingMove(prev, next, [])).toBeNull();
  });

  // Incremental EFFECT movement (issue #654): a card move is no longer a
  // shortest-path teleport — the opponent may wander, so the spectator's tween has
  // to play the WHOLE submitted route, revisits and all, even when the fighter ends
  // up one space from where it started.
  it("tweens a wandering effect-move route, not the straight line to its endpoint", () => {
    const prev = view([fighter({ space: "b1" })]);
    const next = view([fighter({ space: "b2" })]); // ended 1 away after 3 hops
    const events: GameEvent[] = [
      { type: "FIGHTER_MOVED", fighter: "p2/hero", path: ["b1", "b2", "b3", "b2"] },
    ];
    expect(diffIncomingMove(prev, next, events)).toEqual({
      fighterId: "p2/hero",
      path: ["b1", "b2", "b3", "b2"],
    });
  });

  it("tweens the event-backed fighter when several opponents move in one batch", () => {
    const hero = (space: string): ViewFighter => fighter({ id: "p2/hero", space });
    const kick = (space: string): ViewFighter => fighter({ id: "p2/sidekick-1", kind: "SIDEKICK", space });
    const prev = view([hero("b1"), kick("c1")]);
    const next = view([hero("b2"), kick("c2")]);
    // Only the sidekick has a structured path — it should be the one chosen.
    const events: GameEvent[] = [{ type: "FIGHTER_MOVED", fighter: "p2/sidekick-1", path: ["c1", "c2"] }];
    expect(diffIncomingMove(prev, next, events)).toEqual({
      fighterId: "p2/sidekick-1",
      path: ["c1", "c2"],
    });
  });

  // LARGE (two-space) bodies, issue #658 / engine #415. `FIGHTER_MOVED.path` is the
  // LEADING END's route and may start from EITHER body space (the mover picks which
  // end leads); the trail is dragged into the lead's former space each step, so the
  // opponent must see the WHOLE body glide, not just its head.
  it("tweens a LARGE body's leading end and drags its trail one hop behind", () => {
    const prev = view([fighter({ space: "b1", tailSpace: "b2", size: "LARGE" })]);
    // The TAIL led: b2 → b3 → b4, so the head ends on b4 and the tail on b3.
    const next = view([fighter({ space: "b4", tailSpace: "b3", size: "LARGE" })]);
    const events: GameEvent[] = [
      { type: "FIGHTER_MOVED", fighter: "p2/hero", path: ["b2", "b3", "b4"] },
    ];
    expect(diffIncomingMove(prev, next, events)).toEqual({
      fighterId: "p2/hero",
      path: ["b2", "b3", "b4"], // NOT prepended with b1 — b2 is a body space
      trailPath: ["b1", "b2", "b3"], // starts on the space the lead did not
    });
  });

  it("tweens a LARGE body whose HEAD led, keeping both routes in lockstep", () => {
    const prev = view([fighter({ space: "b1", tailSpace: "b2", size: "LARGE" })]);
    const next = view([fighter({ space: "b5", tailSpace: "b1", size: "LARGE" })]);
    const events: GameEvent[] = [
      { type: "FIGHTER_MOVED", fighter: "p2/hero", path: ["b1", "b5"] },
    ];
    expect(diffIncomingMove(prev, next, events)).toEqual({
      fighterId: "p2/hero",
      path: ["b1", "b5"],
      trailPath: ["b2", "b1"],
    });
  });

  it("omits trailPath entirely for a NORMAL fighter", () => {
    const prev = view([fighter({ space: "b1" })]);
    const next = view([fighter({ space: "b2" })]);
    expect(diffIncomingMove(prev, next, [])).not.toHaveProperty("trailPath");
  });

  // Protocol v31 (engine #445): a POSITIONS_SWAPPED relocation is a TELEPORT.
  // Gliding it would show a walk that never happened — and a walk straight into
  // the space the other fighter still visibly occupies. ProBoard plays the
  // swap's own crossfade instead (lib/pro/positionSwap.ts).
  describe("atomic position swaps are not walks (protocol v31)", () => {
    const swap: GameEvent = {
      type: "POSITIONS_SWAPPED",
      a: "p1/hero",
      b: "p2/hero",
      aTo: ["b1"],
      bTo: ["a1"],
    };
    const mine = (over: Partial<ViewFighter> = {}) =>
      fighter({ id: "p1/hero", owner: "p1", name: "Skull Kid", space: "a1", ...over });

    it("returns null for a swapped opponent fighter", () => {
      const prev = view([mine({ space: "a1" }), fighter({ space: "b1" })]);
      const next = view([mine({ space: "b1" }), fighter({ space: "a1" })]);
      expect(diffIncomingMove(prev, next, [swap])).toBeNull();
    });

    it("still tweens a DIFFERENT opponent fighter that walked in the same batch", () => {
      const larry = fighter({ id: "p2/sidekick-1", kind: "SIDEKICK", name: "Larry", space: "b7" });
      const prev = view([mine({ space: "a1" }), fighter({ space: "b1" }), larry]);
      const next = view([mine({ space: "b1" }), fighter({ space: "a1" }), { ...larry, space: "b8" }]);
      expect(diffIncomingMove(prev, next, [swap])).toEqual({
        fighterId: "p2/sidekick-1",
        path: ["b7", "b8"],
      });
    });

    it("tweens normally on a pre-v31 (event-free) batch", () => {
      const prev = view([fighter({ space: "b1" })]);
      const next = view([fighter({ space: "a1" })]);
      expect(diffIncomingMove(prev, next, [])).toEqual({ fighterId: "p2/hero", path: ["b1", "a1"] });
    });
  });
});
