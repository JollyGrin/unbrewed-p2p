import { densityBucket, miniCamera, miniPixelRatio, miniPlaneTransform, miniPlateBox, type TableRig } from "./camera";
import { standingPose, type MiniPose } from "./pose";

const rig = (over: Partial<TableRig> = {}): TableRig => ({
  frameW: 800,
  frameH: 560,
  tiltDeg: 40,
  yawDeg: 0,
  perspectiveRatio: 1.1,
  ...over,
});
const bounds = { min: [-0.7, 0, -0.7] as [number, number, number], max: [0.7, 1.9, 0.7] as [number, number, number], footprint: 1.4 };
const cam = (x: number, y: number, over: Partial<TableRig> = {}, pose: Partial<MiniPose> = {}) =>
  miniCamera({ rig: rig(over), pose: { ...standingPose(x, y), ...pose }, baseDiamPx: 30, bounds });

describe("miniCamera", () => {
  test("at the board centre the eye is straight on, 90° − tilt above the board", () => {
    const c = cam(0.5, 0.5);
    expect(c.elevationDeg).toBeCloseTo(50, 6);
    expect(c.azimuthDeg).toBeCloseTo(0, 6);
    expect(c.screenLeanDeg).toBeCloseTo(0, 6);
  });

  test("the rig is an input: another tilt moves the eye with it", () => {
    expect(cam(0.5, 0.5, { tiltDeg: 30 }).elevationDeg).toBeCloseTo(60, 6);
  });

  test("the near row is seen from higher up than the far row", () => {
    expect(cam(0.5, 0.9).elevationDeg).toBeGreaterThan(cam(0.5, 0.1).elevationDeg + 5);
  });

  test("a piece on the left is seen from its left and leans left on screen; mirrored on the right", () => {
    const left = cam(0.1, 0.8), right = cam(0.9, 0.8);
    expect(left.azimuthDeg).toBeGreaterThan(5);
    expect(right.azimuthDeg).toBeCloseTo(-left.azimuthDeg, 6);
    expect(left.screenLeanDeg).toBeLessThan(-3);
    expect(right.screenLeanDeg).toBeCloseTo(-left.screenLeanDeg, 6);
  });

  test("yaw breaks the mirror symmetry the way the stage turns", () => {
    const l = cam(0.1, 0.5, { yawDeg: 2.5 }), r = cam(0.9, 0.5, { yawDeg: 2.5 });
    expect(Math.abs(l.azimuthDeg + r.azimuthDeg)).toBeGreaterThan(0.5);
  });

  test("the canvas plane is lifted until its whole rectangle stands above the board", () => {
    for (const [x, y] of [[0.1, 0.1], [0.9, 0.9], [0.5, 0.5]]) {
      const c = cam(x, y);
      const t = (40 * Math.PI) / 180;
      const up = [0, -Math.sin(t), Math.cos(t)];
      for (const a of [c.rect.left, c.rect.left + c.rect.width])
        for (const b of [c.rect.top, c.rect.top + c.rect.height]) expect(up[0] * a + up[1] * b + up[2] * c.liftPx).toBeGreaterThan(0);
    }
  });

  test("the model matrix is a proper rotation scaled so the base spans the disc", () => {
    const m = cam(0.3, 0.7, { yawDeg: 2.5 }).model;
    const col = (i: number) => [m[4 * i], m[4 * i + 1], m[4 * i + 2]];
    const [r, u, n] = [col(0), col(1), col(2)];
    const len = (v: number[]) => Math.hypot(...v);
    for (const v of [r, u, n]) expect(len(v)).toBeCloseTo(30 / 1.4, 6);
    const det = r[0] * (u[1] * n[2] - u[2] * n[1]) - r[1] * (u[0] * n[2] - u[2] * n[0]) + r[2] * (u[0] * n[1] - u[1] * n[0]);
    expect(det).toBeGreaterThan(0);
  });

  test("the frustum is the canvas rectangle seen from the eye", () => {
    const c = cam(0.5, 0.5);
    expect(c.frustum.right - c.frustum.left).toBeGreaterThan(0);
    expect(c.frustum.top - c.frustum.bottom).toBeGreaterThan(0);
    expect(c.rect.width).toBeGreaterThan(30);
  });
});

