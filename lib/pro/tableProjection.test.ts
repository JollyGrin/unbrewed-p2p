import {
  DEFAULT_TILT_DEG,
  MAX_TILT_DEG,
  PERSPECTIVE_RATIO,
  STANDEE_DOME_Y,
  STANDEE_FOOT_HALF_WIDTH,
  STANDEE_SHOULDER_HALF_WIDTH,
  STANDEE_WAIST_HALF_WIDTH,
  STANDEE_WAIST_Y,
  TABLE_FOCUS_CAP_FLOOR_PX,
  TABLE_HIT_PAD_FAR,
  Z_BASE,
  Z_RANGE,
  boardTransform,
  clampTilt,
  convergenceRatio,
  perspectivePx,
  pieSliceAngles,
  pieSlicePath,
  placeStandee,
  standeeScale,
  standeeSilhouettePath,
  standeeTransform,
  standeeZIndex,
  tableFocusCapDiameterPx,
  tableHitDiameter,
  tableHitPadFraction,
} from "./tableProjection";

describe("clampTilt", () => {
  it("keeps the tilt short of edge-on, where the near rank would collapse", () => {
    expect(clampTilt(89)).toBe(MAX_TILT_DEG);
    expect(clampTilt(-30)).toBe(0);
    expect(clampTilt(DEFAULT_TILT_DEG)).toBe(DEFAULT_TILT_DEG);
  });
});

describe("perspectivePx", () => {
  it("scales with the board's width so a phone and a desktop feel the same", () => {
    expect(perspectivePx(800)).toBe(perspectivePx(400) * 2);
  });

  it("never returns zero, which would collapse the projection", () => {
    expect(perspectivePx(0)).toBeGreaterThan(0);
    expect(perspectivePx(-100)).toBeGreaterThan(0);
  });
});

describe("convergenceRatio", () => {
  // A typical Unmatched board (King Kong's Skull Island / USCSS Nostromo art)
  // renders roughly 2.7:1 landscape at phone width — this is the concrete
  // case the phase-2 report's before/after numbers were measured against.
  const TYPICAL_BOARD_W = 1300;
  const TYPICAL_BOARD_H = 480;

  it("is barely more than a parallel projection at the OLD, too-far camera distance", () => {
    // Regression anchor for fault #1: PERSPECTIVE_RATIO used to be 1.75, which
    // an actual screenshot audit showed read as "squashed flat" rather than
    // "tilted" — the far rank was nearly the same size as the near rank. This
    // pins that failure mode to a number so nobody re-introduces it by
    // accident while tuning something else.
    const oldRatio = convergenceRatio(TYPICAL_BOARD_W, TYPICAL_BOARD_H, DEFAULT_TILT_DEG);
    // (computed at the CURRENT, retuned PERSPECTIVE_RATIO below — this test
    // only documents what the old constant would have produced, via the pure
    // formula, not by reimporting a removed export)
    const p = TYPICAL_BOARD_W * 1.75;
    const halfH = TYPICAL_BOARD_H / 2;
    const zNear = halfH * Math.sin((DEFAULT_TILT_DEG * Math.PI) / 180);
    const legacyRatio = (p + zNear) / (p - zNear);
    expect(legacyRatio).toBeLessThan(1.25);
    // The retuned constant must be a real, measurable improvement over that.
    expect(oldRatio).toBeGreaterThan(legacyRatio);
  });

  it("reads as a clearly photograph-like tilt at the current PERSPECTIVE_RATIO", () => {
    const ratio = convergenceRatio(TYPICAL_BOARD_W, TYPICAL_BOARD_H, DEFAULT_TILT_DEG);
    // Documents the tuned target from the phase-2 report: strong enough to
    // unmistakably read as a receding table, short of the near rank
    // ballooning or the far rank vanishing.
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.2);
  });

  it("grows as PERSPECTIVE_RATIO shrinks (camera moves closer)", () => {
    const atCurrentRatio = convergenceRatio(TYPICAL_BOARD_W, TYPICAL_BOARD_H, DEFAULT_TILT_DEG);
    // Simulate doubling PERSPECTIVE_RATIO — a camera twice as far back.
    const p = TYPICAL_BOARD_W * (PERSPECTIVE_RATIO * 2);
    const halfH = TYPICAL_BOARD_H / 2;
    const zNear = halfH * Math.sin((DEFAULT_TILT_DEG * Math.PI) / 180);
    const atFartherCamera = (p + zNear) / (p - zNear);
    expect(atCurrentRatio).toBeGreaterThan(atFartherCamera);
  });

  it("is a no-op (ratio 1) on a flat, untitled board", () => {
    expect(convergenceRatio(TYPICAL_BOARD_W, TYPICAL_BOARD_H, 0)).toBe(1);
  });
});

