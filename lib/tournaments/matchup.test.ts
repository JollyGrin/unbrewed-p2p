import { describeTournamentRule } from "./matchup";

describe("describeTournamentRule with per-round maps (p2p #1253)", () => {
  const M = (id: string) => ({ kind: "catalog" as const, id });
  const name = (r: { id: string }) => r.id.toUpperCase();
  it("names the maps in round order, final last", () => {
    expect(
      describeTournamentRule({ matchupRule: { mode: "free" }, roundMaps: { final: M("z"), "2": M("b"), "1": M("a") } }, name),
    ).toBe("Players pick heroes · Map set per round: A, B, Z");
  });
  it("is unchanged without round maps", () => {
    expect(describeTournamentRule({ matchupRule: { mode: "free" }, roundMaps: null }, name)).toBe("Players choose");
  });
});
