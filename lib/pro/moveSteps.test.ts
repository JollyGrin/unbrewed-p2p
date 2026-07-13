import {
  applyClick,
  canCommit,
  canStopAt,
  cancel,
  commitPath,
  isFresh,
  legalNextSteps,
  previewPosition,
  remaining,
  startStepping,
  stepsTaken,
  stepTo,
} from "./moveSteps";
import type { MoveGraph, SpaceId } from "./protocol";

// A tiny straight line of five spaces s0..s4 with bidirectional edges, plus a
// branch s2->s5. Every space is a legal resting spot unless noted.
const line = (allowance: number, stops?: Partial<Record<SpaceId, boolean>>): MoveGraph => {
  const ids: SpaceId[] = ["s0", "s1", "s2", "s3", "s4", "s5"];
  const edges: [SpaceId, SpaceId][] = [];
  const link = (a: SpaceId, b: SpaceId) => {
    edges.push([a, b], [b, a]);
  };
  link("s0", "s1");
  link("s1", "s2");
  link("s2", "s3");
  link("s3", "s4");
  link("s2", "s5");
  return {
    allowance,
    nodes: ids.map((space) => ({ space, canStop: stops?.[space] ?? true })),
    edges,
  };
};

describe("moveSteps — bookkeeping", () => {
  it("starts fresh at the origin with the full allowance", () => {
    const g = line(3);
    const s = startStepping("s0");
    expect(previewPosition(s)).toBe("s0");
    expect(stepsTaken(s)).toBe(0);
    expect(isFresh(s)).toBe(true);
    expect(remaining(g, s)).toBe(3);
    expect(canCommit(g, s)).toBe(false); // nothing to commit yet
  });

  it("counts hops and decrements remaining as the preview advances", () => {
    const g = line(3);
    let s = startStepping("s0");
    s = stepTo(g, s, "s1")!;
    expect(previewPosition(s)).toBe("s1");
    expect(remaining(g, s)).toBe(2);
    expect(isFresh(s)).toBe(false);
    s = stepTo(g, s, "s2")!;
    expect(remaining(g, s)).toBe(1);
    expect(commitPath(s)).toEqual(["s0", "s1", "s2"]);
  });
});

describe("moveSteps — legalNextSteps", () => {
  it("offers only the stoppable edge-neighbours of the preview position", () => {
    const g = line(3);
    const s = startStepping("s0");
    expect(legalNextSteps(g, s).sort()).toEqual(["s1"]);
    const s2 = stepTo(g, s, "s1")!;
    expect(legalNextSteps(g, s2).sort()).toEqual(["s0", "s2"]); // can step forward or BACK
  });

  it("offers nothing once the allowance is spent", () => {
    const g = line(1);
    const s = stepTo(g, startStepping("s0"), "s1")!;
    expect(remaining(g, s)).toBe(0);
    expect(legalNextSteps(g, s)).toEqual([]);
  });

  it("omits a neighbour that is not a legal resting spot (pass-through space)", () => {
    // s2 is friendly pass-through (canStop=false) — never a clickable step target.
    const g = line(3, { s2: false });
    const s = stepTo(g, startStepping("s0"), "s1")!;
    expect(legalNextSteps(g, s).sort()).toEqual(["s0"]);
  });
});

describe("moveSteps — canStopAt / canCommit", () => {
  it("always allows stopping at the origin (no-op / revisit)", () => {
    const g = line(3, { s0: false }); // even if the graph marks origin non-stoppable
    expect(canStopAt(g, "s0", "s0")).toBe(true);
  });

  it("forbids committing on a pass-through space but allows it one hop later", () => {
    const g = line(3, { s2: false });
    let s = stepTo(g, startStepping("s0"), "s1")!;
    // step onto s2 is not offered (pass-through); reach it via applyClick? no —
    // committing is only asked at a reachable preview, so drive to s3 legally:
    s = { origin: "s0", path: ["s0", "s1", "s2"] }; // hand-built mid-walk over a pass-through
    expect(canCommit(g, s)).toBe(false); // s2 not stoppable
    s = { origin: "s0", path: ["s0", "s1", "s2", "s3"] };
    expect(canCommit(g, s)).toBe(true); // s3 is stoppable
  });
});

