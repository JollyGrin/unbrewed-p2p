/**
 * Live-turn chrome gating (issue #194): the side panel must drop live-turn
 * chrome (whose-turn / actions-left chips + the "waiting on…" banner) once a
 * winner is set, in duel AND multiplayer.
 */
import type { PlayerId, PlayerView } from "./protocol";
import { showLiveTurnChrome } from "./turnChrome";

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
