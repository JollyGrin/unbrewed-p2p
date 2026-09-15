/**
 * Touch ergonomics for the Pro board on phones (mobile step 1).
 *
 * Pure geometry, no DOM: the board passes measured numbers in, so every rule
 * here is unit-testable and independent of the zoom/rotation implementation.
 *
 * Coordinates for the focus math are SCREEN (container) pixels. The board's
 * transform is `translate(tx, ty) scale(s)` followed by a fixed rotation, so a
 * frame point lands at `T + s * R(p)` — scaling that about a screen point keeps
 * the rotation intact, which is why the math never needs to know about it.
 */

/** Apple HIG minimum tap target (44pt); Material's 48dp is close enough. */
export const MIN_TOUCH_PX = 44;

export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FreeArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * Size (in the board frame's layout px) of a hit area that renders at least
 * MIN_TOUCH_PX on screen at the given zoom scale, never smaller than the
 * space itself.
 */
export function touchHitSize(layoutDiameterPx: number, scale: number): number {
  const safeScale = scale > 0 ? scale : 1;
  return Math.max(layoutDiameterPx, MIN_TOUCH_PX / safeScale);
}

/**
 * Size of an invisible hit area, as a percentage of a circle's own size, that
 * makes a circle rendering at `renderedDiameterPx` tappable at MIN_TOUCH_PX —
 * but never wider than `maxDiameterPx` (the distance to the nearest other pick),
 * so neighbouring hit areas meet at most at the midpoint and never overlap.
 * Null when no enlargement is needed, possible, or the size is unmeasured (0).
 */
export function touchHitPercent(renderedDiameterPx: number, maxDiameterPx = Infinity): number | null {
  if (!(renderedDiameterPx > 0)) return null;
  const target = Math.min(MIN_TOUCH_PX, maxDiameterPx);
  if (target <= renderedDiameterPx) return null;
  return (target / renderedDiameterPx) * 100;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Distance to the closest other point; points at the same spot are ignored. */
export function nearestNeighbourPx(points: ScreenPoint[], index: number): number {
  const self = points[index];
  return points.reduce((nearest, p, i) => {
    const d = Math.hypot(p.x - self.x, p.y - self.y);
    return i === index || d === 0 ? nearest : Math.min(nearest, d);
  }, Infinity);
}

/**
 * Zoom only when it helps: the picks render below the touch minimum at the
 * resting fit. Picks that are already tappable are left alone however few of
 * them there are or wherever they sit — an ordinary maneuver is two to four
 * spaces beside the fighter, so a "they only span a corner" rule fired on
 * nearly every prompt, even on an iPad in landscape where the spaces are a
 * comfortable ~50px (#835).
 */
export function shouldAutoFocus(pickDiameterPx: number): boolean {
  return pickDiameterPx < MIN_TOUCH_PX;
}

export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Re-express a box measured on screen while the board frame occupied
 * `measured` as where it sits once the frame occupies `target`, plus the size
 * factor between the two. Picks are measured from the DOM after paint, and a
 * new prompt can land while the previous focus is still easing, so the DOM is
 * mid-animation and the hook's own transform is the destination. Both ends of
 * the ease share one function list (translate, scale, fixed rotation), so every
 * intermediate frame is an axis-aligned box and this mapping is exact. An
 * unmeasured (0-size) frame returns the box untouched.
 */
export function rebaseBox(box: ScreenBox, measured: FrameRect, target: FrameRect): { box: ScreenBox; factor: number } {
  if (!(measured.width > 0) || !(measured.height > 0)) return { box, factor: 1 };
  const kx = target.width / measured.width;
  const ky = target.height / measured.height;
  return {
    box: {
      left: target.left + (box.left - measured.left) * kx,
      right: target.left + (box.right - measured.left) * kx,
      top: target.top + (box.top - measured.top) * ky,
      bottom: target.top + (box.bottom - measured.top) * ky,
    },
    factor: Math.min(kx, ky),
  };
}

/**
 * The view transform that centres `box` (screen px) in the free area and scales
 * it to fill, keeping `padding` px of margin, with the resulting scale clamped
 * to [minScale, maxScale].
 */
export function focusTransform({
  current,
  box,
  avail,
  padding,
  minScale,
  maxScale,
}: {
  current: ViewTransform;
  box: ScreenBox;
  avail: FreeArea;
  padding: number;
  minScale: number;
  maxScale: number;
}): ViewTransform {
  const boxW = Math.max(box.right - box.left + 2 * padding, 1);
  const boxH = Math.max(box.bottom - box.top + 2 * padding, 1);
  const wanted = current.scale * Math.min(avail.width / boxW, avail.height / boxH);
  const scale = Math.min(maxScale, Math.max(minScale, wanted));
  const k = scale / current.scale;

  const boxCenterX = (box.left + box.right) / 2;
  const boxCenterY = (box.top + box.bottom) / 2;
  const availCenterX = avail.left + avail.width / 2;
  const availCenterY = avail.top + avail.height / 2;

  return {
    scale,
    tx: availCenterX + k * (current.tx - boxCenterX),
    ty: availCenterY + k * (current.ty - boxCenterY),
  };
}
