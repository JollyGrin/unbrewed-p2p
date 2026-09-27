/**
 * Fit what the board actually DRAWS, not the box it is laid out in.
 *
 * `useZoomPan` fits the frame's layout box into the free part of the screen.
 * For the flat board those are the same thing. For the tabletop board they are
 * not: the plane is tipped back by ~48°, so it is drawn at roughly two thirds
 * of its layout height, and the fit — still reserving the full flat height —
 * left a band of empty table above and below the board and scaled it smaller
 * than the screen allows. On an iPhone in landscape that is the difference
 * between near-rank spaces ~30px tall and something a thumb can hit.
 *
 * So a caller that knows its drawing differs from its layout box can hand the
 * hook the drawn box (`contentBoxFromRects`), and the fit (`fitContent`)
 * places THAT box. Passing the whole frame as the content box reproduces the
 * classic fit exactly, which is what every other caller still gets.
 *
 * Units: the content box is in the frame's own UNSCALED units, measured from
 * the frame's on-screen origin — the space the zoom transform
 * `translate(tx, ty) scale(s)` (origin 0 0) maps onto the screen. Because the
 * 3D tilt happens INSIDE that transform, the drawn box scales linearly with
 * `s`, so a box measured at any zoom is valid at every zoom.
 */
import type { ZoomPanInset } from "./useZoomPan";

export interface ContentBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FitState {
  scale: number;
  tx: number;
  ty: number;
}

/** Same floor as the hook's own fit clamp: a real board never fits this small,
 *  it only guards the division against a zero-size free region. */
const MIN_FIT_SCALE = 0.05;

export const fitContent = (
  container: { w: number; h: number },
  inset: ZoomPanInset,
  content: ContentBox,
  /** the hook's own zoom ceiling; the fit never scales past it */
  maxScale = Number.POSITIVE_INFINITY
): FitState => {
  const { top = 0, right = 0, bottom = 0, left = 0 } = inset;
  const availW = Math.max(container.w - left - right, 1);
  const availH = Math.max(container.h - top - bottom, 1);
  const scale = Math.min(
    maxScale,
    Math.max(MIN_FIT_SCALE, Math.min(availW / content.width, availH / content.height))
  );
  return {
    scale,
    tx: left + (availW - content.width * scale) / 2 - content.left * scale,
    ty: top + (availH - content.height * scale) / 2 - content.top * scale,
  };
};

type Rect = { left: number; top: number; width: number; height: number };

/**
 * The drawn box, in frame units, from on-screen rects.
 *
 * `frameRect` is the frame's own on-screen box and `frameLayoutWidth` the
 * layout width it is drawn from (its height, when quarter-turned), so their
 * ratio is the scale the frame is RENDERED at right now. That, not the hook's
 * target state, is what the content was measured under — mid-transition the
 * two differ, and dividing by the target would mis-size the box.
 */
export const contentBoxFromRects = (
  frameRect: Rect,
  frameLayoutWidth: number,
  drawn: readonly Rect[]
): ContentBox | null => {
  const rendered = frameRect.width / (frameLayoutWidth || 1);
  const visible = drawn.filter((r) => r.width > 0 && r.height > 0);
  if (!(rendered > 0) || visible.length === 0) return null;
  const minX = Math.min(...visible.map((r) => r.left));
  const minY = Math.min(...visible.map((r) => r.top));
  const maxX = Math.max(...visible.map((r) => r.left + r.width));
  const maxY = Math.max(...visible.map((r) => r.top + r.height));
  return {
    left: (minX - frameRect.left) / rendered,
    top: (minY - frameRect.top) / rendered,
    width: (maxX - minX) / rendered,
    height: (maxY - minY) / rendered,
  };
};
