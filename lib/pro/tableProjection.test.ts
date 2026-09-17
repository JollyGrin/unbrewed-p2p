import {
  DEFAULT_TILT_DEG,
  MAX_TILT_DEG,
  Z_BASE,
  Z_RANGE,
  boardTransform,
  clampTilt,
  perspectivePx,
  placeStandee,
  standeeScale,
  standeeTransform,
  standeeZIndex,
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
