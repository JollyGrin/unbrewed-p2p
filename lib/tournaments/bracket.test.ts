/** The bracket layout model (#1217) over 4/8/16 fixtures, byes included. */
import {
  buildBracket,
  cellState,
  defaultRoundIndex,
  entrantRows,
  matchCode,
  roundName,
  seedOrder,
} from "./bracket";
import {
  fixtureBracket,
  fixtureComplete4,
  fixtureRunning16,
  fixtureRunning8,
  fixtureTournament,
} from "./fixtures";

const view = (p: ReturnType<typeof fixtureRunning8>) => buildBracket(p.tournament, p.entries, p.matches);

describe("names and codes", () => {
  it("names rounds from the final backwards", () => {
    expect([1, 2, 3, 4].map((r) => roundName(r, 4))).toEqual(["Round of 16", "Quarterfinals", "Semifinals", "Final"]);
    expect([1, 2].map((r) => roundName(r, 2))).toEqual(["Semifinals", "Final"]);
  });
  it("codes cells QF1 / SF2 / Final", () => {
    expect(matchCode(1, 0, 3)).toBe("QF1");
    expect(matchCode(2, 1, 3)).toBe("SF2");
    expect(matchCode(3, 0, 3)).toBe("Final");
    expect(matchCode(1, 6, 4)).toBe("R16·7");
  });
  it("matches the api's standard seed order", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedOrder(16).slice(0, 4)).toEqual([1, 16, 8, 9]);
  });
});

describe.each([
  [4, 4, [2, 1]],
  [4, 3, [2, 1]],
  [8, 8, [4, 2, 1]],
  [8, 5, [4, 2, 1]],
  [16, 16, [8, 4, 2, 1]],
  [16, 9, [8, 4, 2, 1]],
])("a %i-seat bracket with %i players", (size, players, perRound) => {
  const b = fixtureBracket(size, players);
  const v = buildBracket(fixtureTournament({ size }), b.entries, b.matches);

  it("lays out every round with the right number of cells, in position order", () => {
    expect(v.rounds.map((r) => r.cells.length)).toEqual(perRound);
    for (const r of v.rounds) expect(r.cells.map((c) => c.position)).toEqual(r.cells.map((_, i) => i));
    expect(v.rounds[v.rounds.length - 1].name).toBe("Final");
  });

  it("decides one bye per empty seat, at once, for the top seeds", () => {
    const byes = v.rounds[0].cells.filter((c) => c.decidedBy === "bye");
    expect(byes).toHaveLength(size - players);
    for (const c of byes) {
      expect(c.state).toBe("decided");
      expect(c.note?.tag).toBe("Bye");
      expect(c.href).toBeNull();
      expect(c.a.seed).toBeLessThanOrEqual(size - players);
      expect(c.b.name).toBe("Bye");
      expect(c.b.placeholder).toBe(true);
    }
  });

  it("counts every placed player", () => {
    expect(v.stats.players).toBe(players);
    expect(v.champion).toBeNull();
  });
});

describe("cell states (8 seats, 6 players, mid-event)", () => {
  const v = view(fixtureRunning8());
  const cell = (code: string) => v.rounds.flatMap((r) => r.cells).find((c) => c.code === code)!;

  it("draws byes, an unverified game, a played result, in play now and waiting", () => {
    expect(cell("QF1").decidedBy).toBe("bye");
    expect(cell("QF2").state).toBe("unverified");
    expect(cell("QF2").foot).toMatch(/organizer to confirm/);
    expect(cell("QF4").state).toBe("decided");
    expect(cell("QF4").a.result).toBe("win");
    expect(cell("QF4").b.result).toBe("lose");
    expect(cell("QF4").a.score).toBe(1);
    expect(cell("SF2").state).toBe("in_play");
    expect(cell("SF2").foot).toBe("In play now");
    expect(cell("Final").state).toBe("waiting");
  });

  it("never advances an unverified result: SF1 waits on 'Winner of QF2'", () => {
    const sf1 = cell("SF1");
    expect(sf1.state).toBe("waiting");
    expect(sf1.a.name).toBe("RavenDefeatsAll");
    expect(sf1.b).toMatchObject({ placeholder: true, name: "Winner of QF2" });
    expect(sf1.b.sub).toBe("xenoqueen or crystal_lake_jay, once confirmed");
    expect(sf1.href).toBeNull();
  });

  it("links open, played and live cells to the match page", () => {
    expect(cell("SF2").href).toBe("/tournaments?t=fixture-8&m=m2-1");
    expect(cell("QF2").href).toBe("/tournaments?t=fixture-8&m=m1-1");
  });

  it("reads heroes/map from match.matchup, incl. a per-match override", () => {
    expect(cell("QF4").matchup).toEqual({ heroes: "Kenshiro vs Boba Fett", map: "Weathertop" });
    expect(cell("QF4").override).toBe(true);
    expect(cell("QF4").a.sub).toBe("Kenshiro");
    expect(cell("QF2").matchup).toEqual({ heroes: null, map: "Weathertop" });
  });

  it("gold-lines winners into the next round", () => {
    expect(cell("QF4").feedsWinner).toBe(true);
    expect(cell("QF2").feedsWinner).toBe(false);
  });

  it("summarises rounds and opens the phone on the live round", () => {
    expect(v.rounds.map((r) => r.summary)).toEqual(["3/4 decided", "1 in play", "waiting"]);
    expect(defaultRoundIndex(v)).toBe(1);
    expect(v.stats).toMatchObject({ players: 6, currentRound: 1, gamesPlayed: 2, inPlay: 1 });
  });
});

