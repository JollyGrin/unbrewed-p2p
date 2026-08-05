/**
 * The history↔replay join (#573). The two sides share no key, so this pins the
 * natural-key rule and — more importantly — that it stays CONSERVATIVE: a wrong
 * link opens somebody else's game, while a missed link costs nothing.
 */
import { localReplayHref, localReplayIdForGame, MATCH_WINDOW_MS } from "./replayLink";
import type { AccountGame } from "./gameHistory";
import type { ReplayIndexEntry } from "@/lib/pro/replayStore";

const ENDED_MS = Date.parse("2026-08-05T12:00:00.000Z");

const game = (over: Partial<AccountGame> = {}): AccountGame => ({
  id: "live-abc-1-deadbeef",
  endedAt: new Date(ENDED_MS).toISOString(),
  map: "mended-drum",
  turns: 14,
  durationSeconds: 700,
  endCondition: null,
  draw: false,
  you: { heroId: "thrall", heroName: "Thrall", won: true, finalHealth: 4 },
  opponents: [
    { heroId: "king-kong", heroName: "King Kong", pilot: "bot", botDifficulty: "hard" },
  ],
  ...over,
});

const entry = (over: Partial<ReplayIndexEntry> = {}): ReplayIndexEntry => ({
  id: "r1234abcd",
  savedAt: ENDED_MS,
  starred: false,
  bytes: 1000,
  winner: "p1",
  heroes: ["thrall", "king-kong"],
  turns: 14,
  endedAt: ENDED_MS,
  mapTitle: "The Mended Drum",
  ...over,
});

describe("localReplayIdForGame", () => {
  it("matches the same game on hero line-up + turns + a near-identical stamp", () => {
    expect(localReplayIdForGame(game(), [entry()])).toBe("r1234abcd");
    // Hero order differs between the two sides; the key is a sorted multiset.
    expect(
      localReplayIdForGame(game(), [entry({ heroes: ["king-kong", "thrall"] })]),
    ).toBe("r1234abcd");
    expect(
      localReplayIdForGame(game(), [entry({ endedAt: ENDED_MS + 30_000 })]),
    ).toBe("r1234abcd");
  });

  it("prefers an exact id match over the natural key", () => {
    const exact = entry({ id: "live-abc-1-deadbeef", turns: 999, heroes: [] });
    expect(localReplayIdForGame(game(), [entry(), exact])).toBe(
      "live-abc-1-deadbeef",
    );
  });

  it("refuses to link a different game", () => {
    expect(localReplayIdForGame(game(), [])).toBeNull();
    expect(
      localReplayIdForGame(game(), [entry({ heroes: ["thrall", "batman"] })]),
    ).toBeNull();
    expect(localReplayIdForGame(game(), [entry({ turns: 15 })])).toBeNull();
    expect(
      localReplayIdForGame(game(), [
        entry({ endedAt: ENDED_MS + MATCH_WINDOW_MS + 1 }),
      ]),
    ).toBeNull();
  });

  it("never guesses when the row carries no hero ids at all", () => {
    const anonymous = game({
      you: { heroId: null, heroName: null, won: true, finalHealth: null },
      opponents: [],
    });
    expect(localReplayIdForGame(anonymous, [entry({ heroes: [] })])).toBeNull();
  });

  it("takes the closest stamp when two saved replays are both in the window", () => {
    const far = entry({ id: "rfar", endedAt: ENDED_MS - 120_000 });
    const near = entry({ id: "rnear", endedAt: ENDED_MS + 1_000 });
    expect(localReplayIdForGame(game(), [far, near])).toBe("rnear");
  });

  it("links into the replays browser deep-link", () => {
    expect(localReplayHref("r1234abcd")).toBe("/pro/replays?open=r1234abcd");
  });
});
