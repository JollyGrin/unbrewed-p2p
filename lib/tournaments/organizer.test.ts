import { assignment } from "./matchup";
import { FIXTURE_ATTENTION, fixtureRoundRobin6, fixtureRunning8 } from "./fixtures";
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
  it("unverified: one-click confirm for the winner; no auto-confirm promise (api #129, interactions S2)", () => {
    const r = rows.find((x) => x.key.startsWith("unverified_game"))!;
    expect(r.actions[0]).toMatchObject({
      type: "confirm",
      gameIndex: 0,
      label: "Confirm for crystal_lake_jay",
    });
    expect(r.body).toMatch(/It only counts if you confirm it/);
    expect(r.body).not.toMatch(/auto-confirm|24h/);
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

describe("round-robin unverified copy (K1)", () => {
  it("group matches say nobody gets the win, never 'advances'", () => {
    const rr = fixtureRoundRobin6();
    const g = rr.matches.find((m) => m.stage === "group")!;
    const out = attentionRows(
      [{ kind: "unverified_game", matchId: g.id, round: g.round, position: g.position, gameIndex: 0, winnerEntry: g.slotA }],
      rr.entries,
      rr.matches,
      3,
    );
    expect(out[0].body).toMatch(/until then nobody gets the win/);
    expect(out[0].body).not.toMatch(/advances/);
  });
  it("knockout keeps 'Nobody advances'", () => {
    expect(rows.find((x) => x.key.startsWith("unverified_game"))!.body).toMatch(/nobody advances/);
  });
});

describe("D3: awaiting_organizer copy (#1239)", () => {
  const item = { matchId: f.matches[0].id, round: 1, position: 0, kind: "awaiting_organizer" as const, deadlineAt: "2026-10-05T10:00:00Z", until: "2026-10-06T10:00:00Z" };
  const row = (extra: object, now = Date.parse("2026-10-05T11:00:00Z")) =>
    attentionRows([{ ...item, ...extra }], f.entries, f.matches, 3, now)[0];

  it("stays generic while the api sends no ready-checks, and never claims nobody pressed Play", () => {
    const body = row({}).body;
    expect(body).toMatch(/a player is holding a seat, the rules decide when the hold ends/);
    expect(body).not.toMatch(/neither player pressed Play/);
  });

  it("names the player holding a live seat when ready-checks are present", () => {
    const m = f.matches[0];
    const body = row({ readyChecks: [{ entryId: m.slotA, expiresAt: "2026-10-05T11:10:00Z", outcome: "pending" }] }).body;
    expect(body).toMatch(/pressed Play and holds a seat until \d{1,2}:\d\d( [AP]M)?; the rules decide after that/);
  });

  it("an expired hold falls back to the generic copy", () => {
    const m = f.matches[0];
    expect(row({ readyChecks: [{ entryId: m.slotA, expiresAt: "2026-10-05T10:20:00Z", outcome: "pending" }] }).body).toMatch(/If a player is holding a seat/);
  });
});

describe("organizerErrorText for edit refusals (p2p #1253)", () => {
  it("never shows the api's round-map sentences", () => {
    for (const message of ["round keys must be integers 1-3", "the 'final' key needs a round robin with settings.top2Final"])
      expect(organizerErrorText({ reason: "invalid", message })).toMatch(/^The per-round maps don't fit/);
  });
  it("already_started on a cancelled tournament says cancelled", () => {
    expect(organizerErrorText({ reason: "conflict", code: "already_started" }, "cancelled")).toBe("This tournament was cancelled.");
    expect(organizerErrorText({ reason: "conflict", code: "already_started" }, "running")).toMatch(/already started/);
  });
});
