/** p2p #1256: re-seated ready-checks, organizer-corrected / unverified-late scores. */
import { buildBracket, scoredGame } from "./bracket";
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch, fixtureRunning8 } from "./fixtures";
import { currentChecks, gameRows, heldRoom, matchPageState, score } from "./matchPage";
import { readyDecision } from "./usePlayMatch";
import type { Game, MatchDetail } from "./types";

const NOW = Date.parse(FIXTURE_NOW);

/** e3 pressed Play, then the organizer re-seated the slot to e9: e3's check is nobody's. */
const reseated = (): MatchDetail => {
  const d = fixtureMatch("opponent_ready").detail;
  return { ...d, match: { ...d.match, slotB: "e9" } };
};

describe("a displaced player's ready-check (D2)", () => {
  it("is not the opponent's: no opponent_ready, no held room, no join", () => {
    const d = reseated();
    expect(currentChecks(d)).toHaveLength(0);
    expect(heldRoom(d, NOW)).toBeNull();
    expect(matchPageState(d, FIXTURE_MATCH_YOU, NOW)).toBe("waiting");
    expect(readyDecision(d, "a", 0, NOW)).toEqual({ kind: "create" });
  });

  it("the unmodified fixture still reads opponent_ready / join", () => {
    const d = fixtureMatch("opponent_ready").detail;
    expect(matchPageState(d, FIXTURE_MATCH_YOU, NOW)).toBe("opponent_ready");
    expect(readyDecision(d, "a", 0, NOW).kind).toBe("join");
  });
});

const game = (over: Partial<Game>): Game =>
  ({ gameIndex: 0, startedAt: null, finishedAt: FIXTURE_NOW, winnerEntry: "e2", verified: false, rejectedAt: null, ...over }) as Game;

describe("decided match scores (D5/D6)", () => {
  it("an organizer-decided match scores no game and its cell shows one decided-by line", () => {
    const p = fixtureRunning8();
    const m = { ...p.matches.find((x) => x.slotA && x.slotB)!, status: "decided" as const, winner: "e2", decidedBy: "organizer" as const };
    m.games = [game({ winnerEntry: m.slotA, verified: true })];
    expect(scoredGame(m, m.games[0])).toBe(false);
    const cell = buildBracket(p.tournament, p.entries, p.matches.map((x) => (x.id === m.id ? m : x))).rounds.flatMap((r) => r.cells).find((c) => c.id === m.id)!;
    expect(cell.a.score).toBeNull();
    expect(cell.b.score).toBeNull();
  });

  it("an unverified game on a decided match is not a score and reads not counted", () => {
    const d = fixtureMatch("decided").detail;
    const g = game({ winnerEntry: d.match.slotA, verified: false });
    const dd: MatchDetail = { ...d, match: { ...d.match, decidedBy: "organizer", games: [g] } };
    expect(score(dd)).toEqual({ a: 0, b: 0 });
    expect(gameRows(dd)[0].state).toBe("after_decision");
  });

  it("a game that confirmed itself still counts", () => {
    const d = fixtureMatch("decided").detail;
    const g = game({ winnerEntry: d.match.slotA, verified: false });
    const dd: MatchDetail = { ...d, match: { ...d.match, decidedBy: "unverified_confirmed", games: [g] } };
    expect(score(dd).a).toBe(1);
  });
});