describe("poses from the motion layer", () => {
  const col = (m: number[], i: number) => [m[4 * i], m[4 * i + 1], m[4 * i + 2]];
  test("lift floats the model along the board's up axis, in model units", () => {
    const a = cam(0.5, 0.5).model, b = cam(0.5, 0.5, {}, { lift: 0.5 }).model;
    const up = col(a, 1);
    // Origin moves by lift × the (scaled) up column; nothing else changes.
    for (let i = 0; i < 3; i++) expect(b[12 + i] - a[12 + i]).toBeCloseTo(0.5 * up[i], 6);
    expect(b.slice(0, 12)).toEqual(a.slice(0, 12));
  });

  test("lean tips the model's up axis toward its front, keeping a proper rotation", () => {
    const m0 = cam(0.5, 0.5).model, m = cam(0.5, 0.5, {}, { leanDeg: 20 }).model;
    const cosAngle = (p: number[], q: number[]) => (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / (Math.hypot(...p) * Math.hypot(...q));
    expect(cosAngle(col(m, 1), col(m0, 1))).toBeCloseTo(Math.cos((20 * Math.PI) / 180), 6);
    expect(cosAngle(col(m, 1), col(m0, 2))).toBeGreaterThan(0); // toward the front (+z)
    expect(col(m, 0)).toEqual(col(m0, 0));
  });

  test("facing turns the model about the board normal", () => {
    const a = cam(0.5, 0.5), b = cam(0.5, 0.5, {}, { facingDeg: 90 });
    expect(Math.abs(b.azimuthDeg - a.azimuthDeg)).toBeCloseTo(90, 6);
  });
});

describe("miniPlateBox — the badge plate from the model's projected bounds", () => {
  test("half-width about the feet and height above them, undone by the depth scale", () => {
    expect(miniPlateBox({ rect: { left: -12, top: -52, width: 30, height: 60 } }, 0.5)).toEqual({ halfWidth: 32, height: 100 });
  });

  test("follows the camera: a taller projected mini gets a taller plate", () => {
    const far = miniPlateBox(cam(0.5, 0.1), 1), nearRow = miniPlateBox(cam(0.5, 0.9), 1);
    expect(far.height).toBeGreaterThan(0);
    expect(nearRow.height).not.toBeCloseTo(far.height, 1);
  });
});

test("miniPixelRatio caps the SCREEN density at 2, times the plane's on-screen zoom", () => {
  expect(miniPixelRatio(3, 1)).toBe(2);
  expect(miniPixelRatio(1, 1)).toBe(1);
  // A fitted-down board (the phone: ~0.72) → bucket 2^-0.25 ≈ 0.84.
  expect(miniPixelRatio(3, 0.72)).toBeCloseTo(2 * 2 ** -0.25, 6);
  // Zoomed 4× toward a pick: 8 backing px per plane px, i.e. still 2 per CSS px.
  expect(miniPixelRatio(3, 4)).toBe(8);
  expect(miniPixelRatio(3, 1, 3)).toBe(3);
  expect(miniPixelRatio(0, NaN)).toBe(1);
});

test("densityBucket rounds the zoom UP to quarter-octave steps", () => {
  expect(densityBucket(1)).toBe(1);
  expect(densityBucket(2)).toBeCloseTo(2, 9);
  expect(densityBucket(1.01)).toBeCloseTo(2 ** 0.25, 9);
  expect(densityBucket(1.15)).toBeCloseTo(2 ** 0.25, 9);
  expect(densityBucket(3.9)).toBeCloseTo(4, 9);
  for (const z of [0.3, 0.72, 1.3, 2.7, 4.22]) {
    expect(densityBucket(z)).toBeGreaterThanOrEqual(z - 1e-9);
    expect(densityBucket(z)).toBeLessThan(z * 2 ** 0.25 + 1e-9);
  }
  expect(densityBucket(0)).toBe(1);
});

test("planeScale is the CSS perspective's enlargement at the canvas plane", () => {
  const c = cam(0.5, 0.9);
  const P = 800 * 1.1;
  expect(c.planeScale).toBeGreaterThan(1);
  // Nearer the eye (the near row stands higher in z) → bigger on screen.
  expect(c.planeScale).toBeGreaterThan(cam(0.5, 0.1).planeScale);
  expect(c.planeScale).toBeLessThan(P / (P - 400));
});

test("miniPlaneTransform undoes the depth scale and the stage rotation, then lifts", () => {
  expect(miniPlaneTransform({ tiltDeg: 40, yawDeg: 2.5 }, 0.8, 3)).toBe("scale(1.25000) rotateX(-40deg) rotateY(-2.5deg) translateZ(3.00px)");
});
