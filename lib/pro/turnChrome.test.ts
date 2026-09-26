/**
 * Live-turn chrome gating (issue #194): the side panel must drop live-turn
 * chrome (whose-turn / actions-left chips + the "waiting on…" banner) once a
 * winner is set, in duel AND multiplayer.
 */
import type { PlayerId, PlayerView } from "./protocol";
import { seatOwesDecision, showLiveTurnChrome } from "./turnChrome";

// Minimal PlayerView — only the fields showLiveTurnChrome reads plus enough to
// stand up the type. `seats` controls duel vs. multiplayer; `winner` the state.
const view = (winner: PlayerId | null, seats: number): PlayerView => ({
  you: "p1",
  phase: winner ? "GAME_OVER" : "PLAY",
  turnNumber: 39,
  activePlayer: "p2",
  actionsRemaining: 1,
  turnPhase: "ACTION_SELECT",
  maneuver: null,
  map: { schemaVersion: "1.0", id: "m", meta: { title: "M", minPlayers: 2, maxPlayers: 4, specialRules: false }, zones: [], spaces: [] },
  catalog: {},
  fighters: [],
  tokens: [],
  self: { id: "p1", heroId: "king-kong", hand: [], deckCount: 0, discard: [], committedCard: null, counters: {}, flags: {}, wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false },
  opponent: null,
  players: Array.from({ length: seats }, (_, i) => ({
    id: `p${i + 1}` as PlayerId,
    heroId: "h",
    you: i === 0,
    handCount: 0,
    deckCount: 0,
    discard: [],
    hasCommitted: false,
    counters: {},
    flags: {},
  wonCombatThisTurn: false, lostCombatThisTurn: false, firstAttackThisTurn: false, playedACardThisTurn: false, tookDamageThisTurn: false,
  })),
  combat: null,
  prompt: null,
  winner,
});

describe("showLiveTurnChrome", () => {
  it("shows chrome while the duel is live", () => {
    expect(showLiveTurnChrome(view(null, 2))).toBe(true);
  });
  it("hides chrome at duel game-over", () => {
    expect(showLiveTurnChrome(view("p1", 2))).toBe(false);
  });
  it("shows chrome while a multiplayer game is live", () => {
    expect(showLiveTurnChrome(view(null, 3))).toBe(true);
  });
  it("hides chrome at multiplayer game-over regardless of seat count", () => {
    expect(showLiveTurnChrome(view("p1", 3))).toBe(false);
    expect(showLiveTurnChrome(view("p3", 4))).toBe(false);
  });
});

// Issue #875: the shared "is the engine waiting on THIS seat?" test behind the
// dock's "waiting on opponent…" line and the turn reminder.
describe("seatOwesDecision", () => {
  const live = (prompt: PlayerView["prompt"]): PlayerView => ({ ...view(null, 2), activePlayer: "p1", prompt });
  const promptFor = (player: PlayerId, options: number): PlayerView["prompt"] =>
    ({
      promptId: "pr",
      player,
      kind: "CHOOSE_TARGET",
      options: Array.from({ length: options }, (_, i) => ({ id: `o${i}`, label: `o${i}` })),
    } as unknown as PlayerView["prompt"]);

  it("is true when any action is on offer", () => {
    expect(seatOwesDecision(live(null), 1)).toBe(true);
  });

  it("is true for this seat's own prompt", () => {
    expect(seatOwesDecision(live(promptFor("p1", 2)), 0)).toBe(true);
  });

  it("is false with no actions and no prompt (e.g. the opponent choosing a defense)", () => {
    expect(seatOwesDecision(live(null), 0)).toBe(false);
  });

  it("is false for the redacted summary of an opponent-owned prompt", () => {
    expect(seatOwesDecision(live(promptFor("p2", 0)), 0)).toBe(false);
  });

  it("is false for an opponent-owned prompt even when its options are visible", () => {
    // a god/replay view carries the chooser's full option set — still not ours
    expect(seatOwesDecision(live(promptFor("p2", 2)), 0)).toBe(false);
  });
});
