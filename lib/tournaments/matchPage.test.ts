/** The match page's model (#1218): the six states and their lines, from fixtures. */
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch, MATCH_FIXTURE_STATES } from "./fixtures";
import {
  deadlineOutcome,
  deadlinePassedRule,
  deadlineReadyCheckText,
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

  it("deadline passed with no game: the organizer is deciding, for players and spectators (#1230)", () => {
    const d = fixtureMatch("waiting").detail;
    const late = NOW + 27 * 3_600_000; // the fixture's deadline is 26h out
    expect(matchPageState(d, FIXTURE_MATCH_YOU, late)).toBe("deadline_passed");
    expect(matchPageState(d, null, late)).toBe("deadline_passed");
    // A seat held past the deadline is no longer joinable.
    expect(matchPageState(fixtureMatch("opponent_ready").detail, FIXTURE_MATCH_YOU, late)).toBe("deadline_passed");
  });

  describe("past the deadline, the api's rule 1 first (#1233 review, deadline.ts resolveDeadline)", () => {
    // bountyhuntr (e3) pressed Play at NOW-3m12s, 5 minutes before the deadline; the hold runs to NOW+11m48s.
    const MIN = 60_000;
    const base = fixtureMatch("opponent_ready").detail;
    const pressedAt = Date.parse(base.readyChecks[0].createdAt);
    const deadline = pressedAt + 5 * MIN;
    const d = { ...base, match: { ...base.match, deadlineAt: new Date(deadline).toISOString() } };
    const afterDeadline = deadline + 1 * MIN; // hold still live

    it("A ready 5 min before the deadline: B arriving after it can still join", () => {
      expect(deadlineOutcome(d, afterDeadline)).toEqual({ kind: "hold" });
      expect(matchPageState(d, FIXTURE_MATCH_YOU, afterDeadline)).toBe("opponent_ready"); // B: Join now
      expect(matchPageState(d, "u3", afterDeadline)).toBe("you_ready"); // A: seat held
      expect(matchPageState(d, null, afterDeadline)).toBe("waiting"); // spectator: "A is ready and waiting"
    });

    it("…B's own post-deadline press doesn't count against them", () => {
      const joined = {
        ...d,
        readyChecks: [
          ...d.readyChecks,
          { ...d.readyChecks[0], id: "rc-b", entryId: "e2", role: "join" as const, createdAt: new Date(afterDeadline).toISOString(), expiresAt: new Date(afterDeadline + 15 * MIN).toISOString() },
        ],
      };
      expect(matchPageState(joined, FIXTURE_MATCH_YOU, afterDeadline)).toBe("opponent_ready");
    });

    it("A's hold runs out unanswered (the loop hasn't swept it yet): A wins by ready-check, no organizer copy", () => {
      const expired = Date.parse(d.readyChecks[0].expiresAt) + 1;
      expect(deadlineOutcome(d, expired)).toEqual({ kind: "ready_check", winner: "e3" });
      expect(matchPageState(d, FIXTURE_MATCH_YOU, expired)).toBe("deadline_passed");
      expect(deadlineReadyCheckText(d, "e3", "e2")).toBe(
        "The deadline has passed. bountyhuntr was ready and you never joined, so bountyhuntr advances.",
      );
      expect(deadlineReadyCheckText(d, "e3", "e3")).toMatch(/You were ready and hokuto_shin never joined, so you advance\.$/);
    });

    it("neither or both unanswered → the organizer decides", () => {
      const late = deadline + 30 * MIN;
      const both = { ...d, liveRoom: null, readyChecks: [{ ...d.readyChecks[0], outcome: "unanswered" as const }, { ...d.readyChecks[0], id: "x", entryId: "e2", outcome: "unanswered" as const }] };
      expect(deadlineOutcome(both, late)).toEqual({ kind: "organizer" });
      expect(deadlineOutcome({ ...d, liveRoom: null, readyChecks: [] }, late)).toEqual({ kind: "organizer" });
    });

    it("a check made AFTER the deadline is neither a hold nor rule 1", () => {
      const post = { ...d, readyChecks: [{ ...d.readyChecks[0], createdAt: new Date(deadline + MIN).toISOString(), expiresAt: new Date(deadline + 16 * MIN).toISOString() }] };
      expect(deadlineOutcome(post, deadline + 2 * MIN)).toEqual({ kind: "organizer" });
      expect(deadlineOutcome(post, deadline + 20 * MIN)).toEqual({ kind: "organizer" });
    });
  });

  it("the organizer fallback names the right player: higher seed, or the round-robin final's better rank", () => {
    expect(deadlinePassedRule()).toBe("If they don't decide within 24h, the higher seed advances.");
    expect(deadlinePassedRule("group")).toBe("If they don't decide within 24h, the higher seed wins the match.");
    expect(deadlinePassedRule("final")).toBe("If they don't decide within 24h, the player ranked higher in the standings wins.");
  });

  it("a game that started before the deadline stays in play after it (settled rule 3)", () => {
    expect(matchPageState(fixtureMatch("in_play").detail, FIXTURE_MATCH_YOU, NOW + 27 * 3_600_000)).toBe("in_play");
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
