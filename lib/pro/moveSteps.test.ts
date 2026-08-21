import {
  applyClick,
  canCommit,
  canStopAt,
  cancel,
  commitPath,
  isFresh,
  legalNextSteps,
  previewPosition,
  isPoseGraph,
  leadOf,
  parsePose,
  poseGraph,
  poseNode,
  poseStopKey,
  previewPose,
  restrictStops,
  remaining,
  startStepping,
  stepsTaken,
  stepTo,
} from "./moveSteps";
import type { LargeMoveGraph, MoveGraph, SpaceId } from "./protocol";

// A small line of spaces s0..s5 with bidirectional edges, plus a branch s2->s5.
// Mirrors the engine graph (issue #55): the ORIGIN s0 is a node with
// `canStop=false` (staying put is END_MANEUVER); every other space is a legal
// resting spot unless overridden.
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
    fighter: "p1/hero",
    allowance,
    nodes: ids.map((space) => ({
      space,
      canStop: stops?.[space] ?? space !== "s0", // origin non-stoppable by default
    })),
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
  it("offers the edge-neighbours of the preview position (incl. stepping BACK)", () => {
    const g = line(3);
    const s = startStepping("s0");
    expect(legalNextSteps(g, s).sort()).toEqual(["s1"]);
    const s2 = stepTo(g, s, "s1")!;
    // From s1 (rem 2) you may step forward to s2 OR back to the origin s0 — the
    // origin is non-stoppable but there is budget (rem ≥ 2) to leave it again.
    expect(legalNextSteps(g, s2).sort()).toEqual(["s0", "s2"]);
  });

  it("offers nothing once the allowance is spent", () => {
    const g = line(1);
    const s = stepTo(g, startStepping("s0"), "s1")!;
    expect(remaining(g, s)).toBe(0);
    expect(legalNextSteps(g, s)).toEqual([]);
  });

  it("offers a pass-through (non-stoppable) neighbour while there is budget to leave it", () => {
    const g = line(3, { s2: false }); // s2 is pass-through only
    const s = stepTo(g, startStepping("s0"), "s1")!; // rem 2 at s1
    expect(legalNextSteps(g, s)).toContain("s2");
  });

  it("withholds a pass-through neighbour when only one step remains (would strand)", () => {
    const g = line(2, { s2: false }); // s2 pass-through; s1 stoppable
    const s = stepTo(g, startStepping("s0"), "s1")!; // rem 1 at s1
    // s2 (pass-through) and s0 (origin, non-stoppable) both need rem ≥ 2 to leave.
    expect(legalNextSteps(g, s)).not.toContain("s2");
    expect(legalNextSteps(g, s)).not.toContain("s0");
  });
});

