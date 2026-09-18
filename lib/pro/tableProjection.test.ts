import {
  BASE_TO_SPACE_DIAMETER_RATIO,
  BOARD_EDGE_FIT_RESERVE_FACTOR,
  BOARD_THICKNESS_RATIO,
  DEFAULT_TILT_DEG,
  EDGE_FOLD_DEG,
  MAX_TILT_DEG,
  PERSPECTIVE_RATIO,
  SHADOW_STRETCH_FAR,
  STANDEE_ART_TRANSFORM_ORIGIN,
  STANDEE_ART_ZOOM,
  STANDEE_DOME_Y,
  STANDEE_FOOT_HALF_WIDTH,
  STANDEE_SHOULDER_HALF_WIDTH,
  STANDEE_WAIST_HALF_WIDTH,
  STANDEE_WAIST_Y,
  TABLE_FOCUS_CAP_FLOOR_PX,
  TABLE_HIT_PAD_FAR,
  TABLE_YAW_DEG,
  Z_BASE,
  Z_BOARD_EDGE,
  Z_RANGE,
  boardEdgeFitReservePx,
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
  standeeArtTransform,
  standeeArtVisibleTopFraction,
  standeeBaseDiameterPx,
  standeeScale,
  standeeShadowStretch,
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

  it("orders the silhouette FOOT > SHOULDER > WAIST, the 'a figure standing' silhouette", () => {
    // Not a numeric coincidence — this ordering is what keeps the shape
    // reading as a standing figure with a visible stance rather than a
    // lozenge (shoulder = foot, tapering smoothly), a blob (waist widest),
    // or — the phase-4 bug this pins down — a funnel/shuttlecock (SHOULDER
    // widest, tapering down to a narrower base). A standing figure is
    // narrowest at the head, flares at the shoulders, may pinch at the
    // waist, and is WIDEST at its own base — the part actually touching the
    // ground and needing to look stable.
    expect(STANDEE_FOOT_HALF_WIDTH).toBeGreaterThan(STANDEE_SHOULDER_HALF_WIDTH);
    expect(STANDEE_SHOULDER_HALF_WIDTH).toBeGreaterThan(STANDEE_WAIST_HALF_WIDTH);
    expect(STANDEE_DOME_Y).toBeGreaterThan(0);
    expect(STANDEE_WAIST_Y).toBeLessThan(1);
    expect(STANDEE_DOME_Y).toBeLessThan(STANDEE_WAIST_Y);
  });

  it("keeps the foot — now the widest keypoint — short of the box's own edges too", () => {
    // Fault #1's regression anchor above only ever pinned SHOULDER < 0.5;
    // now that FOOT is the widest keypoint, IT is the one that would
    // reintroduce a straight rectangular side if it ever reached the edge.
    expect(STANDEE_FOOT_HALF_WIDTH).toBeLessThan(0.5);
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

describe("standeeArtTransform / standeeArtVisibleTopFraction (phase-4 fault #2 — 'a picture lying on the space, not a figure standing on it')", () => {
  it("zooms IN, never out — a scale at or below 1 would leave the card background fully visible", () => {
    expect(STANDEE_ART_ZOOM).toBeGreaterThan(1);
    expect(standeeArtTransform()).toBe(`scale(${STANDEE_ART_ZOOM})`);
  });

  it("anchors the zoom at the plate's own base, so the torso — not the head — stays fixed", () => {
    // Bottom-center, not the CSS default (center-center): the whole point is
    // that the crop eats into the TOP of the portrait (the card background
    // above the head) while the bottom (where the character already meets
    // the plate's edge) does not shift.
    expect(STANDEE_ART_TRANSFORM_ORIGIN).toBe("50% 100%");
  });

  it("crops away a real, non-trivial slice of the source image's top — not a rounding-error sliver", () => {
    const visibleTop = standeeArtVisibleTopFraction();
    // At STANDEE_ART_ZOOM this crops roughly the top quarter of the source
    // image, which is what a phase-4 measurement of the shipped token art
    // (King Kong, Malfurion — see the phase-4 report) showed was needed to
    // clear the card-background band above the character's head on both,
    // despite the two portraits framing their subject completely
    // differently. A zoom that crops noticeably less than this would leave
    // that background sitting in the plate again; noticeably more would
    // start eating into the character's own head.
    expect(visibleTop).toBeGreaterThan(0.15);
    expect(visibleTop).toBeLessThan(0.3);
  });

  it("keeps the bottom of the source image fully visible — cropping only ever happens at the top", () => {
    // The visible window is [visibleTop, 1]: the bottom edge (1) never
    // moves, which is the direct consequence of anchoring the transform at
    // the plate's own base (see the transform-origin test above).
    const visibleTop = standeeArtVisibleTopFraction();
    expect(visibleTop).toBeLessThan(1);
    expect(1 - visibleTop).toBeCloseTo(1 / STANDEE_ART_ZOOM, 10);
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

describe("boardEdgeFitReservePx (phase-5 fault #1 — 'the edge gets clipped by a cramped mobile fit')", () => {
  it("reserves MORE than the flat thickness — the edge's own on-screen extent, not its unprojected depth", () => {
    expect(boardEdgeFitReservePx(1000)).toBeGreaterThan(boardThicknessPx(1000));
    expect(boardEdgeFitReservePx(1000)).toBe(boardThicknessPx(1000) * BOARD_EDGE_FIT_RESERVE_FACTOR);
  });

  it("scales with the board's own rendered width", () => {
    expect(boardEdgeFitReservePx(800)).toBe(boardEdgeFitReservePx(400) * 2);
  });

  it("stays a deliberately generous multiple, not a barely-over-1 margin", () => {
    expect(BOARD_EDGE_FIT_RESERVE_FACTOR).toBeGreaterThan(1.2);
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
