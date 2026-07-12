import { deriveTeams, isViewerOnWinningTeam, TeamSeat, WinnerView } from "./teams";

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

describe("isViewerOnWinningTeam", () => {
  // Build the minimal WinnerView the helper reads.
  const view = (winner: string | null, you: string, players: TeamSeat[]) =>
    ({ winner, you, players } as WinnerView);

  describe("team-2v2 (winner ≠ viewer, same team)", () => {
    // Seating A1,B1,A2,B2 → p1&p3 (team A) vs p2&p4 (team B). Engine reports the
    // first living winner by seat order (p1), even when p3 dealt the kill.
    const players = [
      seat("p1", "A"),
      seat("p2", "B"),
      seat("p3", "A"),
      seat("p4", "B"),
    ];

    it("the winning teammate (p3) who ISN'T the reported winner still sees VICTORY", () => {
      expect(isViewerOnWinningTeam(view("p1", "p3", players))).toBe(true);
    });

    it("the reported winner (p1) sees VICTORY", () => {
      expect(isViewerOnWinningTeam(view("p1", "p1", players))).toBe(true);
    });

    it("both losers (p2, p4) see DEFEAT", () => {
      expect(isViewerOnWinningTeam(view("p1", "p2", players))).toBe(false);
      expect(isViewerOnWinningTeam(view("p1", "p4", players))).toBe(false);
    });
  });

  describe("duel (2 singleton teams) — unchanged", () => {
    const players = [seat("p1", "A"), seat("p2", "B")];

    it("only the actual winner sees VICTORY", () => {
      expect(isViewerOnWinningTeam(view("p1", "p1", players))).toBe(true);
      expect(isViewerOnWinningTeam(view("p1", "p2", players))).toBe(false);
    });
  });

  describe("ffa-3 (3 singleton teams) — unchanged", () => {
    const players = [seat("p1", "A"), seat("p2", "B"), seat("p3", "C")];

    it("only the actual winner sees VICTORY", () => {
      expect(isViewerOnWinningTeam(view("p2", "p2", players))).toBe(true);
      expect(isViewerOnWinningTeam(view("p2", "p1", players))).toBe(false);
      expect(isViewerOnWinningTeam(view("p2", "p3", players))).toBe(false);
    });
  });

  describe("older server (no team field) — identical to today", () => {
    const players = [seat("p1"), seat("p2")];

    it("falls back to winner === you", () => {
      expect(isViewerOnWinningTeam(view("p1", "p1", players))).toBe(true);
      expect(isViewerOnWinningTeam(view("p1", "p2", players))).toBe(false);
    });
  });

  it("returns false while no winner is set", () => {
    expect(
      isViewerOnWinningTeam(view(null, "p1", [seat("p1", "A"), seat("p2", "A")])),
    ).toBe(false);
  });

  // Forfeit = voluntary seat elimination (unbrewed-engine #117): the forfeiter
  // resigns their SEAT, not their team's outcome. The win/loss decision keys off
  // the unchanged per-seat `team`, so a forfeiter whose team finishes the job
  // still sees VICTORY — locked in here so the game-over composition can't
  // regress to flashing DEFEAT at a player on the winning team.
  describe("forfeited player, game continues then ends (team-2v2)", () => {
    // A1,B1,A2,B2 → p1&p3 (team A) vs p2&p4 (team B).
    const players = [
      seat("p1", "A"),
      seat("p2", "B"),
      seat("p3", "A"),
      seat("p4", "B"),
    ];

    it("forfeiter (p3) whose bot teammate (p1) wins sees VICTORY", () => {
      expect(isViewerOnWinningTeam(view("p1", "p3", players))).toBe(true);
    });

    it("forfeiter (p2) on the losing team sees DEFEAT", () => {
      expect(isViewerOnWinningTeam(view("p1", "p2", players))).toBe(false);
    });
  });
});
