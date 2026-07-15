import { resolveSpaceMove } from "./moveResolve";
import { Action } from "./protocol";

const move = (fighter: string, dest: string): Action =>
  ({ type: "MOVE_FIGHTER", player: "p1", fighter, path: [dest] } as unknown as Action);
const place = (space: string): Action =>
  ({ type: "PLACE_SIDEKICK", player: "p1", sidekick: "p1/child", space } as unknown as Action);

describe("resolveSpaceMove", () => {
  it("returns none for an empty action list", () => {
    expect(resolveSpaceMove([], null)).toEqual({ kind: "none" });
  });

  it("commits the single action when only one fighter can move there", () => {
    const a = move("p1/hero", "s2");
    expect(resolveSpaceMove([a], null)).toEqual({ kind: "commit", action: a });
  });

  it("asks which fighter when TWO of your fighters can move to the same space (the bug)", () => {
    const hero = move("p1/hero", "s2");
    const child = move("p1/child", "s2");
    const res = resolveSpaceMove([hero, child], null);
    expect(res.kind).toBe("choose");
    expect(res.kind === "choose" && res.candidates.sort()).toEqual(["p1/child", "p1/hero"]);
  });

  it("collapses duplicate move actions for the SAME fighter to a single commit", () => {
    // one fighter, two enumerated paths to the same space → not ambiguous
    const a = move("p1/hero", "s2");
    const b = move("p1/hero", "s2");
    expect(resolveSpaceMove([a, b], null)).toEqual({ kind: "commit", action: a });
  });

  it("pre-selecting a fighter narrows an otherwise-ambiguous space to a direct commit", () => {
    const hero = move("p1/hero", "s2");
    const child = move("p1/child", "s2");
    expect(resolveSpaceMove([hero, child], "p1/hero")).toEqual({ kind: "commit", action: hero });
  });

  it("treats a lone PLACE_SIDEKICK as a direct commit (not a fighter-move ambiguity)", () => {
    const p = place("s2");
    expect(resolveSpaceMove([p], null)).toEqual({ kind: "commit", action: p });
  });

  it("returns none when a selected fighter has no move to this space", () => {
    const child = move("p1/child", "s2");
    expect(resolveSpaceMove([child], "p1/hero")).toEqual({ kind: "none" });
  });
});
