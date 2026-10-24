import { promptSubjectId, promptSubjectLine } from "@/lib/pro/promptSubject";
import { teamDecisionModel } from "@/lib/pro/adventureBoard";
import type { PlayerView } from "@/lib/pro/protocol";

// A minimal synthetic pack — deliberately not any shipped scenario.
const f = (id: string, name: string, extra: object = {}) => ({
  id, owner: "p1", kind: "HERO", name, space: "x", tailSpace: null, hp: 5, maxHp: 5,
  reach: "MELEE", size: "NORMAL", defeated: false, ...extra,
});
const view = (prompt: object): PlayerView =>
  ({
    you: "p1",
    players: [{ id: "p1", displayName: "Ada" }, { id: "p2", displayName: "Bo" }],
    fighters: [
      f("p1/hero", "Zed"),
      f("p2/hero", "Quill", { owner: "p2" }),
      f("e1/a", "Gizmo", { owner: "e1", kind: "SIDEKICK", enemy: { role: "MINION", move: 2, deckCount: 0, discardTop: null } }),
    ],
    map: { spaces: [{ id: "s1" }, { id: "s2" }] },
    prompt: { promptId: "pr", player: "p1", kind: "CHOOSE_SPACE", options: [], ...prompt },
  }) as unknown as PlayerView;

describe("prompt subject (#1409)", () => {
  it("names the placed fighter and who acts; absent subject keeps today's prompt", () => {
    const v = view({ subject: "p2/hero", description: "Choose a space to place the fighter" });
    expect(promptSubjectId(v)).toBe("p2/hero");
    expect(promptSubjectLine(v, "Choose a space to place the fighter")).toBe(
      "You — Choose a space to place Quill",
    );
    const none = view({ description: "Choose a space to place the fighter" });
    expect(promptSubjectId(none)).toBeNull();
    expect(promptSubjectLine(none, "x")).toBeNull();
    expect(promptSubjectId(view({ subject: "nope/id" }))).toBeNull();
  });

  it("appends the moved fighter and names another seat's choice", () => {
    const v = view({ subject: "p1/hero", player: "p2", description: "Move up to 2 spaces" });
    expect(promptSubjectLine(v, "Move up to 2 spaces")).toBe("Bo — Move up to 2 spaces (Zed)");
  });

  it("never names a seat by its raw id (#1473): an unnamed seat with no fighter reads as its nameplate", () => {
    const v = view({ subject: "p1/hero", player: "p2", description: "Move up to 2 spaces" });
    (v as unknown as { players: object[] }).players = [{ id: "p1" }, { id: "p2" }];
    v.fighters = v.fighters.filter((f) => f.owner !== "p2");
    expect(promptSubjectLine(v, "Move up to 2 spaces")).toBe("Opponent — Move up to 2 spaces (Zed)");
    (v as unknown as { players: object[] }).players = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
    expect(promptSubjectLine(v, "Move up to 2 spaces")).toBe("P2 — Move up to 2 spaces (Zed)");
    expect(promptSubjectLine(v, "Move up to 2 spaces")).not.toMatch(/\bp2\b/);
  });

  it("two copies of the same hero: the subject carries its seat, so the line is never ambiguous", () => {
    const v = view({ subject: "p2/hero", description: "Choose a space to place the fighter" });
    v.fighters = v.fighters.map((f) => (f.id === "p2/hero" ? { ...f, name: "Zed" } : f));
    expect(promptSubjectLine(v, "Choose a space to place the fighter")).toBe("You — Choose a space to place Zed (Bo)");
    const mine = view({ subject: "p1/hero", player: "p2", description: "Move up to 2 spaces" });
    mine.fighters = mine.fighters.map((f) => (f.id === "p2/hero" ? { ...f, name: "Zed" } : f));
    expect(promptSubjectLine(mine, "Move up to 2 spaces")).toBe("Bo — Move up to 2 spaces (Zed (Ada))");
  });

  it("TEAM prompt: the deciding enemy is the actor, with its role by kind", () => {
    const v = view({
      subject: "e1/a",
      onBehalfOf: "TEAM",
      forSeat: "e1",
      description: "Choose a fighter to take 2 damage",
      player: "p2",
    });
    expect(promptSubjectLine(v, "Choose a fighter to take 2 damage")).toBe(
      "Gizmo (minion) — Choose a fighter to take 2 damage",
    );
    expect(teamDecisionModel(v)?.forName).toBe("Gizmo");
  });
});
