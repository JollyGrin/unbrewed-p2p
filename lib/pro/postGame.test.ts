/**
 * The post-game panel's pure half (p2p #1397): the result, the end-reason
 * line, and the matchup rows — all read off the final view plus the one
 * GAME_ENDED event, never guessed.
 */
import type { GameEvent, PlayerView, ViewFighter, ViewPlayer } from "./protocol";
import {
  avatarInitials,
  endReasonLine,
  fighterHpLabel,
  gameEndReasonOf,
  gameResultOf,
  isGameOver,
  matchupSeats,
  seatHeroName,
} from "./postGame";

const fighter = (over: Partial<ViewFighter>): ViewFighter =>
  ({
    id: "p1/hero",
    owner: "p1",
    kind: "HERO",
    name: "Kenshiro",
    space: "a1",
    tailSpace: null,
    hp: 5,
    maxHp: 16,
    reach: "MELEE",
    size: "NORMAL",
    defeated: false,
    ...over,
  }) as ViewFighter;

const player = (over: Partial<ViewPlayer>): ViewPlayer =>
  ({ id: "p1", heroId: "kenshiro", you: false, handCount: 0, deckCount: 0, discard: [], ...over }) as unknown as ViewPlayer;

const view = (over: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: "p1",
    phase: "GAME_OVER",
    winner: "p1",
    turnNumber: 11,
    players: [player({ id: "p1", heroId: "kenshiro", you: true }), player({ id: "p2", heroId: "hollow-oak" })],
    fighters: [
      fighter({ id: "p1/hero", owner: "p1", name: "Kenshiro" }),
      fighter({ id: "p2/hero", owner: "p2", name: "The Hollow Oak", hp: 0, defeated: true }),
      fighter({ id: "p2/fox", owner: "p2", kind: "SIDEKICK", name: "The Ember Fox", hp: 6, maxHp: 6 }),
    ],
    ...over,
  }) as unknown as PlayerView;

describe("gameEndReasonOf", () => {
  it("finds the GAME_ENDED reason in a batch", () => {
    const events = [
      { type: "TURN_STARTED", player: "p1", turnNumber: 11 },
      { type: "GAME_ENDED", winner: "p1", reason: "HERO_DEFEATED" },
    ] as GameEvent[];
    expect(gameEndReasonOf(events)).toBe("HERO_DEFEATED");
  });

  it("is null for a batch without one (and for the empty reconnect batch)", () => {
    expect(gameEndReasonOf([{ type: "TURN_STARTED", player: "p1", turnNumber: 2 }] as GameEvent[])).toBeNull();
    expect(gameEndReasonOf([])).toBeNull();
  });
});

describe("gameResultOf / isGameOver", () => {
  it("victory, defeat, and a no-winner GAME_OVER", () => {
    expect(gameResultOf(view())).toBe("victory");
    expect(gameResultOf(view({ winner: "p2" }))).toBe("defeat");
    expect(gameResultOf(view({ winner: null }))).toBe("no-winner");
    expect(isGameOver(view({ winner: null }))).toBe(true);
  });

  it("is null while the game is on", () => {
    expect(gameResultOf(view({ winner: null, phase: "PLAY" }))).toBeNull();
    expect(isGameOver(view({ winner: null, phase: "PLAY" }))).toBe(false);
  });
});

describe("endReasonLine", () => {
  it("knockout: who fell and when, from the winner's side and the loser's", () => {
    expect(endReasonLine(view(), "HERO_DEFEATED")).toBe("Won by knockout · The Hollow Oak fell on turn 11");
    expect(endReasonLine(view({ you: "p2" }), "HERO_DEFEATED")).toBe("Lost by knockout · The Hollow Oak fell on turn 11");
  });

  it("forfeit names the forfeiting hero", () => {
    expect(endReasonLine(view(), "FORFEIT")).toBe("The Hollow Oak forfeited");
    expect(endReasonLine(view({ winner: "p2" }), "FORFEIT")).toBe("Kenshiro forfeited");
  });

  it("a simultaneous knockout", () => {
    expect(endReasonLine(view({ winner: null }), "SIMULTANEOUS")).toBe("Both heroes fell");
  });

  it("says nothing when the reason is unknown (a reload into a finished room)", () => {
    expect(endReasonLine(view(), null)).toBeNull();
  });

  it("falls back to the hero lookup when the hero fighter is not on the view", () => {
    const v = view({ fighters: [] });
    expect(endReasonLine(v, "FORFEIT", (id) => (id === "hollow-oak" ? "The Hollow Oak" : null))).toBe("The Hollow Oak forfeited");
    expect(seatHeroName(v, { id: "p2", heroId: "hollow-oak" })).toBe("hollow-oak");
  });
});

describe("matchupSeats", () => {
  it("lists the viewer first, hero before sidekicks, defeated fighters kept, winner flagged", () => {
    const seats = matchupSeats(view({ you: "p2" }));
    expect(seats.map((s) => s.player.id)).toEqual(["p2", "p1"]);
    expect(seats[0].fighters.map((f) => f.name)).toEqual(["The Hollow Oak", "The Ember Fox"]);
    expect(seats.map((s) => s.won)).toEqual([false, true]);
    expect(seats[0].you).toBe(true);
  });

  it("flags nobody as the winner in a no-winner game", () => {
    expect(matchupSeats(view({ winner: null })).map((s) => s.won)).toEqual([false, false]);
  });
});

describe("labels", () => {
  it("hp / maxHp, or KO once out", () => {
    expect(fighterHpLabel({ hp: 5, maxHp: 16, defeated: false })).toBe("5 / 16");
    expect(fighterHpLabel({ hp: 0, maxHp: 16, defeated: true })).toBe("KO");
    expect(fighterHpLabel({ hp: 0, maxHp: 16, defeated: false })).toBe("KO");
  });

  it("avatar initials", () => {
    expect(avatarInitials("Specter_Knight")).toBe("SK");
    expect(avatarInitials("deanlol")).toBe("DE");
    expect(avatarInitials("")).toBe("?");
  });
});
