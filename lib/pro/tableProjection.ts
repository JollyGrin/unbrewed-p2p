/**
 * The "table" board view — the projection maths.
 *
 * The flat board (ProBoard) draws the map straight on, which reads like a
 * diagram. The table view instead lays the same map down in front of the
 * player the way a real Unmatched board sits on a table: tilted away from the
 * camera, with the fighters standing UPRIGHT on it like cardboard standees.
 *
 * Nothing about the game changes — this module is pure geometry, fed by the
 * very same normalized `ProMapSpace.x/y` (0–1 fractions of the board image)
 * the flat board already uses. That is the whole point: one source of board
 * truth, two ways of drawing it.
 *
 * HOW THE TILT WORKS. The board frame gets `rotateX(-tilt)` inside a
 * `perspective` container, so the far edge recedes. Each standee then gets the
 * OPPOSITE rotation (`rotateX(+tilt)`) about its own base, which cancels the
 * board's tilt for that one element and leaves it facing the camera while its
 * feet stay planted in the board plane. This is the standard billboard trick,
 * and it is why a standee needs no art of its own to look like it is standing
 * up.
 *
 * WHY EXPLICIT z-index. With `preserve-3d` the browser sorts by real depth,
 * but a counter-rotated billboard is coplanar with the camera and sorts
 * unreliably across engines (WebKit in particular). Depth order on this board
 * is strictly "further up the image = further away", so we derive the stacking
 * order from `y` directly and never depend on the 3D sort.
 */

/** Tilt in degrees. 0 is the flat board; the useful range stops well short of edge-on. */
export const MIN_TILT_DEG = 0;
/** Past this the near row of spaces squashes into unreadable slivers. */
export const MAX_TILT_DEG = 62;
/** Matches the tabletop feel of the reference screenshots without hiding the far rank. */
export const DEFAULT_TILT_DEG = 48;

/**
 * Perspective distance as a multiple of the board's rendered WIDTH, so the
 * strength of the effect is identical on a phone and on a desktop instead of
 * scaling with pixels. Lower = more dramatic convergence.
 */
export const PERSPECTIVE_RATIO = 1.75;

/**
 * Stacking band for standees. Board decoration sits below `Z_BASE`; anything
 * the player drags or opens sits above `Z_BASE + Z_RANGE`.
 */
export const Z_BASE = 10;
export const Z_RANGE = 1000;

export const clampTilt = (deg: number): number =>
  Math.min(MAX_TILT_DEG, Math.max(MIN_TILT_DEG, deg));

/** `perspective` for the container that holds the tilted board frame. */
export const perspectivePx = (boardWidthPx: number): number =>
  Math.max(1, boardWidthPx) * PERSPECTIVE_RATIO;

/** The board frame's own transform — the plane everything else lives in. */
export const boardTransform = (tiltDeg: number): string =>
  `rotateX(${clampTilt(tiltDeg)}deg)`;

/**
 * A standee's counter-rotation. Applied about `transform-origin: 50% 100%`
 * (its feet) so the figure pivots up out of the board rather than sliding.
 */
export const standeeTransform = (tiltDeg: number): string =>
  `rotateX(${-clampTilt(tiltDeg)}deg)`;

/**
 * Painter's order for a piece at normalized `y` (0 = far edge, 1 = near edge).
 * Near pieces must overlap far ones, so the index rises with `y`.
 */
export const standeeZIndex = (y: number): number => {
  const clamped = Math.min(1, Math.max(0, y));
  return Z_BASE + Math.round(clamped * Z_RANGE);
};

/**
 * How much a piece at normalized `y` shrinks with distance.
 *
 * CSS perspective already scales the board's own surface, but a standee is
 * counter-rotated back to face the camera, which undoes part of that — a far
 * figure would otherwise read as the same size as a near one. This restores a
 * gentle, deliberately UNDER-corrected falloff: enough to sell the depth,
 * never enough to make the far player's hero hard to identify.
 */
export const DEPTH_SCALE_FAR = 0.82;

export const standeeScale = (y: number): number => {
  const clamped = Math.min(1, Math.max(0, y));
  return DEPTH_SCALE_FAR + (1 - DEPTH_SCALE_FAR) * clamped;
};

/** Everything a standee needs, in one call — the shape the renderer consumes. */
export interface StandeePlacement {
  transform: string;
  zIndex: number;
  scale: number;
}

export const placeStandee = (y: number, tiltDeg: number): StandeePlacement => ({
  transform: `${standeeTransform(tiltDeg)} scale(${standeeScale(y).toFixed(3)})`,
  zIndex: standeeZIndex(y),
  scale: standeeScale(y),
});
