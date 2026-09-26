import {
  BASE_TO_SPACE_DIAMETER_RATIO,
  BOARD_THICKNESS_RATIO,
  DEFAULT_TILT_DEG,
  EDGE_FOLD_DEG,
  MAX_TILT_DEG,
  PERSPECTIVE_RATIO,
  SHADOW_STRETCH_FAR,
  TABLE_FOCUS_CAP_FLOOR_PX,
  TABLE_HIT_PAD_FAR,
  TABLE_YAW_DEG,
  Z_BASE,
  Z_BOARD_EDGE,
  Z_RANGE,
  boardThicknessPx,
  boardTransform,
  clampTilt,
  fxLabelZIndex,
  fxRingZIndex,
  convergenceRatio,
  perspectivePx,
  pieSliceAngles,
  pieSlicePath,
  placeStandee,
  standeeBaseDiameterPx,
  standeeScale,
  standeeShadowStretch,
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

  // The official Unmatched mobile app is the reference, measured rather than
  // remembered: on a 2622px landscape screenshot of its tabletop board the
  // near edge spans 1315px and the far edge 1050px — a near/far ratio of
  // 1.25. An earlier pass pushed this view to ~2.4 at the board's own edges
  // chasing "more 3D"; the near rim then took so much width that, once the
  // fit measured what the board actually draws, the playable area shrank.
  const REFERENCE_EDGE_RATIO = 1.25;

  // Our boards are flat top-down art; the reference's are painted for its
  // camera. So the target is AT or modestly ABOVE the reference — never the
  // ~2.4 fisheye, never flatter than the reference itself.
  const MAX_EDGE_RATIO = 1.5;

  it("converges at least as much as the reference app on a typical wide board", () => {
    const ratio = convergenceRatio(TYPICAL_BOARD_W, TYPICAL_BOARD_H, DEFAULT_TILT_DEG);
    expect(ratio).toBeGreaterThan(REFERENCE_EDGE_RATIO - 0.05);
    expect(ratio).toBeLessThan(MAX_EDGE_RATIO);
  });

  it("stays short of a fisheye on a squarer board (Secluded Temple, ~1.65:1)", () => {
    const ratio = convergenceRatio(750, 455, DEFAULT_TILT_DEG);
    expect(ratio).toBeGreaterThan(REFERENCE_EDGE_RATIO);
    expect(ratio).toBeLessThan(MAX_EDGE_RATIO);
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

describe("boardThicknessPx (phase-5 fault #1 — 'the board has no thickness')", () => {
  it("scales with the board's own rendered width, like PERSPECTIVE_RATIO does", () => {
    expect(boardThicknessPx(800)).toBe(boardThicknessPx(400) * 2);
    expect(boardThicknessPx(1300)).toBeCloseTo(1300 * BOARD_THICKNESS_RATIO, 10);
  });

  it("never collapses to zero, which would erase the edge entirely", () => {
    expect(boardThicknessPx(0)).toBeGreaterThan(0);
    expect(boardThicknessPx(-50)).toBeGreaterThan(0);
  });

  it("stays a slab, not a box-lid — comparable to, not many times, a space's own diameter", () => {
    // DEFAULT_DIAMETER in TableBoard.tsx (0.021) is the space-diameter fraction
    // this was tuned to land near — a board noticeably thicker than its own
    // pieces would read as a lid, not a board.
    expect(BOARD_THICKNESS_RATIO).toBeGreaterThan(0.01);
    expect(BOARD_THICKNESS_RATIO).toBeLessThan(0.04);
  });
});

describe("EDGE_FOLD_DEG (phase-5 fault #1 — a bevel the verification engine can actually render)", () => {
  it("folds only part way — short of the perpendicular 90° a true cube face would need", () => {
    expect(EDGE_FOLD_DEG).toBeGreaterThan(0);
    expect(EDGE_FOLD_DEG).toBeLessThan(90);
  });

  it("keeps a comfortable margin either side of the degenerate values", () => {
    // The verification engine's isolated repro (see this file's "Board
    // thickness" comment) pinned the failure to the CHILD's OWN local fold
    // value landing at exactly 90° — not to any angle "net" of the ambient
    // tilt/yaw it composes with (a fold well short of 90°, like this one,
    // stayed visible at every `MIN_TILT_DEG`/`MAX_TILT_DEG`/`TABLE_YAW_DEG`
    // combination tried). 45° sits at the midpoint, as far from the "flap
    // invisible behind the board's own face" end (0°) as from the
    // degenerate end (90°).
    expect(EDGE_FOLD_DEG).toBeGreaterThan(15);
    expect(EDGE_FOLD_DEG).toBeLessThan(75);
  });
});

describe("Z_BOARD_EDGE (phase-5 fault #1)", () => {
  it("stays under the standee stacking band, so a piece never renders behind the board's own body", () => {
    expect(Z_BOARD_EDGE).toBeLessThan(Z_BASE);
  });
});

describe("standeeBaseDiameterPx (phase-5 fault #2 — 'the base and the space don't agree')", () => {
  it("derives directly from the space's own rendered diameter, not a fixed constant", () => {
    expect(standeeBaseDiameterPx(40)).toBe(40 * BASE_TO_SPACE_DIAMETER_RATIO);
    expect(standeeBaseDiameterPx(80)).toBe(standeeBaseDiameterPx(40) * 2);
  });

  it("sits INSIDE the space's own footprint rather than swamping it", () => {
    expect(BASE_TO_SPACE_DIAMETER_RATIO).toBeLessThan(1);
    // ...but not so far inside that it reads as a stray marker instead of a
    // base the figure is visibly standing on.
    expect(BASE_TO_SPACE_DIAMETER_RATIO).toBeGreaterThan(0.7);
  });

  it("never returns a negative diameter for a degenerate (zero or negative) space size", () => {
    expect(standeeBaseDiameterPx(0)).toBe(0);
    expect(standeeBaseDiameterPx(-10)).toBe(0);
  });
});

describe("standeeShadowStretch (phase-5 fault #3 — 'cast shadows... softening/lengthening with distance')", () => {
  it("is exactly 1 (baseline) at the near edge", () => {
    expect(standeeShadowStretch(1)).toBe(1);
  });

  it("reaches the full stretch budget at the far edge", () => {
    expect(standeeShadowStretch(0)).toBe(SHADOW_STRETCH_FAR);
  });

  it("grows monotonically as a piece recedes", () => {
    expect(standeeShadowStretch(0.2)).toBeGreaterThan(standeeShadowStretch(0.8));
  });

  it("clamps coordinates that stray outside the board image", () => {
    expect(standeeShadowStretch(-3)).toBe(SHADOW_STRETCH_FAR);
    expect(standeeShadowStretch(9)).toBe(1);
  });

  it("always stretches farther, never shrinks a shadow below its near-edge baseline", () => {
    expect(SHADOW_STRETCH_FAR).toBeGreaterThan(1);
  });
});

describe("boardTransform with yaw (phase-5 fault #4 — 'perfectly square to the viewer')", () => {
  it("renders byte-identical to the pre-phase-5 output when yaw is omitted", () => {
    expect(boardTransform(48)).toBe("rotateX(48deg)");
    expect(boardTransform(48, 0)).toBe("rotateX(48deg)");
  });

  it("composes the yaw OUTSIDE (to the left of) the tilt, so it applies last — a camera move, not a spin", () => {
    expect(boardTransform(48, TABLE_YAW_DEG)).toBe(`rotateY(${TABLE_YAW_DEG}deg) rotateX(48deg)`);
  });

  it("stays restrained — perceptible without reading as crooked", () => {
    expect(TABLE_YAW_DEG).toBeGreaterThan(0);
    expect(TABLE_YAW_DEG).toBeLessThan(6);
  });
});

describe("combat FX placement", () => {
  it("keeps a ground shockwave below every piece, where a mark on the board belongs", () => {
    expect(fxRingZIndex()).toBeLessThan(Z_BASE);
  });

  it("lifts damage numbers above every piece, because a number hidden behind a figure is lost", () => {
    // The nearest possible piece still sits below the farthest possible label.
    expect(fxLabelZIndex(0)).toBeGreaterThan(standeeZIndex(1));
  });

  it("still orders labels among themselves by distance", () => {
    expect(fxLabelZIndex(0.9)).toBeGreaterThan(fxLabelZIndex(0.1));
  });

  it("clamps coordinates that stray outside the board image", () => {
    expect(fxLabelZIndex(-3)).toBe(fxLabelZIndex(0));
    expect(fxLabelZIndex(4)).toBe(fxLabelZIndex(1));
  });
});