describe("how a match was decided", () => {
  const v = view(fixtureRunning16());
  const all = v.rounds.flatMap((r) => r.cells);

  it("names the deadline rules and the organizer", () => {
    const rule1 = all.find((c) => c.decidedBy === "deadline_ready_check")!;
    expect(rule1.note?.tag).toBe("By deadline rule");
    expect(rule1.foot).toMatch(/^Rule 1/);
    expect(rule1.b.sub).toBe("no game played");
    expect(rule1.a.sub).toBe("advances");
    expect(all.find((c) => c.decidedBy === "organizer")!.note?.tag).toBe("Organizer decided");
  });

  it("names rule 2 (higher seed) and crowns the champion", () => {
    const p = fixtureComplete4();
    const done = buildBracket(p.tournament, p.entries, p.matches);
    expect(done.rounds[0].cells[1].foot).toMatch(/^Rule 2/);
    expect(done.champion?.username).toBe("RavenDefeatsAll");
    expect(done.stats.currentRound).toBe(2);
    const rows = entrantRows(4, p.entries, p.matches);
    expect(rows.map((r) => r.status)).toEqual(["Champion", "Out in SF2", "Out in Final", "Out in SF1"]);
  });
});

describe("cellState", () => {
  it("prefers decided over a stale in-play flag and in-play over unverified", () => {
    const b = fixtureBracket(4, 4);
    const m = b.at(1, 0);
    expect(cellState(m)).toBe("ready");
    b.unverified(m, "a");
    expect(cellState(m)).toBe("unverified");
    m.inPlay = true;
    expect(cellState(m)).toBe("in_play");
    b.decide(m, "a", "unverified_confirmed");
    expect(cellState(m)).toBe("decided");
  });
});

describe("final smoke fixes (#1239)", () => {
  it("D7: a final decided without a game says the winner wins the tournament, never 'advances'", () => {
    const b = fixtureBracket(4, 4);
    b.decide(b.at(1, 0), "a", "result");
    b.decide(b.at(1, 1), "b", "result");
    b.decide(b.at(2, 0), "a", "deadline_higher_seed");
    const view = buildBracket({ slug: "x", size: 4, status: "complete" }, b.entries, b.matches);
    const final = view.rounds[1].cells[0];
    expect(final.a.sub).toBe("wins the tournament");
    expect(final.b.sub).toBe("no game played");
    expect(final.note?.rule).toBe("Rule 2 · no result, and the organizer did not decide in 24h. The higher seed wins the tournament.");
    // a semifinal decided the same way still advances
    expect(view.rounds[0].cells[0].note?.rule).toBeNull();
    const semi = fixtureBracket(4, 4);
    semi.decide(semi.at(1, 0), "a", "deadline_higher_seed");
    const sv = buildBracket({ slug: "x", size: 4, status: "running" }, semi.entries, semi.matches);
    expect(sv.rounds[0].cells[0].a.sub).toBe("advances");
    expect(sv.rounds[0].cells[0].note?.rule).toMatch(/higher seed advances\.$/);
  });
});