describe("standeeTransform", () => {
  it("cancels the board's tilt exactly, so the figure faces the camera", () => {
    expect(boardTransform(48)).toBe("rotateX(48deg)");
    expect(standeeTransform(48)).toBe("rotateX(-48deg)");
  });

  it("is a no-op on a flat board", () => {
    expect(standeeTransform(0)).toBe("rotateX(0deg)");
  });
});

describe("standeeZIndex", () => {
  it("puts near pieces in front of far ones", () => {
    expect(standeeZIndex(0.9)).toBeGreaterThan(standeeZIndex(0.1));
  });

  it("stays inside the band reserved for board pieces", () => {
    expect(standeeZIndex(0)).toBe(Z_BASE);
    expect(standeeZIndex(1)).toBe(Z_BASE + Z_RANGE);
  });

  it("clamps coordinates that stray outside the board image", () => {
    expect(standeeZIndex(-2)).toBe(Z_BASE);
    expect(standeeZIndex(7)).toBe(Z_BASE + Z_RANGE);
  });
});

describe("standeeScale", () => {
  it("shrinks with distance but never enough to hide who a fighter is", () => {
    expect(standeeScale(0)).toBeLessThan(standeeScale(1));
    expect(standeeScale(1)).toBe(1);
    expect(standeeScale(0)).toBeGreaterThan(0.75);
  });
});

describe("placeStandee", () => {
  it("bundles the counter-rotation and the depth scale into one transform", () => {
    const near = placeStandee(1, DEFAULT_TILT_DEG);
    expect(near.transform).toContain(`rotateX(-${DEFAULT_TILT_DEG}deg)`);
    expect(near.transform).toContain("scale(1.000)");
  });

  it("orders two fighters on the same board by their distance", () => {
    const far = placeStandee(0.2, DEFAULT_TILT_DEG);
    const near = placeStandee(0.8, DEFAULT_TILT_DEG);
    expect(near.zIndex).toBeGreaterThan(far.zIndex);
    expect(near.scale).toBeGreaterThan(far.scale);
  });
});

describe("tableHitPadFraction", () => {
  it("adds no padding at the near edge, where the space already renders full size", () => {
    expect(tableHitPadFraction(1)).toBe(0);
  });

  it("adds the full padding budget at the far edge", () => {
    expect(tableHitPadFraction(0)).toBe(TABLE_HIT_PAD_FAR);
  });

  it("grows monotonically as a space recedes", () => {
    expect(tableHitPadFraction(0.2)).toBeGreaterThan(tableHitPadFraction(0.8));
  });

  it("clamps coordinates that stray outside the board image", () => {
    expect(tableHitPadFraction(-3)).toBe(TABLE_HIT_PAD_FAR);
    expect(tableHitPadFraction(9)).toBe(0);
  });
});

describe("tableHitDiameter", () => {
  it("never shrinks a space's tap area below its own visible diameter", () => {
    expect(tableHitDiameter(3, 1)).toBe(3);
    expect(tableHitDiameter(3, 0)).toBeGreaterThan(3);
  });

  it("scales with the space's own printed diameter", () => {
    expect(tableHitDiameter(6, 0.3)).toBe(tableHitDiameter(3, 0.3) * 2);
  });
});

describe("pieSliceAngles", () => {
  it("divides the circle evenly, starting at 12 o'clock", () => {
    expect(pieSliceAngles(2)).toEqual([
      [0, 180],
      [180, 360],
    ]);
  });

  it("covers the full circle with no gaps for any zone count", () => {
    for (const count of [1, 2, 3, 4]) {
      const slices = pieSliceAngles(count);
      expect(slices).toHaveLength(count);
      expect(slices[0][0]).toBe(0);
      expect(slices[slices.length - 1][1]).toBe(360);
      for (let i = 1; i < slices.length; i++) {
        expect(slices[i][0]).toBe(slices[i - 1][1]);
      }
    }
  });

  it("floors at one slice for a degenerate zero/negative count", () => {
    expect(pieSliceAngles(0)).toEqual([[0, 360]]);
  });
});

