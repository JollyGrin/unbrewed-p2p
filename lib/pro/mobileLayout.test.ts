/**
 * Board-fit geometry + the breakpoint policy behind it (issue #708).
 *
 * The two things worth pinning: desktop's inset is EXACTLY the constants the
 * page has always used (the guardrail on this ticket is that >= 62em does not
 * move a pixel), and the mobile insets follow the chrome that is actually on
 * screen rather than a guess.
 */
import {
  DESKTOP_INSET,
  MOBILE_CHIPS_H,
  MOBILE_CONTROLS_H,
  MOBILE_GUTTER,
  RAIL_WIDTH,
  boardFitInsetFor,
  handDrawerLayout,
} from "./mobileLayout";
import { proLayoutMode } from "./useProLayout";

describe("boardFitInsetFor", () => {
  it("hands desktop the untouched 120/136/16 + dock column", () => {
    expect(boardFitInsetFor({ mode: "desktop" })).toEqual({
      top: DESKTOP_INSET.top,
      bottom: DESKTOP_INSET.bottom,
      left: DESKTOP_INSET.side,
      right: DESKTOP_INSET.dockColumn,
    });
  });

  it("ignores measured mobile chrome while the layout is desktop", () => {
    expect(boardFitInsetFor({ mode: "desktop", chipsH: 999, controlsH: 999 })).toEqual(
      boardFitInsetFor({ mode: "desktop" })
    );
  });

  it("derives portrait from the measured chips + bottom controls", () => {
    expect(boardFitInsetFor({ mode: "portrait", chipsH: 52, controlsH: 84 })).toEqual({
      top: 52 + MOBILE_GUTTER,
      bottom: 84 + MOBILE_GUTTER,
      left: MOBILE_GUTTER,
      right: MOBILE_GUTTER,
    });
  });

  // Direction B: the sheet, the hand drawer and the log are OVERLAYS over a
  // full-bleed board. Nothing about them reaches this function, so the map
  // never re-fits (and never jumps) when one opens.
  it("leaves the board's fit alone whatever the overlays do", () => {
    const inset = boardFitInsetFor({ mode: "portrait", chipsH: 52, controlsH: 84 });
    expect(inset.bottom).toBe(84 + MOBILE_GUTTER);
    expect(inset.top + inset.bottom).toBeLessThan(160);
  });

  it("falls back to the constants before anything has been measured", () => {
    expect(boardFitInsetFor({ mode: "portrait" })).toEqual({
      top: MOBILE_CHIPS_H + MOBILE_GUTTER,
      bottom: MOBILE_CONTROLS_H + MOBILE_GUTTER,
      left: MOBILE_GUTTER,
      right: MOBILE_GUTTER,
    });
  });

  it("puts the landscape rail on the right and keeps the bottom clear", () => {
    const inset = boardFitInsetFor({ mode: "rail", chipsH: 44, controlsH: 300 });
    expect(inset).toEqual({
      top: 44 + MOBILE_GUTTER,
      bottom: MOBILE_GUTTER,
      left: MOBILE_GUTTER,
      right: RAIL_WIDTH + MOBILE_GUTTER,
    });
  });
});

describe("handDrawerLayout", () => {
  // Dean's rule: tapping the fan-peek shows the WHOLE hand — wrap into two rows
  // rather than making the player scroll.
  it("keeps a small hand on one row", () => {
    expect(handDrawerLayout(1)).toEqual({ columns: 1, scroll: false });
    expect(handDrawerLayout(3)).toEqual({ columns: 3, scroll: false });
  });

  it("wraps a normal hand into exactly two rows", () => {
    for (const n of [4, 5, 6, 7, 8]) {
      const { columns, scroll } = handDrawerLayout(n);
      expect(scroll).toBe(false);
      expect(Math.ceil(n / columns)).toBe(2);
      expect(columns * 2).toBeGreaterThanOrEqual(n);
    }
  });

  it("only falls back to scrolling for an oversized hand", () => {
    expect(handDrawerLayout(8).scroll).toBe(false);
    expect(handDrawerLayout(9).scroll).toBe(true);
  });

  it("survives an empty hand", () => {
    expect(handDrawerLayout(0)).toEqual({ columns: 1, scroll: false });
  });
});

describe("proLayoutMode", () => {
  it("is desktop whenever the narrow query does not match", () => {
    expect(proLayoutMode(false, false)).toBe("desktop");
    // A media stub that answers `false` to everything — the headless render
    // harnesses — must land here, not on a phone arrangement.
    expect(proLayoutMode(false, true)).toBe("desktop");
  });

  it("is portrait on a narrow, tall viewport and a rail on a narrow, short one", () => {
    expect(proLayoutMode(true, false)).toBe("portrait");
    expect(proLayoutMode(true, true)).toBe("rail");
  });
});
