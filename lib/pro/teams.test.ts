import { deriveTeams, TeamSeat } from "./teams";

// Minimal seat stubs — only id/you/team matter to the derivation.
const seat = (id: string, team?: string, you = false): TeamSeat =>
  ({ id, you, team } as TeamSeat);

describe("deriveTeams", () => {
  describe("team-2v2 (real team format)", () => {
    // Runtime seating fills slots 1..4 as A1,B1,A2,B2 → p1&p3 vs p2&p4.
    const players = [
      seat("p1", "A", true),
      seat("p2", "B"),
      seat("p3", "A"),
      seat("p4", "B"),
    ];

    it("activates team chrome and names the viewer's ally", () => {
      const t = deriveTeams(players);
      expect(t.active).toBe(true);
      expect(t.you).toBe("p1");
      expect(t.allies).toEqual(["p3"]);
    });

    it("classifies each seat relative to the viewer", () => {
      const t = deriveTeams(players);
      expect(t.relationOf("p1")).toBe("self");
      expect(t.relationOf("p3")).toBe("ally");
      expect(t.relationOf("p2")).toBe("hostile");
      expect(t.relationOf("p4")).toBe("hostile");
    });

    it("marks the viewer's whole team (self + ally) friendly for board chrome", () => {
      const t = deriveTeams(players);
      expect(t.friendlyOwners.sort()).toEqual(["p1", "p3"]);
      expect(t.isFriendly("p1")).toBe(true);
      expect(t.isFriendly("p3")).toBe(true);
      expect(t.isFriendly("p2")).toBe(false);
      expect(t.isFriendly("p4")).toBe(false);
    });

    it("is symmetric from an enemy seat's perspective", () => {
      const fromP2 = deriveTeams([
        seat("p1", "A"),
        seat("p2", "B", true),
        seat("p3", "A"),
        seat("p4", "B"),
      ]);
      expect(fromP2.allies).toEqual(["p4"]);
      expect(fromP2.relationOf("p1")).toBe("hostile");
      expect(fromP2.relationOf("p4")).toBe("ally");
    });
  });

  describe("non-team formats render no chrome", () => {
    it("duel: two singleton teams stay inactive", () => {
      const t = deriveTeams([seat("p1", "A", true), seat("p2", "B")]);
      expect(t.active).toBe(false);
      expect(t.allies).toEqual([]);
      expect(t.friendlyOwners).toEqual([]);
      expect(t.relationOf("p2")).toBe("hostile");
    });

    it("ffa-3: three singleton teams stay inactive (team present, all singletons)", () => {
      const t = deriveTeams([
        seat("p1", "A", true),
        seat("p2", "B"),
        seat("p3", "C"),
      ]);
      expect(t.active).toBe(false);
      expect(t.allies).toEqual([]);
      expect(t.isFriendly("p1")).toBe(false);
    });
  });

  describe("older server (no team field)", () => {
    it("stays inactive with no allies", () => {
      const t = deriveTeams([seat("p1", undefined, true), seat("p2")]);
      expect(t.active).toBe(false);
      expect(t.allies).toEqual([]);
      expect(t.friendlyOwners).toEqual([]);
    });
  });

  describe("viewer resolution", () => {
    it("falls back to youId when no seat is flagged you (god/spectator view)", () => {
      const players = [seat("p1", "A"), seat("p2", "B"), seat("p3", "A"), seat("p4", "B")];
      const t = deriveTeams(players, "p3");
      expect(t.you).toBe("p3");
      expect(t.allies).toEqual(["p1"]);
      expect(t.relationOf("p1")).toBe("ally");
    });

    it("has no allies when the viewer cannot be resolved at all", () => {
      const t = deriveTeams([seat("p1", "A"), seat("p2", "B"), seat("p3", "A"), seat("p4", "B")]);
      expect(t.you).toBeUndefined();
      expect(t.allies).toEqual([]);
      expect(t.friendlyOwners).toEqual([]);
    });
  });
});
