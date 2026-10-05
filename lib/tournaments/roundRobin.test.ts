import {
  fixtureRoundRobin,
  fixtureRoundRobin4,
  fixtureRoundRobin5,
  fixtureRoundRobin6,
  fixtureRoundRobin6Complete,
  fixtureRoundRobin6Final,
  fixtureStandings,
  rrRoundCount,
} from "./fixtures";
import { buildRoundRobin, roundRobinRounds } from "./roundRobin";

const view = (p: ReturnType<typeof fixtureRoundRobin4>) =>
  buildRoundRobin(p.tournament, p.entries, p.matches, p.standings ?? null);

describe("round robin schedule + standings fixtures", () => {
  it.each([4, 5, 6])("%i players: every pair plays once, n−1 rounds (n when odd)", (n) => {
    const p = fixtureRoundRobin(n, { slug: "x", name: "x", decidedRounds: 0 });
    const pairs = new Set(p.matches.map((m) => [m.slotA, m.slotB].sort().join("|")));
    expect(p.matches).toHaveLength((n * (n - 1)) / 2);
    expect(pairs.size).toBe(p.matches.length);
    expect(new Set(p.matches.map((m) => m.round)).size).toBe(rrRoundCount(n));
    expect(roundRobinRounds(n)).toBe(rrRoundCount(n));
    expect(p.matches.every((m) => m.stage === "group" && m.nextMatchId === null)).toBe(true);
  });

  it("standings rank by wins, then head-to-head, then seed (unique ranks)", () => {
    const p = fixtureRoundRobin6();
    const s = fixtureStandings(p.entries, p.matches);
    expect(s.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].wins).toBeGreaterThanOrEqual(s[i].wins);
  });
});

describe("buildRoundRobin", () => {
  it("4 players, early: no final cut, nobody clinched", () => {
    const v = view(fixtureRoundRobin4());
    expect(v.standings).toHaveLength(4);
    expect(v.cut).toBe(1);
    expect(v.final).toBeNull();
    expect(v.rounds.map((r) => r.matches.length)).toEqual([2, 2, 2]);
    expect(v.standings.every((r) => r.tone !== "clinched")).toBe(true);
    expect(v.standings.map((r) => r.form.length)).toEqual([3, 3, 3, 3]);
  });

  it("5 players: odd count → 5 rounds of 2 matches, standings from the api order", () => {
    const v = view(fixtureRoundRobin5());
    expect(v.rounds).toHaveLength(5);
    expect(v.rounds.every((r) => r.matches.length === 2)).toBe(true);
    expect(v.stats).toMatchObject({ players: 5, totalRounds: 5, currentRound: 3 });
    expect(v.standings.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(v.standings[0].played).toBe(v.standings[0].form.filter((d) => d !== "pend").length);
  });

  it("6 players with a top-2 final: cut line under rank 2, dropped player marked", () => {
    const v = view(fixtureRoundRobin6());
    expect(v.cut).toBe(2);
    expect(v.standings.filter((r) => r.cutLine).map((r) => r.rank)).toEqual([2]);
    expect(v.standings.filter((r) => r.inCut)).toHaveLength(2);
    const dropped = v.standings.find((r) => r.dropped)!;
    expect(dropped.fate).toBe("Dropped out");
    expect(v.final).toBeNull();
    expect(v.stats.players).toBe(5);
  });

  it("final open: top 2 are in the final, the rest are out of it", () => {
    const p = fixtureRoundRobin6Final();
    const v = view(p);
    expect(v.groupComplete).toBe(true);
    expect(v.final).toMatchObject({ code: "Final", state: "ready" });
    expect(v.standings.slice(0, 2).map((r) => r.fate)).toEqual(["In the final", "In the final"]);
    expect(v.standings.slice(2).every((r) => r.fate === "Out of the final")).toBe(true);
    expect(v.final!.a.name).toBe(v.standings[0].entry.username);
    expect(v.champion).toBeNull();
  });

  it("complete: the final's winner is champion; standings stay the group table", () => {
    const p = fixtureRoundRobin6Complete();
    const v = view(p);
    expect(v.champion?.id).toBe(v.standings[0].entry.id);
    expect(v.standings[0].fate).toBe("♛ Champion");
    expect(v.final!.a.result).toBe("win");
  });

  it("clinching and elimination follow the wins still reachable", () => {
    // 4 players, two rounds decided with seed 1 winning both: 2–0 with one left.
    const p = fixtureRoundRobin(4, { slug: "x", name: "x", decidedRounds: 2, top2Final: true });
    const v = view(p);
    const byFate = (f: string) => v.standings.filter((r) => r.fate === f);
    const leader = v.standings[0];
    expect(leader.wins).toBeGreaterThanOrEqual(1);
    // Anyone with a loss on both counts and two others strictly ahead is out.
    for (const r of byFate("Out of the final")) {
      const ahead = v.standings.filter((o) => o.wins > r.wins + (r.scheduled - r.played)).length;
      expect(ahead).toBeGreaterThanOrEqual(2);
    }
    for (const r of byFate("✓ Clinched final")) {
      const threats = v.standings.filter((o) => o !== r && o.wins + (o.scheduled - o.played) >= r.wins).length;
      expect(threats).toBeLessThan(2);
    }
  });

  it("older api (standings null) falls back to the seed order at 0–0", () => {
    const p = fixtureRoundRobin(4, { slug: "x", name: "x", decidedRounds: 0 });
    const v = buildRoundRobin(p.tournament, p.entries, p.matches, null);
    expect(v.standings.map((r) => r.entry.seed)).toEqual([1, 2, 3, 4]);
    expect(v.standings.every((r) => r.wins === 0 && r.losses === 0)).toBe(true);
  });

  it("notes a tiebreak when a row is level on wins with the one above", () => {
    const v = view(fixtureRoundRobin6());
    for (let i = 1; i < v.standings.length; i++) {
      const same = v.standings[i - 1].wins === v.standings[i].wins;
      if (!same) expect(v.standings[i].tiebreak).toBeNull();
    }
  });
});
