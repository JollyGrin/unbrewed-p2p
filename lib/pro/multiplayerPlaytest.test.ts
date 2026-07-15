import { PRO_FORMATS, formatChoice, teamComposition } from "./multiplayerPlaytest";

describe("multiplayer playtest helpers", () => {
  it("offers duel plus the manual-playtest multiplayer formats", () => {
    expect(PRO_FORMATS.map((f) => [f.id, f.requiredPlayers])).toEqual([
      ["duel", 2],
      ["ffa-3", 3],
      ["team-2v2", 4],
    ]);
    expect(formatChoice("unknown").id).toBe("duel");
  });


  it("splits team-2v2 into fixed runtime seat teams, and nothing else", () => {
    expect(teamComposition("team-2v2")).toEqual([
      { team: "A", seats: ["p1", "p3"] },
      { team: "B", seats: ["p2", "p4"] },
    ]);
    expect(teamComposition("duel")).toBeNull();
    expect(teamComposition("ffa-3")).toBeNull();
    expect(teamComposition(undefined)).toBeNull();
  });
});
