import {
  addClip,
  createMotion,
  DROP_LIFT,
  dropDelta,
  faceTo,
  FLINCH_MS,
  flinchDelta,
  headingDeg,
  HELD_LIFT,
  HELD_MS,
  holdLift,
  HOP_LIFT,
  LUNGE_LEAN_DEG,
  lungeDelta,
  pathProgress,
  recoilDelta,
  REST_FACING_DEG,
  sampleMotion,
  setWalking,
  TOPPLE_LEAN_DEG,
  TOPPLE_MS,
  toppleDelta,
  turnDeg,
  TURN_MS,
  walkPose,
  wrapDeg,
  type MotionInput,
} from "./pose";

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const input = (over: Partial<MotionInput> = {}): MotionInput => ({
  at: { x: 0.4, y: 0.6 },
  path: null,
  aspect: 1,
  base: { x: 0.05, y: 0.05 },
  reduced: false,
  ...over,
});

describe("facing", () => {
  test("heading: 0 faces the near edge (+y), 90 faces +x", () => {
    close(headingDeg(0, 1), 0);
    close(headingDeg(1, 0), 90);
    close(headingDeg(-1, 0), -90);
    close(Math.abs(headingDeg(0, -1)), 180);
  });
  test("heading weighs x by the board's aspect (normalized units are not square)", () => {
    // 0.1 across a 2:1 board is as long on screen as 0.2 down it.
    close(headingDeg(0.1, 0.2, 2), 45);
  });
  test("wrap and turn go the short way round", () => {
    expect(wrapDeg(190)).toBe(-170);
    expect(wrapDeg(-180)).toBe(180);
    // 170 → -170 crosses 180, never back through 0.
    expect(Math.abs(turnDeg(170, -170, 0.5))).toBeCloseTo(180, 5);
    close(turnDeg(10, 50, 0), 10);
    close(turnDeg(10, 50, 1), 50);
  });
});

describe("walk: one hop per space", () => {
  const xs = [0.1, 0.3, 0.3];
  const ys = [0.5, 0.5, 0.7];

  test("progress by distance: 0 on a node, 0.5 mid-segment", () => {
    expect(pathProgress(xs, ys, { x: 0.1, y: 0.5 })).toEqual({ seg: 0, u: 0 });
    const mid = pathProgress(xs, ys, { x: 0.2, y: 0.5 });
    expect(mid.seg).toBe(0);
    close(mid.u, 0.5);
    const second = pathProgress(xs, ys, { x: 0.3, y: 0.65 });
    expect(second.seg).toBe(1);
    close(second.u, 0.75);
  });

  test("a path that doubles back resolves to the segment the hint says it is on", () => {
    const bx = [0.1, 0.3, 0.1], by = [0.5, 0.5, 0.5];
    expect(pathProgress(bx, by, { x: 0.25, y: 0.5 }, 1, 0).seg).toBe(0);
    expect(pathProgress(bx, by, { x: 0.25, y: 0.5 }, 1, 1).seg).toBe(1);
  });

  test("the feet are exactly the anchor's position — never off the base", () => {
    for (const at of [{ x: 0.17, y: 0.5 }, { x: 0.3, y: 0.61 }]) {
      const p = walkPose(xs, ys, at);
      expect([p.x, p.y]).toEqual([at.x, at.y]);
    }
  });

  test("lift is 0 on every node and peaks at HOP_LIFT mid-segment", () => {
    for (const [x, y] of [[0.1, 0.5], [0.3, 0.5], [0.3, 0.7]]) close(walkPose(xs, ys, { x, y }).lift, 0);
    close(walkPose(xs, ys, { x: 0.2, y: 0.5 }).lift, HOP_LIFT);
    close(walkPose(xs, ys, { x: 0.3, y: 0.6 }, 1, 1).lift, HOP_LIFT);
  });

  test("faces along the segment, swivelling through the corner without a snap", () => {
    close(walkPose(xs, ys, { x: 0.2, y: 0.5 }).facingDeg, 90); // along +x
    close(walkPose(xs, ys, { x: 0.3, y: 0.6 }, 1, 1).facingDeg, 0); // along +y
    // Either side of the corner node meets at the halfway heading.
    const before = walkPose(xs, ys, { x: 0.3 - 1e-7, y: 0.5 }).facingDeg;
    const after = walkPose(xs, ys, { x: 0.3, y: 0.5 + 1e-7 }, 1, 1).facingDeg;
    expect(Math.abs(before - 45)).toBeLessThan(0.01);
    expect(Math.abs(after - 45)).toBeLessThan(0.01);
  });
});

