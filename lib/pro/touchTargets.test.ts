import { describe, expect, test } from "@jest/globals";
import { MIN_TOUCH_PX, focusTransform, nearestNeighbourPx, shouldAutoFocus, touchHitPercent, touchHitSize } from "./touchTargets";

describe("touchHitSize", () => {
  test("keeps the layout diameter when it already renders above the minimum", () => {
    // 60px layout diameter at scale 1 renders at 60px on screen.
    expect(touchHitSize(60, 1)).toBe(60);
  });

  test("grows a small space so it renders at the minimum on screen", () => {
    // 40px layout at scale 0.4 renders at 16px; the hit area must be 44 / 0.4 = 110 layout px.
    expect(touchHitSize(40, 0.4)).toBeCloseTo(MIN_TOUCH_PX / 0.4);
  });

  test("shrinks back to the layout diameter when zoomed in far enough", () => {
    expect(touchHitSize(40, 3)).toBe(40);
  });

  test("treats a non-positive scale as identity instead of dividing by zero", () => {
    expect(touchHitSize(10, 0)).toBe(MIN_TOUCH_PX);
  });
});

describe("shouldAutoFocus", () => {
  const avail = { left: 0, top: 60, width: 390, height: 600 };

  test("focuses when the picks render below the touch minimum", () => {
    const box = { left: 100, top: 200, right: 200, bottom: 260 };

    expect(shouldAutoFocus({ box, avail, pickDiameterPx: 18 })).toBe(true);
  });

  test("focuses when the picks are big enough but huddle in a small part of the board", () => {
    const box = { left: 150, top: 300, right: 230, bottom: 360 };

    expect(shouldAutoFocus({ box, avail, pickDiameterPx: 50 })).toBe(true);
  });

  test("does not focus when picks are touch-sized and already spread over the free area", () => {
    const box = { left: 10, top: 80, right: 380, bottom: 640 };

    expect(shouldAutoFocus({ box, avail, pickDiameterPx: 50 })).toBe(false);
  });
});

describe("focusTransform", () => {
  const avail = { left: 0, top: 100, width: 400, height: 400 };

  test("centres the box in the free area and scales it to fill", () => {
    // Board at scale 1, untranslated; the box is 100x100 around (150,250).
    const result = focusTransform({
      current: { scale: 1, tx: 0, ty: 0 },
      box: { left: 100, top: 200, right: 200, bottom: 300 },
      avail,
      padding: 0,
      minScale: 0.1,
      maxScale: 10,
    });

    expect(result.scale).toBeCloseTo(4);
    // The box centre (150,250) must land on the free-area centre (200,300).
    expect(result.tx + 150 * result.scale).toBeCloseTo(200);
    expect(result.ty + 250 * result.scale).toBeCloseTo(300);
  });

  test("respects padding around the box", () => {
    const result = focusTransform({
      current: { scale: 1, tx: 0, ty: 0 },
      box: { left: 100, top: 200, right: 200, bottom: 300 },
      avail,
      padding: 50,
      minScale: 0.1,
      maxScale: 10,
    });

    expect(result.scale).toBeCloseTo(2);
  });

  test("never zooms beyond the maximum or below the minimum scale", () => {
    const base = { current: { scale: 1, tx: 0, ty: 0 }, avail, padding: 0 };

    const tiny = focusTransform({ ...base, box: { left: 0, top: 0, right: 1, bottom: 1 }, minScale: 0.5, maxScale: 3 });
    const huge = focusTransform({ ...base, box: { left: 0, top: 0, right: 4000, bottom: 4000 }, minScale: 0.5, maxScale: 3 });

    expect(tiny.scale).toBe(3);
    expect(huge.scale).toBe(0.5);
  });

  test("composes with an existing zoom and pan", () => {
    // Current view: scale 0.5, shifted by (20, 40). A screen-space box is given.
    const current = { scale: 0.5, tx: 20, ty: 40 };
    const box = { left: 120, top: 240, right: 170, bottom: 290 };
    const result = focusTransform({ current, box, avail, padding: 0, minScale: 0.1, maxScale: 10 });

    // A frame point that was at the box centre on screen: (145-20)/0.5 = 250, (265-40)/0.5 = 450.
    expect(result.tx + 250 * result.scale).toBeCloseTo(200);
    expect(result.ty + 450 * result.scale).toBeCloseTo(300);
    expect(result.scale).toBeCloseTo(0.5 * 8);
  });
});

describe("touchHitPercent", () => {
  test("enlarges a small rendered circle to the touch minimum, as a % of itself", () => {
    // An 18px circle needs a 44px hit area: 44 / 18 = 244%.
    expect(touchHitPercent(18)).toBeCloseTo((MIN_TOUCH_PX / 18) * 100);
  });

  test("returns null when the circle already renders at the minimum", () => {
    expect(touchHitPercent(60)).toBeNull();
  });

  test("returns null when the size is unmeasured, rather than guessing", () => {
    expect(touchHitPercent(0)).toBeNull();
  });
});

describe("touchHitPercent with a neighbour limit", () => {
  test("never grows past the distance to the nearest other pick, so hit areas do not overlap", () => {
    // 18px circles 30px apart: each hit area stops at 30px, meeting at the midpoint.
    expect(touchHitPercent(18, 30)).toBeCloseTo((30 / 18) * 100);
  });

  test("returns null when the neighbour is so close there is no room to grow", () => {
    expect(touchHitPercent(18, 12)).toBeNull();
  });
});

describe("nearestNeighbourPx", () => {
  test("measures the closest other point", () => {
    const points = [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 100, y: 0 }];

    expect(nearestNeighbourPx(points, 0)).toBe(50);
    expect(nearestNeighbourPx(points, 2)).toBeCloseTo(Math.hypot(70, 40));
  });

  test("ignores points at the same spot (a token on its own gold space)", () => {
    expect(nearestNeighbourPx([{ x: 5, y: 5 }, { x: 5, y: 5 }], 0)).toBe(Infinity);
  });
});