describe("moveSteps — canStopAt / canCommit", () => {
  it("never lets the fighter END on its own start space (origin canStop=false)", () => {
    const g = line(3);
    expect(canStopAt(g, "s0")).toBe(false);
    // step out and back to origin — committing there is still forbidden
    let s = stepTo(g, startStepping("s0"), "s1")!;
    s = stepTo(g, s, "s0")!;
    expect(previewPosition(s)).toBe("s0");
    expect(canCommit(g, s)).toBe(false);
  });

  it("forbids committing on a pass-through space but allows it one hop later", () => {
    const g = line(3, { s2: false });
    let s: ReturnType<typeof startStepping> = { origin: "s0", path: ["s0", "s1", "s2"] };
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

// ---------------------------------------------------------------------------
// Incremental EFFECT movement (issue #654 ↔ engine #411): the very same machine,
// fed by a CHOOSE_SPACE prompt's `moveGraph` instead of `view.moveGraphs`.
// ---------------------------------------------------------------------------

describe("moveSteps — restrictStops (prompt options are the resting places)", () => {
  it("keeps only the spaces the prompt offers as stoppable", () => {
    const g = restrictStops(line(3), ["s1", "s3"]);
    expect(canStopAt(g, "s1")).toBe(true);
    expect(canStopAt(g, "s3")).toBe(true);
    expect(canStopAt(g, "s2")).toBe(false); // traversable, but not an offered answer
    expect(canStopAt(g, "s4")).toBe(false);
  });

  it("never widens: the mover's own start space stays non-stoppable", () => {
    const g = restrictStops(line(3), ["s0", "s1"]);
    expect(canStopAt(g, "s0")).toBe(false); // staying put is the `stay`/`decline` option
    expect(canStopAt(g, "s1")).toBe(true);
  });

  it("leaves traversal untouched — a non-offered space is still walkable", () => {
    const g = restrictStops(line(3), ["s3"]);
    expect(g.allowance).toBe(3);
    expect(g.edges).toEqual(line(3).edges);
    const s = stepTo(g, startStepping("s0"), "s1")!; // rem 2 → may cross s2
    expect(legalNextSteps(g, s)).toContain("s2");
    expect(canCommit(g, stepTo(g, s, "s2")!)).toBe(false); // …but not stop there
  });

  it("does not mutate the graph it was handed", () => {
    const g = line(3);
    restrictStops(g, ["s1"]);
    expect(canStopAt(g, "s3")).toBe(true);
  });
});

describe("moveSteps — applyClick commitFarJump (effect-move prompts)", () => {
  it("commits a far one-click immediately even with budget left over", () => {
    const g = restrictStops(line(3), ["s1", "s2", "s3"]);
    const r = applyClick(g, startStepping("s0"), "s2", ["s0", "s1", "s2"], { commitFarJump: true });
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(r.commit).toBe(true); // one click on a far offered space still answers at once
    expect(commitPath(r.state)).toEqual(["s0", "s1", "s2"]);
  });

  it("still walks a ONE-HOP click instead of committing it (that is the whole feature)", () => {
    const g = restrictStops(line(3), ["s1", "s2", "s3"]);
    const r = applyClick(g, startStepping("s0"), "s1", ["s0", "s1"], { commitFarJump: true });
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(r.commit).toBe(false); // 2 left — the player keeps stepping
    expect(remaining(g, r.state)).toBe(2);
  });

  it("refuses a far one-click onto a space the prompt does not offer", () => {
    const g = restrictStops(line(3), ["s3"]); // only s3 is an answer
    expect(applyClick(g, startStepping("s0"), "s2", ["s0", "s1", "s2"], { commitFarJump: true }).type).toBe(
      "ignore",
    );
  });

  it("walks a back-and-forth route and commits the ROUTE, not the shortest path", () => {
    // "Move up to 3": s0 → s1 → s2 → s1, ending one space from home having crossed s2.
    const g = restrictStops(line(3), ["s1", "s2", "s3", "s4", "s5"]);
    let s = startStepping("s0");
    for (const hop of ["s1", "s2", "s1"]) {
      const r = applyClick(g, s, hop, null, { commitFarJump: true });
      expect(r.type).toBe("step");
      if (r.type !== "step") return;
      s = r.state;
    }
    expect(canCommit(g, s)).toBe(true);
    expect(commitPath(s)).toEqual(["s0", "s1", "s2", "s1"]);
  });

  it("cannot commit while parked at the origin (mandatory moves have a `stay` option instead)", () => {
    const g = restrictStops(line(3), ["s1", "s2"]);
    expect(canCommit(g, startStepping("s0"))).toBe(false);
    let s = stepTo(g, startStepping("s0"), "s1")!;
    s = stepTo(g, s, "s0")!; // wandered back home
    expect(canCommit(g, s)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LARGE (two-space) movers — issue #658 / engine #415
// ---------------------------------------------------------------------------
// A LARGE body occupies an ORDERED POSE, so the server ships a `LargeMoveGraph`
// (poses + snake-step edges) instead of a `MoveGraph`. `poseGraph` folds it into
// the very same graph the machine above walks — these tests drive the folded graph
// through the SAME entry points, which is the point: no fork, one state machine.
//
// The little board (undirected):
//
//        c1
//       /  \            a1 — a2 — a3
//     a1 — a2           |    |     |
//      |    |           b1 — b2 — b3
//     b1 — b2 — b3 — a3
//
const GRID: Record<SpaceId, SpaceId[]> = {
  a1: ["a2", "b1", "c1"],
  a2: ["a1", "a3", "b2", "c1"],
  a3: ["a2", "b3"],
  b1: ["a1", "b2"],
  b2: ["b1", "b3", "a2"],
  b3: ["b2", "a3"],
  c1: ["a1", "a2"],
};

/**
 * Build the LARGE graph the engine would send for a body starting on `start`.
 * Poses = every ordered adjacent pair; edges = every snake step (lead advances to a
 * neighbour ≠ trail, trail follows into the lead's former space). `canStop` is false
 * on the start pose (both orientations — a zero-net move is not a move) and on any
 * pose touching an `occupied` space (traversable, but not a resting place).
 */
const largeGraph = (
  allowance: number,
  start: [SpaceId, SpaceId],
  occupied: SpaceId[] = []
): LargeMoveGraph => {
  const pairs: [SpaceId, SpaceId][] = [];
  for (const [lead, neighbours] of Object.entries(GRID)) {
    for (const trail of neighbours) pairs.push([lead, trail]);
  }
  const isStart = (a: SpaceId, b: SpaceId) =>
    (a === start[0] && b === start[1]) || (a === start[1] && b === start[0]);
  const edges: [[SpaceId, SpaceId], [SpaceId, SpaceId]][] = [];
  for (const [lead, trail] of pairs) {
    for (const next of GRID[lead]) {
      if (next === trail) continue; // the body cannot pass through itself
      edges.push([
        [lead, trail],
        [next, lead],
      ]);
    }
  }
  return {
    fighter: "p1/hero",
    allowance,
    poses: pairs.map(([lead, trail]) => ({
      lead,
      trail,
      canStop: !isStart(lead, trail) && !occupied.includes(lead) && !occupied.includes(trail),
    })),
    edges,
  };
};

/** The graph + a fresh preview for a body lying on `start` (head first). */
const largeStart = (allowance: number, start: [SpaceId, SpaceId], occupied: SpaceId[] = []) => ({
  g: poseGraph(largeGraph(allowance, start, occupied)),
  s: startStepping(poseNode(start[0], start[1])),
});

describe("moveSteps — LARGE pose graphs", () => {
  it("folds poses and snake steps into plain graph nodes", () => {
    const g = poseGraph(largeGraph(2, ["a1", "a2"]));
    expect(isPoseGraph(g)).toBe(true);
    expect(g.nodes).toContainEqual({ space: "b1|a1", canStop: true });
    expect(g.nodes).toContainEqual({ space: "a1|a2", canStop: false }); // start pose
    expect(g.nodes).toContainEqual({ space: "a2|a1", canStop: false }); // …either way round
    expect(g.edges).toContainEqual(["a1|a2", "b1|a1"]);
    expect(parsePose("b1|a1")).toEqual({ lead: "b1", trail: "a1" });
    expect(parsePose("b1")).toBeNull();
  });

  it("a NORMAL graph is not a pose graph", () => {
    expect(isPoseGraph(line(2))).toBe(false);
  });

  it("offers first steps led by EITHER end of the body", () => {
    const { g, s } = largeStart(2, ["a1", "a2"]);
    // a1 leading: only b1 (c1 too, tested below); a2 leading: a3, b2, c1.
    expect(legalNextSteps(g, s).sort()).toEqual(["a3|a2", "b1|a1", "b2|a2", "c1|a1", "c1|a2"].sort());
  });

  it("never offers a step back into the trail (the body can't pass through itself)", () => {
    const { g, s } = largeStart(3, ["a1", "a2"]);
    const after = stepTo(g, s, "b1|a1")!; // lead a1 → b1, body now (b1, a1)
    expect(legalNextSteps(g, after).map(leadOf)).not.toContain("a1");
    expect(legalNextSteps(g, after).sort()).toEqual(["b2|b1"].sort());
  });

  it("drags the trail into the lead's former space on every step", () => {
    const { g, s } = largeStart(3, ["a1", "a2"]);
    let walked = stepTo(g, s, "a3|a2")!; // a2 led into a3, a1 → a2
    expect(previewPose(walked)).toEqual({ lead: "a3", trail: "a2" });
    walked = stepTo(g, walked, "b3|a3")!;
    expect(previewPose(walked)).toEqual({ lead: "b3", trail: "a3" });
    // The wire path is the LEADING END's route, starting from the end that led.
    expect(commitPath(walked)).toEqual(["a2", "a3", "b3"]);
    expect(remaining(g, walked)).toBe(1);
  });

  it("rewrites the start orientation to the end that actually led", () => {
    const { g, s } = largeStart(2, ["a1", "a2"]);
    expect(commitPath(stepTo(g, s, "b1|a1")!)).toEqual(["a1", "b1"]); // head led
    expect(commitPath(stepTo(g, s, "a3|a2")!)).toEqual(["a2", "a3"]); // tail led
  });

  it("cannot end on a pose whose second space is occupied, but may walk through it", () => {
    const { g, s } = largeStart(4, ["a1", "a2"], ["b3"]);
    const via = stepTo(g, stepTo(g, s, "a3|a2")!, "b3|a3")!;
    expect(canCommit(g, via)).toBe(false); // b3 is occupied by another body
    const on = stepTo(g, via, "b2|b3")!;
    expect(canCommit(g, on)).toBe(false); // the tail is still on b3
    const off = stepTo(g, on, "b1|b2")!;
    expect(canCommit(g, off)).toBe(true);
    expect(commitPath(off)).toEqual(["a2", "a3", "b3", "b2", "b1"]);
  });

  it("stops offering a non-stoppable pose when there is no budget to leave it again", () => {
    const { g, s } = largeStart(2, ["a1", "a2"], ["b3"]);
    const one = stepTo(g, s, "a3|a2")!; // one step left, and b3 is occupied
    expect(legalNextSteps(g, one)).not.toContain("b3|a3");
    // With budget to leave again it IS offered — walking through is legal.
    const roomy = largeStart(3, ["a1", "a2"], ["b3"]);
    expect(legalNextSteps(roomy.g, stepTo(roomy.g, roomy.s, "a3|a2")!)).toContain("b3|a3");
  });

  it("cancel puts the body back on its original pose", () => {
    const { g, s } = largeStart(3, ["a1", "a2"]);
    const walked = stepTo(g, stepTo(g, s, "a3|a2")!, "b3|a3")!;
    const back = cancel(walked);
    expect(isFresh(back)).toBe(true);
    expect(previewPose(back)).toEqual({ lead: "a1", trail: "a2" });
    expect(legalNextSteps(g, back)).toEqual(legalNextSteps(g, s));
  });
});

describe("moveSteps — LARGE clicks", () => {
  it("walks one hop when the clicked space can only be led into one way", () => {
    const { g, s } = largeStart(3, ["a1", "a2"]);
    const r = applyClick(g, s, "b1", null);
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(previewPose(r.state)).toEqual({ lead: "b1", trail: "a1" });
    expect(r.commit).toBe(false);
  });

  it("asks which end leads when a first hop is reachable from BOTH body spaces", () => {
    const { g, s } = largeStart(2, ["a1", "a2"]);
    const r = applyClick(g, s, "c1", null); // c1 touches a1 and a2
    expect(r.type).toBe("choosePose");
    if (r.type !== "choosePose") return;
    expect(r.options.map((o) => o.pose.trail).sort()).toEqual(["a1", "a2"]);
    const keptA1 = r.options.find((o) => o.pose.trail === "a1")!;
    expect(commitPath(keptA1.state)).toEqual(["a1", "c1"]);
  });

  it("has no ambiguity to resolve once the leading end is fixed", () => {
    const { g, s } = largeStart(3, ["a1", "a2"]);
    const walked = stepTo(g, s, "b1|a1")!;
    expect(applyClick(g, walked, "b2", null).type).toBe("step");
  });

  it("auto-commits the hop that spends the last of the allowance", () => {
    const { g, s } = largeStart(1, ["a1", "a2"]);
    const r = applyClick(g, s, "b1", null);
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(r.commit).toBe(true);
    expect(commitPath(r.state)).toEqual(["a1", "b1"]);
  });

  it("adopts the server's canonical LEAD path on a far one-click", () => {
    const { g, s } = largeStart(2, ["a1", "a2"]);
    const r = applyClick(g, s, "b3", ["a2", "a3", "b3"]);
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(previewPose(r.state)).toEqual({ lead: "b3", trail: "a3" });
    expect(commitPath(r.state)).toEqual(["a2", "a3", "b3"]);
    expect(r.commit).toBe(true); // allowance spent
  });

  it("infers which end led when the server omits the start space", () => {
    const { g, s } = largeStart(2, ["a1", "a2"]);
    const r = applyClick(g, s, "a3", ["a3"]); // only a2 can reach a3
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(commitPath(r.state)).toEqual(["a2", "a3"]);
  });

  it("asks which pose was meant when one far space is offered under several", () => {
    const { g, s } = largeStart(2, ["a1", "a2"]);
    const r = applyClick(g, s, "b3", [
      ["a2", "a3", "b3"],
      ["a2", "b2", "b3"],
    ]);
    expect(r.type).toBe("choosePose");
    if (r.type !== "choosePose") return;
    expect(r.options.map((o) => o.pose.trail).sort()).toEqual(["a3", "b2"]);
  });

  it("refuses a far path the graph does not sanction", () => {
    const { g, s } = largeStart(3, ["a1", "a2"]);
    // a1 is not adjacent to b3, so no orientation of the body walks that route.
    expect(applyClick(g, s, "b3", ["a1", "b3"]).type).toBe("ignore");
  });

  it("refuses a far path longer than the allowance", () => {
    const { g, s } = largeStart(1, ["a1", "a2"]);
    expect(applyClick(g, s, "b3", ["a2", "a3", "b3"]).type).toBe("ignore");
  });

  it("refuses a far path ending on a pose it may not rest in", () => {
    const { g, s } = largeStart(2, ["a1", "a2"], ["b3"]);
    expect(applyClick(g, s, "b3", ["a2", "a3", "b3"]).type).toBe("ignore");
  });

  it("commits a far one-click straight away on an effect-move prompt", () => {
    const { g, s } = largeStart(3, ["a1", "a2"]);
    const r = applyClick(g, s, "b3", ["a2", "a3", "b3"], { commitFarJump: true });
    expect(r.type).toBe("step");
    if (r.type !== "step") return;
    expect(r.commit).toBe(true);
  });

  it("keeps a far click out of reach once the walk has begun", () => {
    const { g, s } = largeStart(3, ["a1", "a2"]);
    const walked = stepTo(g, s, "b1|a1")!;
    expect(applyClick(g, walked, "b3", ["a2", "a3", "b3"]).type).toBe("ignore");
  });
});

describe("moveSteps — restrictStops on poses", () => {
  it("keeps only the poses the prompt offers, matched whichever end leads", () => {
    const { g } = largeStart(2, ["a1", "a2"]);
    // The prompt offers exactly one destination, under its sorted poseKey.
    const narrowed = restrictStops(g, ["a1|b1"]);
    expect(canStopAt(narrowed, "b1|a1")).toBe(true);
    expect(canStopAt(narrowed, "a1|b1")).toBe(true);
    expect(canStopAt(narrowed, "a3|a2")).toBe(false);
    expect(poseStopKey("b1|a1")).toBe("a1|b1");
  });

  it("never widens: the start pose stays non-stoppable even if offered", () => {
    const { g } = largeStart(2, ["a1", "a2"]);
    expect(canStopAt(restrictStops(g, ["a1|a2"]), "a1|a2")).toBe(false);
  });
});
