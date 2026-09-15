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

/** Below this share of the free area (on the larger axis) the picks feel "huddled". */
const HUDDLED_SHARE = 0.6;

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
 * makes a circle rendering at `renderedDiameterPx` tappable at MIN_TOUCH_PX.
 * Null when no enlargement is needed or the size is not measured yet (0).
 */
export function touchHitPercent(renderedDiameterPx: number): number | null {
  if (!(renderedDiameterPx > 0) || renderedDiameterPx >= MIN_TOUCH_PX) return null;
  return (MIN_TOUCH_PX / renderedDiameterPx) * 100;
}

/** Zoom only when it helps: picks too small to hit, or clustered in a corner. */
export function shouldAutoFocus({
  box,
  avail,
  pickDiameterPx,
}: {
  box: ScreenBox;
  avail: FreeArea;
  pickDiameterPx: number;
}): boolean {
  if (pickDiameterPx < MIN_TOUCH_PX) return true;
  const shareW = (box.right - box.left) / Math.max(avail.width, 1);
  const shareH = (box.bottom - box.top) / Math.max(avail.height, 1);
  return Math.max(shareW, shareH) < HUDDLED_SHARE;
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
