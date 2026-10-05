/** api #91: cancelled matches/tournaments and games recorded after the organizer decided. */
import { buildBracket, cellState, countsGame } from "./bracket";
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch, fixtureRunning8 } from "./fixtures";
import { gameRows, matchPageState, score } from "./matchPage";
import { nextMatchView } from "./nextMatch";
import { attentionRows } from "./organizer";
import type { Game, Match, MatchDetail } from "./types";

const NOW = Date.parse(FIXTURE_NOW);

const cancelledDetail = (): MatchDetail => {
  const d = fixtureMatch("in_play").detail;
  return { ...d, match: { ...d.match, cancelled: true, inPlay: false } };
};

describe("cancelled matches", () => {
  it("cancelled wins over a raw in_play status in the cell, the page and the next-match view", () => {
    const d = cancelledDetail();
    expect(cellState({ ...d.match, status: "in_play", inPlay: true })).toBe("cancelled");
    expect(matchPageState(d, FIXTURE_MATCH_YOU, NOW)).toBe("cancelled");
    const v = nextMatchView(
      { tournament: { id: "t", slug: "s", name: "N" }, match: { ...d.match, inPlay: true }, myEntryId: d.match.slotA!, opponent: null },
      null,
      8,
      NOW,
    );
    expect(v.state).not.toBe("in_play");
  });

  it("a bracket cell reads Cancelled and stats count no match in play", () => {
    const p = fixtureRunning8();
    const matches = p.matches.map((m: Match) => (m.status === "decided" ? m : { ...m, cancelled: true, inPlay: false }));
    const v = buildBracket({ ...p.tournament, status: "cancelled" }, p.entries, matches);
    const cells = v.rounds.flatMap((r) => r.cells).filter((c) => c.state === "cancelled");
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.foot === "Cancelled")).toBe(true);
    expect(v.stats.inPlay).toBe(0);
  });

  it("a decided match of a cancelled tournament stays decided", () => {
    const m = { ...fixtureMatch("decided").detail.match, cancelled: true };
    expect(cellState(m)).toBe("decided");
  });

  it("the attention queue drops items for cancelled matches", () => {
    const p = fixtureRunning8();
    const m = { ...p.matches[0], cancelled: true };
    const rows = attentionRows(
      [{ kind: "awaiting_organizer", matchId: m.id, round: m.round, position: m.position, until: null } as any],
      p.entries,
      [m],
      3,
      NOW,
    );
    expect(rows).toEqual([]);
  });
});

describe("games recorded after the decision", () => {
  const late = (d: MatchDetail): MatchDetail => {
    const g = d.match.games[0];
    const extra: Game = { ...g, gameIndex: 5, finishedAt: FIXTURE_NOW, winnerEntry: d.match.slotB, recordedAfterDecision: true };
    return { ...d, match: { ...d.match, games: [...d.match.games, extra] } };
  };

  it("never counts toward the score", () => {
    const d = fixtureMatch("decided").detail;
    const before = score(d);
    const after = score(late(d));
    expect(after).toEqual(before);
    expect(countsGame({ ...d.match.games[0], recordedAfterDecision: true })).toBe(false);
  });

  it("gets its own row state", () => {
    const rows = gameRows(late(fixtureMatch("decided").detail));
    expect(rows.at(-1)?.state).toBe("after_decision");
  });
});
