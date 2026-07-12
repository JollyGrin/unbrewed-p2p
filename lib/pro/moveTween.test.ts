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
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 10, discard: [], committedCard: null, counters: {}, flags: {} },
  opponent: { id: "p2", heroId: "baba-yaga", handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {} },
  players: [
    { id: "p1", heroId: "fixture-p1", you: true, hand: [], handCount: 0, deckCount: 10, discard: [], committedCard: null, hasCommitted: false, counters: {}, flags: {} },
    { id: "p2", heroId: "fixture-p2", you: false, handCount: 5, deckCount: 10, discard: [], hasCommitted: false, counters: {}, flags: {} },
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
});
