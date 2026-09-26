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
 * (PHASES 3–4 below describe the portrait silhouette a hero without a
 * miniature used to be drawn as. It was replaced on 2026-09-23 by the deck's
 * own round token lying flat on its space — see TableFlatToken — so the
 * helpers they name no longer exist; the history is kept for the reasons.)
 *
 * PHASE 4. One fault left once the silhouette existed at all (phase 3 below
 * drew a non-rectangular clip, but drew it upside down) plus the art-fit
 * problem that made even a correctly-shaped clip look like a masked
 * rectangle:
 *
 * FAULT #1 — the silhouette was WIDEST at the top and tapered DOWN to the
 * base: a funnel, or a badminton shuttlecock, not a standing figure. The
 * root cause was `STANDEE_SHOULDER_HALF_WIDTH` being the LARGEST of the
 * three half-widths (see `standeeSilhouettePath`'s own comment for the
 * ordering fix) — a real standee (cardboard or a real body) is widest at
 * its base, where it actually contacts the ground and needs to be stable,
 * not at the head/shoulder dome near the top.
 *
 * FAULT #2 — a correctly-shaped clip still looked like "a picture lying on
 * the space" rather than "a figure standing on it", because the PORTRAIT
 * ART inside that clip was never fitted to it: `object-fit: cover` alone
 * only crops the plate's excess WIDTH (these token portraits are square,
 * the plate is tall — see `TableFighterStandee`'s own comment on why cover
 * binds on height for that aspect ratio and leaves the full square,
 * including a large expanse of pale card background above the character's
 * head, sitting inside the plate untouched). `standeeArtTransform` below
 * fixes this with a further, deliberate zoom.
 *
 * PHASE 5. The owner's own words: "mehr 3d, die figuren müssen besser
 * gesetzt werden auf dem brett" (more three-dimensionality, and the figures
 * must sit better on the board). Four faults, none of them about the tilt
 * itself (phase 2 already fixed that) — about what the tilted plane was
 * still missing to read as a physical object:
 *
 * FAULT #1 — the board itself was a zero-depth decal: the tilted plane drew
 * the map, and nothing else, so the whole thing read as a sheet of paper
 * lying at an angle, not a slab resting on a table. `TableBoardEdge.tsx`
 * extrudes a real side face from the board's own near edge using the same
 * fold-a-flap-out-of-the-local-UNTILTED-plane idea this file's own header
 * already documents for a flat disc, then lets the ambient `rotateX` (below)
 * carry it along as part of the same rigid object — but folded PART way
 * (`EDGE_FOLD_DEG`), not to a true 90°; see the "Board thickness" section
 * further down for why a perpendicular cube face renders invisible (a real
 * geometric fact — a face folded exactly edge-on to the camera has zero
 * apparent width in any projection, not a rendering-engine quirk) and
 * measures instead as a deliberate, tuned bevel. `boardThicknessPx` /
 * `EDGE_FOLD_DEG` / `Z_BOARD_EDGE` are its geometry knobs.
 *
 * FAULT #2 — a standee's BASE disc (`TableStandeeAnchor`) was sized off the
 * FIGURE's own plate width, not off the space it stood on. Those two numbers
 * have no relationship: `PLATE_WIDTH_FACTOR` (TableFighterStandee.tsx)
 * deliberately makes the plate wider than the token footprint "so a portrait
 * plate doesn't feel cramped standing on the same footprint" — so a base
 * derived from it was never going to match the space underneath, and the
 * close-up screenshot this phase started from shows exactly that: an
 * oversized, off-center base disagreeing with the space ellipse it should
 * be sitting inside. `standeeBaseDiameterPx` below derives the base from the
 * SAME `diamPx` `TableSpace` itself renders its disc at, so the two numbers
 * are the same number by construction and can't drift again. The base disc
 * itself also used to pre-squash its own ellipse (a hand-tuned 0.4
 * height:width ratio) BEFORE the ambient tilt — double-foreshortening it
 * relative to the space's disc, which (like every flat circle in this file)
 * needs no manual squash at all. `TableStandeeAnchor` now draws it as a
 * plain circle, exactly like `TableSpace` already does.
 *
 * FAULT #3 — every standee's contact shadow was anchored as a PERCENTAGE OF
 * THE PLATE'S OWN HEIGHT (`bottom: -6%` / `-11%` of a tall plate box), not
 * of anything tied to the board plane. That pushed both the base and the
 * shadow away from the space's true centre by an amount that changed with
 * the plate's own proportions, and gave every piece a slightly different
 * effective offset — the opposite of "one light source, one offset,
 * everywhere". `SHADOW_OFFSET_X`/`SHADOW_OFFSET_Y` below are now a single
 * fixed fraction of the BASE's own diameter, applied identically to every
 * standee, and the base itself carries zero offset (concentric with the
 * space, per fault #2) — only the shadow leans.
 *
 * FAULT #4 — the tilted board sat in a flat, dead-coloured field with no
 * yaw, no surface treatment, and (per fault #1) no edge — nothing marked it
 * as an object resting on something else. `TABLE_YAW_DEG` gives the whole
 * scene (board AND pieces, since it is the outermost, camera-level rotation
 * — see `boardTransform`'s own comment) a restrained turn so it is not
 * perfectly square to the viewer; the surface/vignette treatment itself
 * lives in TableStage.tsx, since it paints AROUND the board rather than
 * projecting anything onto it.
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
/**
 * Measured from the official app rather than eyeballed: its board is drawn at
 * ~0.76 of its true depth, i.e. tipped back ~40°. At 48° our flat, top-down
 * board art squashed to 0.67 of its depth and read as a squeezed picture
 * (owner feedback, 2026-09-23: "verzerrt"); at 40° the board is drawn 17%
 * taller in the same width, and the mean space width is unchanged (probe
 * sweep on Secluded Temple, iPhone 14 landscape).
 */
export const DEFAULT_TILT_DEG = 40;

/**
 * Perspective distance as a multiple of the board's rendered WIDTH, so the
 * strength of the effect is identical on a phone and on a desktop instead of
 * scaling with pixels. Lower = more dramatic convergence.
 *
 * TUNING HISTORY. 1.75 was the first value. A phase-2 screenshot audit
 * judged it "squashed flat" and it went to 0.55 — by eye, with no reference.
 * Measured against the official app (2026-09-23): its board's near edge is
 * 1.25× its far edge; 0.55 made ours ~2.4× at the edges, a near rim so wide
 * that fitting what the board actually draws (lib/pro/fitContent) shrank the
 * playable spaces by a quarter (mean space width 32px vs 42px at 1.75 on an
 * iPhone 14 in landscape, same board, same fit). 1.75 gives ~1.3 on a
 * Secluded-Temple-shaped board — the reference, within tolerance.
 *
 * 1.1 (same day, owner feedback "not really 3D"): the reference's boards are
 * PAINTED for its camera — walls and trees drawn with their own depth — while
 * ours are flat top-down art, which needs a little more convergence to read
 * as receding. 1.1 gives ~1.43 on Secluded Temple (1.24 on a wide 2.7:1
 * board) for a mean space width of 40.3px vs 42.3px at 1.75 — a small price;
 * the bigger depth cues are the table and light around the board
 * (TableSurface.tsx), not the lens.
 */
export const PERSPECTIVE_RATIO = 1.1;

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

/**
 * The board frame's own transform — the plane everything else lives in.
 *
 * `yawDeg` (phase-5 target #5 — see the file header) composes OUTSIDE the
 * tilt: it is the LEFT function in the string, so — per the CSS transform
 * spec's right-to-left application order — it is the LAST one applied. The
 * board tilts back in its own local frame first, and the already-tilted
 * result is then turned a little about the WORLD vertical axis, the same
 * way a camera positioned slightly to one side would see it. Composing it
 * the other way (yaw first, tilt second) would instead spin the board like
 * a record on its own already-tilted axis — the board twisting, not the
 * camera moving. Everything inside this plane (the board image, spaces,
 * lines, AND every standee — none of which counter-rotate Y, only
 * `standeeTransform`'s own X) yaws together, which is what makes it read as
 * the whole camera shifting rather than the board art skewing on its own.
 *
 * Omitted (0) `yawDeg` renders byte-identical to the pre-phase-5 output —
 * TableStage only ever passes a non-zero yaw once it has confirmed the
 * player has not asked for reduced motion. */
export const boardTransform = (tiltDeg: number, yawDeg: number = 0): string => {
  const tilt = `rotateX(${clampTilt(tiltDeg)}deg)`;
  return yawDeg ? `rotateY(${yawDeg}deg) ${tilt}` : tilt;
};

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
 * Painter's order for a LARGE fighter's name pill, floating at the midpoint of
 * its two spaces: one above BOTH band ends, so the fighter's own head and tail
 * pieces (each at `standeeZIndex` of its space) never clip the label.
 */
export const bandLabelZIndex = (headY: number, tailY: number): number =>
  Math.max(standeeZIndex(headY), standeeZIndex(tailY)) + 1;

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
// (The standee silhouette clip and its portrait-art zoom — phase 3 and 4 —
// were removed on 2026-09-23: a hero without a miniature is now its deck's
// round token lying flat on its space, see TableFlatToken.)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Board thickness (phase-5 fault #1 — see the file header). The extrusion
// itself lives in TableBoardEdge.tsx; these are its only geometry knobs.
//
// WHY A 45° FOLD, NOT A TRUE 90° CUBE FACE. The textbook CSS technique for a
// slab's edge is to fold a flap by EXACTLY -90° from its parent's local
// frame — geometrically correct, and what this file's own header describes
// for the "billboard" trick. Built that way, it renders in Chromium but is
// completely invisible in Playwright's WebKit (this project's own required
// screenshot-verification engine), confirmed directly against the real
// app — not a simplified repro — with `EDGE_FOLD_DEG` at 90 vs at its
// current value: the board's own perspective is genuinely working (the
// visual probe's `depthRatio` — near-space height ÷ far-space height — reads
// well above 1.0, so this is NOT a "CSS perspective does nothing here"
// engine bug). The actual cause is plainer than that: a face folded by
// EXACTLY 90° from facing the camera is edge-on to a viewer looking straight
// down that axis, which has zero apparent width in ANY projection,
// perspective included — perspective changes how big things look with
// distance, not whether a true, zero-thickness 2D plane has any visible
// cross-section at all once it is turned knife-edge to the camera. The fold
// angle sits inside a `preserve-3d` stage that ALSO carries the board's own
// ambient tilt/yaw, so "facing the camera" here means the flap's LOCAL,
// pre-ambient-rotation frame, not the final on-screen orientation — but the
// same zero-at-exactly-90° fact holds regardless.
// `EDGE_FOLD_DEG` folds the flap only PART way — a chamfered/beveled edge
// instead of a perpendicular cliff face — which reads as "the board's side,
// angled back and down" while staying well clear of that degenerate case.
// Confirmed comfortably visible, in the real app, across the tilt's entire
// supported range (`MIN_TILT_DEG` through `MAX_TILT_DEG`, with
// `TABLE_YAW_DEG` layered on top) via an isolated sweep of the fold angle,
// whose measured visible-height numbers track `cos(fold)` closely — the same
// curve a genuinely edge-on face would produce, which is exactly the
// confirmation that this is the real mechanism at work, not a guess.
// ---------------------------------------------------------------------------

/** Board slab thickness as a fraction of the board's own rendered WIDTH — a
 *  ratio, not a flat px figure, for the same reason `PERSPECTIVE_RATIO` is
 *  one (see its own comment above): a phone and a desktop render this view
 *  at very different pixel widths, and a fixed px thickness would look
 *  right on only one of them. Larger than a first pass at this ratio
 *  (0.022, close to a space's own printed diameter) because `EDGE_FOLD_DEG`
 *  below only ever shows a FRACTION of this flat figure once folded — 0.035
 *  is tuned so the worst case (`MAX_TILT_DEG`, the shallowest remaining
 *  band) still renders a clearly legible edge rather than a hairline. */
export const BOARD_THICKNESS_RATIO = 0.035;

export const boardThicknessPx = (frameWidthPx: number): number =>
  Math.max(1, frameWidthPx) * BOARD_THICKNESS_RATIO;

/**
 * How far the edge flap folds out of the board's own local, untilted plane —
 * see this section's header comment for why this stops well short of a true
 * 90° perpendicular face. Measured from FLAT (0° would lie invisibly behind
 * the board's own face; 90° is the degenerate, edge-on-to-the-camera cube
 * face): 45° is the midpoint, chosen because it held up across the whole
 * isolated repro sweep (comfortably visible at every combination of
 * `MIN_TILT_DEG`/`DEFAULT_TILT_DEG`/`MAX_TILT_DEG` and `TABLE_YAW_DEG` that
 * was tested) with no need to special-case any particular tilt.
 */
export const EDGE_FOLD_DEG = 45;

// The fit used to reserve a bottom margin for the extruded edge here
// (BOARD_EDGE_FIT_RESERVE_FACTOR), because it fitted the FLAT layout box and
// could not see the edge. TableStage now measures what the board actually
// draws — plane and edge together — and fits that (lib/pro/fitContent), so
// the edge is inside the fitted box by construction.

/** Stacking for the board's own extruded side face. Must stay under
 *  `Z_BASE` (10) — there is no scenario where the board's own body should
 *  paint in front of a piece standing near its front edge — but otherwise
 *  needs no `y`-derived range the way standees get: the whole board has one
 *  edge face at one depth, not many pieces at many depths. */
export const Z_BOARD_EDGE = 1;

// ---------------------------------------------------------------------------
// Standee base geometry (phase-5 fault #2 — see the file header). Applied
// in TableStandeeAnchor.tsx.
// ---------------------------------------------------------------------------

/**
 * A standee's base disc, as a fraction of the SPACE's own rendered diameter
 * — the same `diamPx` every caller already computes for `TableSpace` itself
 * (see TableBoard.tsx). Deriving the base from the space's own footprint,
 * rather than from the FIGURE's plate width (the pre-phase-5 recipe), is
 * the actual fix: the plate is deliberately WIDER than the space it stands
 * on (`PLATE_WIDTH_FACTOR` in TableFighterStandee.tsx — "so a portrait
 * plate doesn't feel cramped standing on the same footprint"), so a base
 * sized off the plate could never end up matching the space underneath it —
 * the two numbers had no relationship to drift back into. Basing both on
 * the space makes them the same number by construction.
 *
 * Kept a little SHORT of 1 (not flush with the space's own printed edge) so
 * the space's own highlight/relocate ring and zone-color rim stay visible
 * around the base — a base that exactly matched the space's outer edge
 * would bury that ring under an opaque disc.
 *
 * ON THE FIGURE'S OWN OUTLINE: a miniature's shoulders or cloak can
 * still extend past this base at the widest point — that is deliberate and
 * matches a real miniature on a round base, whose model routinely overhangs
 * its own base at the shoulders. It is the BASE, not the whole silhouette,
 * that has to agree with the space; the pre-phase-5 code instead tried to
 * keep the base wider than the silhouette's own feet, which is exactly
 * backwards from what the phase-5 screenshot flagged (an oversized base,
 * not dangling feet).
 */
export const BASE_TO_SPACE_DIAMETER_RATIO = 0.9;

export const standeeBaseDiameterPx = (spaceDiamPx: number): number =>
  Math.max(0, spaceDiamPx) * BASE_TO_SPACE_DIAMETER_RATIO;

// ---------------------------------------------------------------------------
// Contact shadow (phase-5 fault #3 — see the file header). Applied in
// TableStandeeAnchor.tsx.
// ---------------------------------------------------------------------------

/**
 * The shadow's displacement from its own base's centre, as a fraction of
 * the BASE's own diameter, along each axis of the board's LOCAL (untilted)
 * plane — the same plane `TableSpace`'s disc and the base disc itself live
 * in, so the ambient `rotateX` foreshortens this offset exactly the way it
 * foreshortens everything else in that plane, with no separate trig needed
 * here either (see this file's header comment on that same effect for a
 * flat disc).
 *
 * ONE fixed vector, reused for every piece on the board, is what makes it
 * read as a single light source rather than a per-piece drop shadow: every
 * standee's shadow leans the same way, by a proportional amount, regardless
 * of the piece's own size or position on the board. The direction (up-board
 * and toward the left) is a conventional upper-left key light — the same
 * convention most card/board game art and product photography already use,
 * so it reads as "normal" lighting rather than a stylistic choice that
 * fights the map art under it.
 */
export const SHADOW_OFFSET_X = -0.16;
export const SHADOW_OFFSET_Y = -0.22;

/**
 * How much farther a shadow's offset reaches at the far edge (y=0) versus
 * the near edge (y=1) — a deliberate, cheap ATMOSPHERIC cue (a single real
 * light source would not actually lengthen a shadow with camera distance),
 * not a physically exact one. `TableStandeeAnchor` also widens the shadow's
 * own soft-edge falloff by this same factor, so a farther piece reads with
 * both a longer AND a softer shadow — keeping distance legible even once
 * `standeeScale`'s own size falloff (deliberately under-corrected, see its
 * own comment above) has already done most of that job. Implemented as a
 * layered `radial-gradient` fill rather than `filter: blur()` — the softer
 * edge costs one extra gradient color stop, not a per-element GPU blur pass
 * (see TableStandeeAnchor.tsx's own comment on why that trade matters on a
 * board with a dozen-plus pieces on screen on a phone).
 */
export const SHADOW_STRETCH_FAR = 1.6;

export const standeeShadowStretch = (y: number): number => {
  const clamped = Math.min(1, Math.max(0, y));
  return SHADOW_STRETCH_FAR - (SHADOW_STRETCH_FAR - 1) * clamped;
};

// ---------------------------------------------------------------------------
// Camera life (phase-5 fault #4 — see the file header). Applied in
// TableStage.tsx, gated on `useReducedMotion`.
// ---------------------------------------------------------------------------

/**
 * A restrained yaw, in degrees — enough that the board reads as photographed
 * from a camera slightly off to one side rather than a flat diagram square
 * to the viewer, short of anything a player would call "tilted" or
 * "crooked". Chosen by eye against a real screenshot: below this the effect
 * was imperceptible; much above it the board's own rectangular edges (once
 * `TableBoardEdge` gives it visible ones) started reading as an odd
 * trapezoid rather than a photograph. See `boardTransform`'s own comment for
 * how this composes with the tilt.
 */
export const TABLE_YAW_DEG = 2.5;

// ---------------------------------------------------------------------------
// Combat FX placement
// ---------------------------------------------------------------------------
//
// A combat beat on this board splits into two things that want OPPOSITE
// treatment, which is the whole reason they get their own bands:
//
//  - The shockwave ring is a mark ON the board. It stays in the board plane,
//    foreshortened with everything else, and belongs UNDER the pieces — a ring
//    drawn over a figure's feet would read as a halo around it rather than as
//    something happening on the ground.
//  - The damage number is INFORMATION. It billboards upright so it can be read
//    at all, and it is deliberately lifted clear of every piece: losing a "−3"
//    behind a nearer figure loses the one fact the player needed from that beat.
//    Spatial honesty is the right default on this board, and this is the place
//    it is worth breaking.

/** Ground effects sit below the piece band — see Z_BASE's own note. */
export const fxRingZIndex = (): number => Z_BASE - 1;

/**
 * Damage numbers get a band of their own ABOVE every piece, while keeping their
 * relative order so two simultaneous beats still stack front-to-back sensibly.
 */
export const Z_FX_LABEL_BASE = Z_BASE + Z_RANGE + 1;

export const fxLabelZIndex = (y: number): number => {
  const clamped = Math.min(1, Math.max(0, y));
  return Z_FX_LABEL_BASE + Math.round(clamped * Z_RANGE);
};
