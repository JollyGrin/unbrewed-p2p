import { assignment } from "./matchup";
import { FIXTURE_ATTENTION, fixtureRunning8 } from "./fixtures";
import {
  attentionRows,
  buildMatchupRule,
  dueText,
  organizerErrorText,
  overrideBody,
} from "./organizer";

const f = fixtureRunning8();
const rows = attentionRows(
  FIXTURE_ATTENTION["fixture-8"],
  f.entries,
  f.matches,
  3,
);

describe("attentionRows", () => {
  it("renders every item kind, most urgent first", () => {
    expect(rows.map((r) => r.key.split(":")[0])).toEqual([
      "awaiting_organizer",
      "entrant_left",
      "unverified_game",
      "no_matchup",
      "deadline_passed",
    ]);
  });
  it("unverified: one-click confirm for the winner, auto-confirm in 24h copy", () => {
    const r = rows.find((x) => x.key.startsWith("unverified_game"))!;
    expect(r.actions[0]).toMatchObject({
      type: "confirm",
      gameIndex: 0,
      label: "Confirm for crystal_lake_jay",
    });
    expect(r.body).toMatch(/auto-confirms 24h/);
  });
  it("entrant left: forfeit goes to the remaining player", () => {
    const r = rows.find((x) => x.key.startsWith("entrant_left"))!;
    expect(r.actions[0]).toMatchObject({ type: "award", entryId: "e2" });
  });
  it("no_matchup offers Set matchup", () => {
    expect(
      rows.find((x) => x.key.startsWith("no_matchup"))!.actions[0].type,
    ).toBe("matchup");
  });
});

describe("buildMatchupRule", () => {
  const map = { kind: "catalog", id: "weathertop" } as const;
  it("picks free / map / fixed from what was chosen", () => {
    expect(buildMatchupRule({ a: "", b: "", map: null })).toEqual({
      mode: "free",
    });
    expect(buildMatchupRule({ a: "", b: "", map })).toEqual({
      mode: "map",
      map,
    });
    expect(buildMatchupRule({ a: "kenshiro", b: "", map })).toEqual({
      mode: "fixed",
      heroes: { a: "kenshiro" },
      map,
    });
  });
  it("is consumed through assignment() only", () => {
    const rule = buildMatchupRule({ a: "kenshiro", b: "boba-fett", map });
    expect(assignment(rule, 0)).toEqual({
      heroes: { a: "kenshiro", b: "boba-fett" },
      map,
    });
  });
});

describe("overrideBody", () => {
  it("sends replacesWinner only when re-deciding", () => {
    expect(overrideBody({ winner: null }, "e1", " hi ")).toEqual({
      winnerEntry: "e1",
      note: "hi",
    });
    expect(overrideBody({ winner: "e2" }, "e1", "")).toEqual({
      winnerEntry: "e1",
      replacesWinner: "e2",
    });
  });
});

describe("misc", () => {
  it("dueText", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    expect(dueText("2026-10-06T06:00:00Z", now)).toBe("18h left");
    expect(dueText("2026-10-05T12:20:00Z", now)).toBe("20m left");
    expect(dueText("2026-10-05T11:00:00Z", now)).toBe("");
  });
  it("maps api error codes", () => {
    expect(
      organizerErrorText({ reason: "unavailable", code: "next_match_started" }),
    ).toMatch(/next match/);
  });
});

describe("a rejected game (api #75) is never a result", () => {
  const { cellState } = jest.requireActual("./bracket");
  const { gameRows, score } = jest.requireActual("./matchPage");
  const m = f.matches.find((x) => x.id === "m1-1")!;
  const rejected = {
    ...m,
    games: m.games.map((g) => ({ ...g, rejectedAt: "2026-10-05T10:00:00Z" })),
  };
  it("is not the unverified cell state", () => {
    expect(cellState(m)).toBe("unverified");
    expect(cellState(rejected)).toBe("ready");
  });
  it("is listed as rejected and adds no score", () => {
    const d = {
      match: rejected,
      players: { a: null, b: null },
      tournament: {},
      readyChecks: [],
      liveRoom: null,
    };
    expect(gameRows(d)[0].state).toBe("rejected");
    expect(score(d)).toEqual({ a: 0, b: 0 });
  });
});
