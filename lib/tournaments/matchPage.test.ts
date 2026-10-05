/** The match page's model (#1218): the six states and their lines, from fixtures. */
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch, MATCH_FIXTURE_STATES } from "./fixtures";
import {
  gameRows,
  matchPageState,
  matchTitle,
  readyCheckLine,
  score,
  seatClock,
} from "./matchPage";

const NOW = Date.parse(FIXTURE_NOW);

describe("matchPageState", () => {
  it.each(MATCH_FIXTURE_STATES)("the %s fixture renders as itself for the player", (state) => {
    expect(matchPageState(fixtureMatch(state).detail, FIXTURE_MATCH_YOU, NOW)).toBe(state);
  });

  it("a spectator never sees a player's ready states", () => {
    expect(matchPageState(fixtureMatch("opponent_ready").detail, "someone-else", NOW)).toBe("waiting");
    expect(matchPageState(fixtureMatch("you_ready").detail, null, NOW)).toBe("waiting");
    expect(matchPageState(fixtureMatch("in_play").detail, null, NOW)).toBe("in_play");
  });

  it("the other player sees the same room as 'opponent ready'", () => {
    expect(matchPageState(fixtureMatch("you_ready").detail, "u3", NOW)).toBe("opponent_ready");
  });

  it("a seat hold whose 15 minutes are up is back to waiting", () => {
    expect(matchPageState(fixtureMatch("opponent_ready").detail, FIXTURE_MATCH_YOU, NOW + 16 * 60_000)).toBe("waiting");
  });

  it("only the deadline rules are 'decided by deadline rule'", () => {
    const d = fixtureMatch("decided").detail;
    for (const by of ["organizer", "bye", "unverified_confirmed", "result"] as const)
      expect(matchPageState({ ...d, match: { ...d.match, decidedBy: by } }, null, NOW)).toBe("decided");
    expect(matchPageState({ ...d, match: { ...d.match, decidedBy: "deadline_higher_seed" } }, null, NOW)).toBe("decided_by_rule");
  });
});

it("titles matches by round", () => {
  expect(matchTitle(2, 1, 8)).toBe("Semifinal 2");
  expect(matchTitle(1, 0, 8)).toBe("Quarterfinal 1");
  expect(matchTitle(3, 0, 8)).toBe("Final");
  expect(matchTitle(1, 3, 16)).toBe("Round of 16 · Match 4");
  // Round robin: rounds only group the list, there are no semifinals (#1221).
  expect(matchTitle(2, 1, 4, "group")).toBe("Round 2 · Match 2");
  expect(matchTitle(4, 0, 4, "final")).toBe("Final");
});

it("counts a seat hold down as M:SS", () => {
  const d = fixtureMatch("opponent_ready").detail;
  expect(seatClock(d.liveRoom!.expiresAt, NOW)).toBe("11:48");
  expect(seatClock(d.liveRoom!.expiresAt, NOW + 3_600_000)).toBe("0:00");
});

describe("games list", () => {
  it("is a list even with one game, and the live game has no number", () => {
    const rows = gameRows(fixtureMatch("in_play").detail);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "in_play", heroes: "Kenshiro vs Boba Fett", winnerName: null });
  });

  it("a decided game names its winner and the score follows the games", () => {
    const d = fixtureMatch("decided").detail;
    expect(gameRows(d)[0]).toMatchObject({ n: 1, state: "won", winnerName: "hokuto_shin" });
    expect(score(d)).toEqual({ a: 1, b: 0 });
    expect(score(fixtureMatch("decided_by_rule").detail)).toEqual({ a: 0, b: 0 });
  });
});

it("ready-checks read from the viewer's side", () => {
  const d = fixtureMatch("decided_by_rule").detail;
  const line = readyCheckLine(d, d.readyChecks[0], FIXTURE_MATCH_YOU);
  expect(line).toMatchObject({ text: "You pressed Play · no answer", missed: true });
  expect(readyCheckLine(d, d.readyChecks[0], null).text).toBe("hokuto_shin pressed Play · no answer");
});