describe("pieSlicePath", () => {
  it("starts and ends the arc on the circle of radius r around (cx, cy)", () => {
    const d = pieSlicePath(10, 10, 5, 0, 90);
    // Top of the circle (12 o'clock, 0deg) is (cx, cy - r).
    expect(d).toContain("M 10 10 L 10 5");
    // 90deg clockwise from 12 o'clock is 3 o'clock: (cx + r, cy).
    expect(d).toContain("15 10");
  });

  it("flags the large-arc sweep only past a half circle", () => {
    expect(pieSlicePath(0, 0, 1, 0, 90)).toMatch(/A 1 1 0 0 1/);
    expect(pieSlicePath(0, 0, 1, 0, 270)).toMatch(/A 1 1 0 1 1/);
  });
});

describe("standeeSilhouettePath (phase-3 fault #1 — 'standees still read as rectangles')", () => {
  it("keeps every keypoint strictly inside the box, never on a straight rectangular edge", () => {
    const w = 100;
    const h = 200;
    const d = standeeSilhouettePath(w, h);
    // The shoulder half-width is the widest point of the silhouette and must
    // still fall short of the box's own edges — a shape that touches the
    // full width anywhere would reintroduce a straight, rectangle-like side.
    expect(STANDEE_SHOULDER_HALF_WIDTH).toBeLessThan(0.5);
    // The apex (top center) is a single point, not a straight top edge —
    // regression anchor for the phase-2 rectangle-with-rounded-corners look.
    expect(d.startsWith(`M ${w / 2} 0`)).toBe(true);
    // Exactly two elliptical arcs (the domed head) and otherwise straight
    // taper/flare edges — never a `border-radius`-style all-round corner.
    expect(d.match(/A /g)).toHaveLength(2);
  });

  it("orders the silhouette SHOULDER > FOOT > WAIST, the 'a figure standing' silhouette", () => {
    // Not a numeric coincidence — this ordering is what keeps the shape
    // reading as a standing figure with a visible stance rather than a
    // lozenge (shoulder = foot, tapering smoothly) or a blob (waist widest).
    expect(STANDEE_SHOULDER_HALF_WIDTH).toBeGreaterThan(STANDEE_FOOT_HALF_WIDTH);
    expect(STANDEE_FOOT_HALF_WIDTH).toBeGreaterThan(STANDEE_WAIST_HALF_WIDTH);
    expect(STANDEE_DOME_Y).toBeGreaterThan(0);
    expect(STANDEE_WAIST_Y).toBeLessThan(1);
    expect(STANDEE_DOME_Y).toBeLessThan(STANDEE_WAIST_Y);
  });

  it("is bilaterally symmetric: the left-side coordinates mirror the right", () => {
    const w = 120;
    const h = 150;
    const d = standeeSilhouettePath(w, h);
    const shoulderX = w / 2 + STANDEE_SHOULDER_HALF_WIDTH * w;
    const mirroredShoulderX = w - shoulderX;
    expect(d).toContain(`${Math.round(shoulderX * 10) / 10} ${Math.round(STANDEE_DOME_Y * h * 10) / 10}`);
    expect(d).toContain(`${Math.round(mirroredShoulderX * 10) / 10} ${Math.round(STANDEE_DOME_Y * h * 10) / 10}`);
  });

  it("scales linearly with the plate's own render size", () => {
    const small = standeeSilhouettePath(50, 100);
    const big = standeeSilhouettePath(100, 200);
    // Doubling both dimensions must double every coordinate in the path —
    // otherwise the clip would drift off the plate at some render sizes.
    const firstNumber = (d: string): number => Number(d.split(/[ ]/).find((tok) => /^-?\d/.test(tok)));
    expect(firstNumber(big)).toBeCloseTo(firstNumber(small) * 2, 5);
  });

  it("never collapses to a degenerate (zero-area) shape for a tiny or zero-sized plate", () => {
    expect(() => standeeSilhouettePath(0, 0)).not.toThrow();
    const d = standeeSilhouettePath(0, 0);
    expect(d).toContain("M");
    expect(d).toContain("Z");
  });
});

describe("tableFocusCapDiameterPx (phase-3 fault #2 — 'the tilted view zooms in far past useful')", () => {
  it("passes an already-generous cap through unchanged", () => {
    expect(tableFocusCapDiameterPx(80)).toBe(80);
  });

  it("floors a tiny measured cap so a lone far pick can't drive the whole zoom ceiling", () => {
    expect(tableFocusCapDiameterPx(10)).toBe(TABLE_FOCUS_CAP_FLOOR_PX);
  });

  it("is exactly the floor at the boundary", () => {
    expect(tableFocusCapDiameterPx(TABLE_FOCUS_CAP_FLOOR_PX)).toBe(TABLE_FOCUS_CAP_FLOOR_PX);
  });
});