describe("clip curves", () => {
  test("lunge: winds back, peaks at the contact moment (t = 0.44), returns", () => {
    expect(lungeDelta(0).leanDeg).toBeCloseTo(0, 6);
    expect(lungeDelta(0.2).leanDeg).toBeLessThan(0);
    expect(lungeDelta(0.44).leanDeg).toBeCloseTo(LUNGE_LEAN_DEG, 6);
    expect(lungeDelta(0.44).fwd).toBeGreaterThan(0);
    expect(lungeDelta(1).leanDeg).toBeCloseTo(0, 6);
    expect(lungeDelta(1).fwd).toBeCloseTo(0, 6);
    expect(lungeDelta(0.44, 0.5).leanDeg).toBeCloseTo(LUNGE_LEAN_DEG / 2, 6);
  });
  test("recoil: tips BACK (negative lean, slides back), scaled by strength, settles", () => {
    const hit = recoilDelta(0.18);
    expect(hit.leanDeg).toBeLessThan(0);
    expect(hit.fwd).toBeLessThan(0);
    expect(recoilDelta(0.18, 2).leanDeg).toBeCloseTo(2 * hit.leanDeg, 6);
    expect(recoilDelta(1).leanDeg).toBeCloseTo(0, 6);
  });
  test("flinch: a decaying shake that starts and ends upright", () => {
    expect(flinchDelta(0).leanDeg).toBeCloseTo(0, 6);
    expect(flinchDelta(1).leanDeg).toBeCloseTo(0, 6);
    expect(Math.abs(flinchDelta(1 / 12).leanDeg)).toBeGreaterThan(3);
    // Each wobble is smaller than the last.
    expect(Math.abs(flinchDelta(7 / 12).leanDeg)).toBeLessThan(Math.abs(flinchDelta(1 / 12).leanDeg) / 2);
  });
  test("topple: falls flat backwards and fades out", () => {
    expect(toppleDelta(0)).toMatchObject({ leanDeg: -0, opacity: 1 });
    expect(toppleDelta(0.55).leanDeg).toBeCloseTo(-TOPPLE_LEAN_DEG, 6);
    expect(toppleDelta(1).leanDeg).toBeCloseTo(-TOPPLE_LEAN_DEG, 6);
    expect(toppleDelta(1).opacity).toBeCloseTo(0, 6);
    // It accelerates (gravity): the first half of the fall covers less than half the angle.
    expect(-toppleDelta(0.275).leanDeg).toBeLessThan(TOPPLE_LEAN_DEG / 2);
  });
  test("drop: from DROP_LIFT onto the base, one small bounce, lands at 0", () => {
    expect(dropDelta(0).lift).toBeCloseTo(DROP_LIFT, 6);
    expect(dropDelta(0.7).lift).toBeCloseTo(0, 6);
    // It lands (no jump at the bounce): just before t = 0.7 it is already down.
    expect(dropDelta(0.699).lift).toBeLessThan(0.01);
    expect(dropDelta(0.35).lift).toBeLessThan(DROP_LIFT);
    expect(dropDelta(0.85).lift).toBeGreaterThan(0);
    expect(dropDelta(1).lift).toBeCloseTo(0, 6);
  });
});

