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
 *
 * PHASE 3. Two faults the phase-2 report's own screenshot audit missed
 * because it never measured actual playing size:
 *
 * FAULT #1 — a hero's standee still read as a rectangle. `border-radius` (the
 * phase-2 fix) rounds a box's CORNERS; its SIDES stay dead straight, and at
 * the tens-of-pixels a standee actually renders at, a slightly-rounded
 * rectangle with a hard border and a full-width nameplate reads as "a card
 * someone dropped on the map", not "a figure". `standeeSilhouettePath` below
 * replaces that with a genuinely non-rectangular clip: every edge, not just
 * the corners, curves or angles away from the box.
 *
 * FAULT #2 — the auto-focus-zoom effect (TableStage) badly over-zoomed. It
 * reused ProBoard's own "zoom until the smallest current pick is comfortably
 * tappable" rule unchanged. On the FLAT board every pick renders roughly the
 * same size, so "smallest" and "largest" are the same number and the rule is
 * safe. On this TILTED board a far-rank pick can render a THIRD the size of a
 * near-rank one on the very same prompt (the whole point of the perspective
 * fix), so driving the zoom ceiling off the smallest pick tries to blow the
 * far pick up to a comfortable size — which blows the near pick, and the
 * board itself, straight off the edge of the screen. `tableFocusCapDiameterPx`
 * below feeds a SEPARATE, larger diameter to `useZoomPan.focusOn`'s new
 * `capDiameterPx` parameter so the ceiling is judged by the biggest pick in
 * play, not the smallest.
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
 *
 * TUNING HISTORY (fault #1 of the phase-2 report): the original 1.75 put the
 * camera so far back that the projection was nearly parallel — a screenshot
 * audit measured the far rank rendering at ~same size as the near rank, which
 * reads as "squashed flat", not "tilted". `convergenceRatio` below is the
 * pure-math model of the SAME scale-with-depth the browser's `perspective` +
 * `rotateX` chain produces; at the old ratio it works out to roughly a 1.2×
 * near/far difference on a typical (~2.7:1) Unmatched board. 0.55 was chosen
 * by raising that to a clearly photograph-like ~1.6–1.7× and then confirming
 * against a real rendered screenshot (see the table-board phase-2 report for
 * the measured before/after pixel numbers) that the near rank still reads
 * clearly and nothing clips off the frame.
 */
export const PERSPECTIVE_RATIO = 0.55;

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

/**
 * The near/far SCALE ratio the CSS transform chain actually produces for a
 * point at the board's near edge (y=1) vs its far edge (y=0), computed with
 * the same perspective-projection math the browser applies: `scale = P / (P -
 * z)`, where `z` is how far toward (positive) or away from (negative) the
 * viewer a point sits once `rotateX(tiltDeg)` — pivoting at the plane's own
 * CENTER, per the CSS spec's default `transform-origin` — has acted on it.
 * A point half the board's height from that pivot (an edge) sits at
 * `z = ±(boardHeightPx / 2) * sin(tiltDeg)`.
 *
 * Nothing in the renderer calls this — it exists so retuning
 * `PERSPECTIVE_RATIO` or `DEFAULT_TILT_DEG` can be checked against a concrete
 * number (see tableProjection.test.ts) instead of eyeballing a screenshot,
 * and so the phase-2 report's "how much convergence did this actually buy"
 * claim is a number, not an assertion. It intentionally does NOT fold in the
 * standee's own `standeeScale` falloff — that is a deliberately-separate,
 * additional cue layered on top of whatever this ratio is (see
 * `standeeScale`'s own comment).
 */
export const convergenceRatio = (
  boardWidthPx: number,
  boardHeightPx: number,
  tiltDeg: number = DEFAULT_TILT_DEG
): number => {
  const p = perspectivePx(boardWidthPx);
  const halfH = Math.max(0, boardHeightPx) / 2;
  const rad = (clampTilt(tiltDeg) * Math.PI) / 180;
  const zNear = halfH * Math.sin(rad);
  // ratio = scale(zNear) / scale(-zNear) = [p/(p-zNear)] / [p/(p+zNear)]
  return (p + zNear) / (p - zNear);
};

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

// ---------------------------------------------------------------------------
// Spaces, adjacency lines and hit targets.
//
// Unlike a standee, a SPACE is not billboarded — it is meant to lie flat ON
// the board, so it must NOT counter-rotate. That turns out to need almost no
// extra maths: a plain circle (or an SVG pie wedge) drawn inside the tilted
// plane is squashed into the right ellipse by the CSS `rotateX` transform for
// free, exactly the way a coin drawn on a photographed tabletop looks
// elliptical without anyone doing trigonometry. The same is true of adjacency
// lines and the attacker→target arrow: a straight line between two points in
// the tilted plane still projects to a straight line, so they are plain SVG
// `<line>`/`<path>` elements positioned by the space's ordinary x/y percentage,
// no different from the flat board's own hit-circles.
//
// The one thing the CSS transform does NOT do for us is touch ergonomics: a
// far-rank space is shrunk by BOTH the `perspective` distance AND the tilt's
// foreshortening, so its on-screen hit area can end up well under a thumb at
// exactly the spaces a player most needs to reach past the near rank to tap.
// `tableHitPadFraction` grows an invisible (non-billboarded, same-plane) hit
// circle for a space the farther back it sits, so the tap target stays
// reasonable without needing to measure real on-screen pixels every frame.
// ---------------------------------------------------------------------------

/** Extra hit-circle diameter, as a fraction of the space's own diameter, at
 *  the very far edge (y=0). Tuned to roughly offset the combined perspective +
 *  tilt shrink at DEFAULT_TILT_DEG without the far rank's hit circles starting
 *  to overlap a same-space stack's neighbours. Raised alongside the
 *  PERSPECTIVE_RATIO retune above (fault #1) — a stronger, more photograph-
 *  like convergence shrinks the far rank noticeably more than before, so the
 *  far-edge tap-target padding has to grow to match or those spaces become
 *  hard to hit on a phone. */
export const TABLE_HIT_PAD_FAR = 1.3;

/** How much extra (invisible) hit-circle padding a space at normalized `y`
 *  gets, as a fraction of its own diameter: 0 at the near edge (already full
 *  size), rising toward `TABLE_HIT_PAD_FAR` at the far edge. */
export const tableHitPadFraction = (y: number): number => {
  const clamped = Math.min(1, Math.max(0, y));
  return TABLE_HIT_PAD_FAR * (1 - clamped);
};

/** A space's invisible hit-circle diameter (same %-of-board-width unit as the
 *  map's own `spaceDiameter`), padded for depth via `tableHitPadFraction`. */
export const tableHitDiameter = (spaceDiameterPct: number, y: number): number =>
  spaceDiameterPct * (1 + tableHitPadFraction(y));

/**
 * Evenly divides a circle into `count` wedges for a multi-zone space (SET
 * semantics — one wedge per zone, in the map's own `zones` order), starting
 * at 12 o'clock and going clockwise so the first zone always reads at the
 * top regardless of how many others share the space.
 */
export const pieSliceAngles = (count: number): [number, number][] => {
  const safeCount = Math.max(1, Math.round(count));
  const span = 360 / safeCount;
  return Array.from({ length: safeCount }, (_, i) => [i * span, (i + 1) * span]);
};

/** A point on a circle of radius `r` centered at `(cx, cy)`, `deg` clockwise
 *  from 12 o'clock — the convention `pieSliceAngles` divides in. */
const circlePoint = (cx: number, cy: number, r: number, deg: number): { x: number; y: number } => {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
};

/**
 * SVG path `d` for one pie wedge of a multi-zone space, in the SAME local
 * coordinate space a plain `<circle r={r} cx={cx} cy={cy}>` would use — the
 * enclosing tilted plane is what turns it into the on-screen ellipse slice,
 * not this function. A single-zone space should render a plain `<circle>`
 * instead of calling this (a 360° wedge degenerates to a point pair).
 */
export const pieSlicePath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number): string => {
  const start = circlePoint(cx, cy, r, startDeg);
  const end = circlePoint(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
};

// ---------------------------------------------------------------------------
// Standee silhouette (phase-3 fault #1 — see the file header). A HERO plate
// is clipped to this shape via CSS `clip-path: path(...)`, so its portrait
// art, background and edge all read as a figure instead of a rectangle.
// ---------------------------------------------------------------------------

/**
 * Keypoint fractions for the standee silhouette. X fractions are HALF-WIDTHS
 * measured from the plate's own vertical centerline — the path mirrors the
 * same number for the left side, so the shape is always bilaterally
 * symmetric (an asymmetric standee would read as a rendering bug, not a
 * design choice). Y fractions are plain top-down fractions of the full
 * height. Ordering the three half-widths SHOULDER > FOOT > WAIST is what
 * makes this read as "a figure standing" rather than a lozenge or a blob: a
 * real standee is widest at the shoulders, and a waist strictly narrower
 * than the feet gives the outline a visible "stance" instead of tapering
 * smoothly to a point.
 */
export const STANDEE_SHOULDER_HALF_WIDTH = 0.46;
export const STANDEE_FOOT_HALF_WIDTH = 0.38;
/**
 * Widened the gap from a first attempt at 0.3 (fault #1's own follow-up
 * check): a real WebKit screenshot at actual playing size (a hero plate
 * inside the billboard's `rotateX`+`perspective` counter-rotation) showed the
 * waist pinch this shape relies on to read as "a figure, not a lozenge" was
 * present but SUBTLE — the counter-rotated billboard doesn't project with
 * perfectly uniform scale top-to-bottom the way the flat (un-rotated) SVG
 * math alone predicts, so the pinch needs a wider margin than the abstract
 * geometry would suggest to still read clearly once it has gone through that
 * transform. Pixel-measured on that same screenshot (a ~95px-wide plate):
 * shoulder ≈107px, foot ≈95px, waist ≈75px at the OLD 0.3 — correctly
 * ordered, but only a ~30% narrowing at the waist. 0.24 was chosen to widen
 * that margin without the waist reading as a hard pinch/notch.
 */
export const STANDEE_WAIST_HALF_WIDTH = 0.24;
/** Dome → shoulder transition, as a fraction of the plate's height. */
export const STANDEE_DOME_Y = 0.22;
/** Shoulder → waist transition, as a fraction of the plate's height. */
export const STANDEE_WAIST_Y = 0.62;

/**
 * SVG path `d` for a hero plate's silhouette clip, sized to the SAME
 * `widthPx`×`heightPx` the caller already renders the plate's own CSS
 * `width`/`height` at — `clip-path: path(...)` coordinates are in the
 * element's own local px, independent of any ambient zoom/tilt transform on
 * an ancestor, so this needs no knowledge of either.
 *
 * The outline is a genuine SVG elliptical arc (not a hand-fitted bezier) for
 * the domed head/shoulders, mirrored straight edges for the shoulder→waist
 * taper and waist→foot flare, and a flat foot edge (where the figure
 * actually contacts its base — see TableStandeeAnchor). Straight diagonal
 * edges read as a deliberate, faceted cut — like a die-cut cardboard
 * standee — not as a rounding error, and are exactly reproducible from the
 * keypoint fractions above with no curve-fitting judgment calls; see
 * tableProjection.test.ts for the coordinates this produces at a known size.
 */
export const standeeSilhouettePath = (widthPx: number, heightPx: number): string => {
  const w = Math.max(1, widthPx);
  const h = Math.max(1, heightPx);
  const cx = w / 2;
  const round = (n: number): number => Math.round(n * 10) / 10;

  const shoulderX = cx + STANDEE_SHOULDER_HALF_WIDTH * w;
  const waistX = cx + STANDEE_WAIST_HALF_WIDTH * w;
  const footX = cx + STANDEE_FOOT_HALF_WIDTH * w;
  const domeY = STANDEE_DOME_Y * h;
  const waistY = STANDEE_WAIST_Y * h;
  const domeRx = shoulderX - cx;

  return [
    `M ${round(cx)} 0`,
    `A ${round(domeRx)} ${round(domeY)} 0 0 1 ${round(shoulderX)} ${round(domeY)}`,
    `L ${round(waistX)} ${round(waistY)}`,
    `L ${round(footX)} ${round(h)}`,
    `L ${round(w - footX)} ${round(h)}`,
    `L ${round(w - waistX)} ${round(waistY)}`,
    `L ${round(w - shoulderX)} ${round(domeY)}`,
    `A ${round(domeRx)} ${round(domeY)} 0 0 1 ${round(cx)} 0`,
    "Z",
  ].join(" ");
};

// ---------------------------------------------------------------------------
// Auto-focus-zoom cap (phase-3 fault #2 — see the file header).
// ---------------------------------------------------------------------------

/**
 * Auto-focus-zoom safety floor. TableStage's auto-focus effect feeds
 * `useZoomPan.focusOn`'s zoom-ceiling parameter (`capDiameterPx`) the size of
 * the LARGEST currently-visible pick rather than the smallest, so a lone tiny
 * far-rank pick can no longer drag the ceiling in past what a same-prompt
 * near pick can tolerate (fault #2 itself: a lone tiny far pick pushed the
 * far rank clean off the top of the screen). This floor covers the rarer
 * case where EVERY current pick happens to be small and far (e.g. every
 * legal destination this turn is in the back row) — without it, "largest of
 * an all-small set" is still small, and the same runaway-zoom failure mode
 * returns. A flat px figure, not a fraction of the board's own size, because
 * the quantity it protects is itself a flat on-screen px figure compared
 * directly against `FOCUS_MAX_PICK_PX` inside `focusOn` — a board-relative
 * fraction here would reintroduce the exact unit mismatch this exists to
 * avoid.
 */
export const TABLE_FOCUS_CAP_FLOOR_PX = 48;

export const tableFocusCapDiameterPx = (measuredMaxPickPx: number): number =>
  Math.max(measuredMaxPickPx, TABLE_FOCUS_CAP_FLOOR_PX);