describe("moveSteps — applyClick stepping", () => {
  it("advances one hop and keeps the preview open while budget remains", () => {
    const g = line(3);
    const r = applyClick(g, startStepping("s0"), "s1", null);
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(previewPosition(r.state)).toBe("s1");
    expect(r.commit).toBe(false); // 2 moves left — stay in preview
  });

  it("auto-commits when a hop spends the last of the allowance", () => {
    const g = line(1);
    const r = applyClick(g, startStepping("s0"), "s1", null);
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(r.commit).toBe(true);
    expect(commitPath(r.state)).toEqual(["s0", "s1"]);
  });

  it("supports back-and-forth ending one space from origin, then auto-commits", () => {
    const g = line(3);
    let s = startStepping("s0");
    let r = applyClick(g, s, "s1", null); // s0 -> s1  (2 left)
    expect(r.type === "step" && r.commit).toBe(false);
    if (r.type !== "step") return;
    s = r.state;
    r = applyClick(g, s, "s0", null); // s1 -> s0  (1 left)
    expect(r.type === "step" && r.commit).toBe(false);
    if (r.type !== "step") return;
    s = r.state;
    r = applyClick(g, s, "s1", null); // s0 -> s1  (0 left) => commit
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(r.commit).toBe(true);
    expect(commitPath(r.state)).toEqual(["s0", "s1", "s0", "s1"]); // 3 hops, ends 1 away
  });

  it("ignores a click that is neither a legal hop nor a fresh far destination", () => {
    const g = line(3);
    const s = stepTo(g, startStepping("s0"), "s1")!; // no longer fresh
    // s4 is far and reachable but we've already stepped — no client pathfinding.
    expect(applyClick(g, s, "s4", null).type).toBe("ignore");
  });
});

describe("moveSteps — applyClick far one-click (fresh only)", () => {
  it("commits the server's canonical path when it spends the whole allowance", () => {
    const g = line(3);
    const r = applyClick(g, startStepping("s0"), "s3", ["s0", "s1", "s2", "s3"]);
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(r.commit).toBe(true); // 3 hops == allowance 3 → behaves exactly as today
    expect(commitPath(r.state)).toEqual(["s0", "s1", "s2", "s3"]);
  });

  it("adopts a shorter far path as a preview when it leaves budget", () => {
    const g = line(3);
    const r = applyClick(g, startStepping("s0"), "s2", ["s0", "s1", "s2"]);
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(r.commit).toBe(false); // 1 move left — can keep stepping from s2
    expect(legalNextSteps(g, r.state).sort()).toEqual(["s1", "s3", "s5"]);
  });

  it("prepends the origin when the server omits it from the path", () => {
    const g = line(3);
    const r = applyClick(g, startStepping("s0"), "s3", ["s1", "s2", "s3"]);
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(commitPath(r.state)).toEqual(["s0", "s1", "s2", "s3"]);
  });

  it("rejects a far click once stepping has begun (not fresh)", () => {
    const g = line(3);
    const s = stepTo(g, startStepping("s0"), "s1")!;
    expect(applyClick(g, s, "s3", ["s0", "s1", "s2", "s3"]).type).toBe("ignore");
  });

  it("rejects a canonical path longer than the allowance", () => {
    const g = line(2);
    expect(applyClick(g, startStepping("s0"), "s3", ["s0", "s1", "s2", "s3"]).type).toBe("ignore");
  });
});

describe("moveSteps — cancel", () => {
  it("resets the preview to the origin (nothing was ever sent)", () => {
    const g = line(3);
    let s = stepTo(g, startStepping("s0"), "s1")!;
    s = stepTo(g, s, "s2")!;
    s = cancel(s);
    expect(previewPosition(s)).toBe("s0");
    expect(stepsTaken(s)).toBe(0);
    expect(isFresh(s)).toBe(true);
  });
});