describe("the timeline", () => {
  test("a fresh mini stands still at its resting facing and is idle", () => {
    const f = sampleMotion(createMotion(0), 0, input());
    expect(f.busy).toBe(false);
    expect(f.pose).toEqual({ x: 0.4, y: 0.6, facingDeg: REST_FACING_DEG, lift: 0, leanDeg: 0 });
  });

  test("a clip is busy while it plays, waits out its delay, then is dropped", () => {
    const m = addClip(createMotion(0), "flinch", 0, FLINCH_MS, 100);
    expect(sampleMotion(m, 50, input()).pose.leanDeg).toBe(0); // still in its delay
    expect(sampleMotion(m, 50, input()).busy).toBe(true);
    expect(sampleMotion(m, 100 + FLINCH_MS / 12, input()).pose.leanDeg).not.toBe(0);
    const end = sampleMotion(m, 100 + FLINCH_MS + 1, input());
    expect(end.busy).toBe(false);
    expect(end.next.clips).toHaveLength(0);
    expect(end.pose.leanDeg).toBe(0);
  });

  test("a lunge slides the feet toward where it faces, by base diameters", () => {
    let m = createMotion(0);
    m = faceTo(m, 90, 0); // face +x
    m = addClip(m, "lunge", 0, 1000);
    const p = sampleMotion(m, 440, input()).pose;
    expect(p.x).toBeGreaterThan(0.4);
    close(p.y, 0.6, 1e-9);
  });

  test("the select lift holds while held and releases, then goes idle", () => {
    const m = holdLift(createMotion(0), true, 0);
    expect(sampleMotion(m, HELD_MS / 2, input()).busy).toBe(true);
    const held = sampleMotion(m, HELD_MS + 1, input());
    expect(held.busy).toBe(false);
    close(held.pose.lift, HELD_LIFT);
    const off = holdLift(m, false, 1000);
    close(sampleMotion(off, 1000 + HELD_MS + 1, input()).pose.lift, 0);
  });

  test("turning takes at most TURN_MS and lands exactly on the target", () => {
    const m = faceTo(createMotion(0), 180, 0);
    expect(sampleMotion(m, TURN_MS / 2, input()).busy).toBe(true);
    const done = sampleMotion(m, TURN_MS + 1, input());
    expect(done.busy).toBe(false);
    expect(Math.abs(done.pose.facingDeg)).toBeCloseTo(180, 6);
  });

  test("walking follows the path, then settles back to its resting facing", () => {
    const path = { xs: [0.1, 0.3], ys: [0.5, 0.5] };
    let m = setWalking(createMotion(0), true, 0, REST_FACING_DEG);
    const mid = sampleMotion(m, 10, input({ at: { x: 0.2, y: 0.5 }, path }));
    expect(mid.busy).toBe(true);
    close(mid.pose.lift, HOP_LIFT);
    close(mid.pose.facingDeg, 90);
    m = setWalking(mid.next, false, 20, REST_FACING_DEG);
    expect(sampleMotion(m, 20, input({ at: { x: 0.3, y: 0.5 } })).pose.facingDeg).toBeCloseTo(90, 6);
    const settled = sampleMotion(m, 20 + TURN_MS + 1, input({ at: { x: 0.3, y: 0.5 } }));
    expect(settled.busy).toBe(false);
    close(settled.pose.facingDeg, REST_FACING_DEG);
  });

  test("a topple ends lying down and faded — and idle, so it requests no frames", () => {
    const m = addClip(createMotion(0), "topple", 0, TOPPLE_MS);
    const end = sampleMotion(m, TOPPLE_MS + 50, input());
    expect(end.busy).toBe(false);
    expect(end.pose.leanDeg).toBeCloseTo(-TOPPLE_LEAN_DEG, 6);
    expect(end.pose.opacity).toBeCloseTo(0, 6);
  });

  test("REDUCED MOTION: every motion is off — the plain standing pose, idle", () => {
    let m = createMotion(0);
    m = addClip(m, "lunge", 0, 1000);
    m = addClip(m, "drop", 0, 400);
    m = holdLift(m, true, 0);
    m = faceTo(m, 90, 0);
    m = setWalking(m, true, 0, 0);
    const f = sampleMotion(m, 200, input({ reduced: true, path: { xs: [0, 1], ys: [0, 0] }, at: { x: 0.5, y: 0 } }));
    expect(f.busy).toBe(false);
    expect(f.pose).toEqual({ x: 0.5, y: 0, facingDeg: 0, lift: 0, leanDeg: 0 });
  });
});
