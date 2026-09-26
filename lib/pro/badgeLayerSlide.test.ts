/**
 * #902: a fighter's badges slide toward the camera along their own eye ray.
 * These tests do NOT re-derive the formula: they rebuild the CSS transform
 * chain as plain 3D maths (board rotateX(tilt) about the plane centre, the
 * plate's rotateX(-tilt) scale(s) about its foot, the layer's translate3d +
 * scale about the same foot, perspective from `perspectivePx(frameW)` in front
 * of the plane centre) and check the two promises: every badge pixel ends up
 * above the token top, and it projects onto the same screen pixel as before.
 */
import {
  BAND_LABEL_CLEARANCE_PX,
  DEFAULT_TILT_DEG,
  MAX_TILT_DEG,
  MIN_TILT_DEG,
  TOKEN_THICKNESS,
  badgeLayerSlide,
  eyeRaySlide,
  flatTokenTopPx,
  perspectivePx,
  type BadgeLayerInput,
  type BadgeLayerSlide,
} from "./tableProjection";

type V3 = [number, number, number];
const rad = (deg: number) => (deg * Math.PI) / 180;
/** CSS rotateX: y' = y·cos − z·sin, z' = y·sin + z·cos. */
const rotX = ([x, y, z]: V3, deg: number): V3 => {
  const a = rad(deg);
  return [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
};

/** A badge point `h` px up the plate and `bx` px right of its foot, in BOARD
 *  space relative to the foot (z = height off the board). */
const inBoard = (tilt: number, s: number, slide: BadgeLayerSlide | null, bx: number, h: number): V3 => {
  let p: V3 = [bx, -h, 0];
  if (slide) {
    p = [p[0] * slide.scale, p[1] * slide.scale, p[2]];
    p = [p[0] + slide.shiftXPx, p[1] + slide.shiftYPx, p[2] + slide.forwardPx];
  }
  p = [p[0] * s, p[1] * s, p[2]];
  return rotX(p, -tilt);
};

/** Where that point lands on screen (px from the stage centre). */
const onScreen = (i: BadgeLayerInput, slide: BadgeLayerSlide | null, bx: number, h: number): [number, number] => {
  const [px, py, pz] = inBoard(i.tiltDeg, i.plateScale, slide, bx, h);
  const board: V3 = [(i.x - 0.5) * i.frameW + px, (i.y - 0.5) * i.frameH + py, pz];
  const [X, Y, Z] = rotX(board, i.tiltDeg);
  const P = perspectivePx(i.frameW);
  return [(X * P) / (P - Z), (Y * P) / (P - Z)];
};

const base: BadgeLayerInput = {
  x: 0.5,
  y: 0.5,
  frameW: 1100,
  frameH: 760,
  tiltDeg: DEFAULT_TILT_DEG,
  plateScale: 0.9,
  tokenTopPx: 4,
  lowestPx: -21,
};

const TILTS = [MIN_TILT_DEG, 20, DEFAULT_TILT_DEG, MAX_TILT_DEG];
const SPOTS: Array<[number, number]> = [
  [0.5, 0.5],
  [0.05, 0.05],
  [0.95, 0.05],
  [0.05, 0.95],
  [0.95, 0.95],
];

describe("badgeLayerSlide (#902)", () => {
  it.each(TILTS)("puts the lowest badge pixel above the token top at tilt %s°, anywhere on the board", (tiltDeg) => {
    for (const [x, y] of SPOTS) {
      const i = { ...base, x, y, tiltDeg };
      const slide = badgeLayerSlide(i);
      const height = inBoard(tiltDeg, i.plateScale, slide, 0, i.lowestPx)[2];
      // Clear of the token top by the clearance, and not wildly more.
      expect(height).toBeGreaterThanOrEqual(i.tokenTopPx + BAND_LABEL_CLEARANCE_PX - 1e-6);
      expect(height).toBeLessThan(i.tokenTopPx + BAND_LABEL_CLEARANCE_PX + 0.5);
      // Every higher point stands at least as high (level at tilt 0).
      expect(inBoard(tiltDeg, i.plateScale, slide, 0, i.lowestPx + 10)[2]).toBeGreaterThanOrEqual(height - 1e-9);
    }
  });

  it("without the slide, that same point is under the token top (the bug)", () => {
    expect(inBoard(base.tiltDeg, base.plateScale, null, 0, base.lowestPx)[2]).toBeLessThan(0);
    expect(inBoard(base.tiltDeg, base.plateScale, null, 0, 2)[2]).toBeLessThan(base.tokenTopPx);
  });

  it.each(TILTS)("draws every badge pixel on the same screen pixel at tilt %s°", (tiltDeg) => {
    for (const [x, y] of SPOTS) {
      const i = { ...base, x, y, tiltDeg };
      const slide = badgeLayerSlide(i);
      expect(slide.forwardPx).toBeGreaterThan(0);
      for (const [bx, h] of [
        [0, i.lowestPx],
        [-20, 30],
        [25, -5],
        [12, 45],
      ]) {
        const before = onScreen(i, null, bx, h);
        const after = onScreen(i, slide, bx, h);
        // transform strings carry 2dp/4dp — well under a CSS pixel.
        expect(Math.abs(after[0] - before[0])).toBeLessThan(0.05);
        expect(Math.abs(after[1] - before[1])).toBeLessThan(0.05);
      }
    }
  });

  it("clears a shared-space stack lift: a higher token top slides the badges further", () => {
    const flat = badgeLayerSlide({ ...base, tokenTopPx: flatTokenTopPx(60) });
    const stacked = badgeLayerSlide({ ...base, tokenTopPx: flatTokenTopPx(60, 6) });
    expect(stacked.forwardPx).toBeGreaterThan(flat.forwardPx);
    const height = inBoard(base.tiltDeg, base.plateScale, stacked, 0, base.lowestPx)[2];
    expect(height).toBeGreaterThanOrEqual(flatTokenTopPx(60, 6) + BAND_LABEL_CLEARANCE_PX - 1e-6);
  });

  it("does nothing with no badges, and still lifts with no frame measured", () => {
    expect(badgeLayerSlide({ ...base, lowestPx: Infinity })).toMatchObject({ forwardPx: 0, transform: "" });
    const bare = badgeLayerSlide({ ...base, frameW: 0, frameH: 0 });
    expect(bare.scale).toBe(1);
    expect(bare.shiftXPx).toBe(0);
    expect(inBoard(base.tiltDeg, base.plateScale, bare, 0, base.lowestPx)[2]).toBeGreaterThanOrEqual(
      base.tokenTopPx + BAND_LABEL_CLEARANCE_PX - 1e-6
    );
  });

  it("writes a translate3d + scale transform", () => {
    expect(badgeLayerSlide(base).transform).toMatch(/^translate3d\(-?[\d.]+px, -?[\d.]+px, [\d.]+px\) scale\(0\.\d{4}\)$/);
  });
});

describe("eyeRaySlide (#902 — the name pill over the badges)", () => {
  it("moves a billboard toward the camera without moving it on screen", () => {
    const i = { ...base, x: 0.9, y: 0.1 };
    const slide = eyeRaySlide({ ...i, forwardPx: 30 });
    expect(slide.forwardPx).toBe(30);
    for (const [bx, h] of [
      [0, 0],
      [-40, 12],
      [40, 12],
    ]) {
      const before = onScreen(i, null, bx, h);
      const after = onScreen(i, slide, bx, h);
      expect(Math.abs(after[0] - before[0])).toBeLessThan(0.05);
      expect(Math.abs(after[1] - before[1])).toBeLessThan(0.05);
    }
  });
});

describe("flatTokenTopPx", () => {
  it("is the flat token's own layer count plus the stack lift", () => {
    expect(flatTokenTopPx(50)).toBe(Math.round(50 * TOKEN_THICKNESS));
    expect(flatTokenTopPx(50, 5)).toBe(Math.round(50 * TOKEN_THICKNESS) + 5);
    expect(flatTokenTopPx(3)).toBe(1);
  });

  it("covers every tilt the table allows", () => {
    expect(TILTS[0]).toBe(MIN_TILT_DEG);
    expect(TILTS[TILTS.length - 1]).toBe(MAX_TILT_DEG);
  });
});
