import { miniCamera, miniPlaneTransform, type TableRig } from "./camera";

const rig = (over: Partial<TableRig> = {}): TableRig => ({
  frameW: 800,
  frameH: 560,
  tiltDeg: 40,
  yawDeg: 0,
  perspectiveRatio: 1.1,
  ...over,
});
const bounds = { min: [-0.7, 0, -0.7] as [number, number, number], max: [0.7, 1.9, 0.7] as [number, number, number], footprint: 1.4 };
const cam = (x: number, y: number, over: Partial<TableRig> = {}) => miniCamera({ rig: rig(over), x, y, baseDiamPx: 30, bounds });

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

test("miniPlaneTransform undoes the depth scale and the stage rotation, then lifts", () => {
  expect(miniPlaneTransform({ tiltDeg: 40, yawDeg: 2.5 }, 0.8, 3)).toBe("scale(1.25000) rotateX(-40deg) rotateY(-2.5deg) translateZ(3.00px)");
});
