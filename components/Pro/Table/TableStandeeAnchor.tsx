/**
 * Shared positioning rig for every standing piece on the table (hero plates,
 * sidekick tokens, the LARGE-fighter tail token): plants a box's
 * BOTTOM-CENTER at the space's normalized (x, y), gives it the billboard
 * counter-rotation from tableProjection.ts so it faces the camera instead of
 * lying flat with the board, and draws a standee BASE underneath it.
 *
 * FAULT #3 (phase-2 report — "heroes read as cards lying on the board, not
 * figures standing on it"). The fix that actually sells "standing figure" is
 * this base: a visible elliptical disc that stays IN THE BOARD'S OWN PLANE
 * (never counter-rotated, exactly like a space's own disc — see
 * tableProjection.ts's header comment on why a flat circle needs no extra
 * maths to read as a correctly-foreshortened ellipse under `rotateX`), while
 * the FIGURE billboards upright out of it. A real cardboard standee is
 * physically built this way — a flat plastic base slotted into a flat
 * cardboard figure — so drawing it this way is what makes the on-screen
 * result read as the real object instead of a floating card. The base is
 * rendered BEFORE (below) the billboard, and the contact shadow before that,
 * so the stacking order matches "shadow, then base, then figure" from the
 * ground up.
 *
 * See TableStage's header comment for why the perspective/tilt lives where it
 * does; see tableProjection.ts's header comment for why the shadow/base are
 * NOT counter-rotated while the figure above them is.
 *
 * PHASE 3 (fault #1 in tableProjection.ts's own header — "still reads as a
 * rectangle"): this base existed in phase 2 but was too subtle to survive at
 * actual playing size — a 1.5px rim on a disc no wider than the figure's own
 * silhouette blended straight into a same-colored highlighted space
 * underneath it. It was widened and its rim/outer-ring contrast bumped, so
 * the base — never the figure — is the one place a piece's owner-color
 * reads.
 *
 * PHASE 5 (targets #2/#3 — see tableProjection.ts's own header for the full
 * fault writeup). Two faults a real close-up screenshot exposed that the
 * phase-3 fix above didn't: the base was sized off the FIGURE's own plate
 * width (via a per-caller `shadowWidthFactor`), which has no relationship to
 * the SPACE the piece is actually standing on, so the two visibly
 * disagreed — oversized, off-center, "swamping" the space rather than
 * sitting inside it. And the base disc pre-squashed its own ellipse by a
 * hand-tuned ratio BEFORE the ambient tilt, double-foreshortening it. Both
 * are fixed the same way `TableSpace`'s own disc already works: draw a
 * PLAIN CIRCLE sized directly off the space's own rendered diameter
 * (`spaceDiamPx`, `standeeBaseDiameterPx`) and let the shared ancestor's
 * `rotateX` do 100% of the foreshortening, with zero manual offset — so the
 * base is now geometrically CONCENTRIC with the space underneath it, not
 * approximately so. The contact shadow keeps a deliberate offset (the one
 * that actually reads as "cast by a light", fault #3), now expressed as a
 * single fixed fraction of the base's OWN diameter (`SHADOW_OFFSET_X/Y`)
 * instead of a percentage of the (unrelated) plate height, and softened via
 * a layered `radial-gradient` rather than `filter: blur()` — cheap enough to
 * put on every piece on the board without costing a GPU blur pass per piece
 * (a real concern on a phone with a dozen-plus standees visible at once).
 */
import { ReactNode } from "react";
import { Box, chakra, shouldForwardProp } from "@chakra-ui/react";
import { isValidMotionProp, motion } from "framer-motion";
import {
  placeStandee,
  standeeBaseDiameterPx,
  standeeShadowStretch,
  standeeTransform,
  SHADOW_OFFSET_X,
  SHADOW_OFFSET_Y,
} from "@/lib/pro/tableProjection";

// motion.div wrapped in Chakra's style-prop system (same recipe as ProBoard's
// own MotionFlex) — lets the anchor keep every Chakra layout prop while also
// accepting framer-motion's `animate`/`transition` for the pendingMove tween.
const MotionBox = chakra(motion.div, {
  shouldForwardProp: (prop) => isValidMotionProp(prop) || shouldForwardProp(prop),
});

/** A just-committed move to glide through, in the SAME normalized 0–1 board
 *  coordinates as everything else here (not the flat board's 0–100 — this is
 *  the table view's own render path, so it converts once, at the call site). */
export interface TableAnchorAnim {
  xs: number[];
  ys: number[];
  durationSec: number;
  /** Keyframe stops (0–1), one per xs/ys entry. Absent = evenly spaced, which
   *  is what a walk wants; a swap's crossfade brackets its jump instead. */
  times?: number[];
  /** Opacity keyframes, same count as xs/ys — the swap crossfade (protocol
   *  v31) fades out, jumps while invisible and fades back in. Absent = the
   *  piece stays opaque, exactly as a walk renders. */
  opacity?: number[];
}

export interface TableStandeeAnchorProps {
  /** Hands the anchor's ROOT element to the caller. `pages/pro/game.tsx` keeps a
   *  registry of fighter elements (`fighterEls`) that the damage-arc layer reads
   *  to find where a hit landed on screen; without it an arc has no token to fly
   *  to, which is why combat arcs did nothing in this view. Deliberately the
   *  root and not the billboard: the root sits at the piece's FEET, which is the
   *  same anchor point the flat board registers. */
  innerRef?: (el: HTMLElement | null) => void;
  x: number;
  y: number;
  tiltDeg: number;
  widthPx: number;
  heightPx: number;
  /** The SPACE's own rendered token diameter (px) — the same number
   *  `TableSpace` sizes its own disc from (see TableBoard.tsx's `diamPx`).
   *  The base disc and its contact shadow are both derived from THIS, not
   *  from `widthPx`/`heightPx` (the FIGURE's own plate size), which is what
   *  keeps the base concentric with, and sized to, the space underneath it
   *  regardless of how wide any given piece's own plate/token happens to be
   *  (phase-5 target #2 — see tableProjection.ts's header). */
  spaceDiamPx: number;
  /** The id of the space this piece's base actually sits on (the fighter's
   *  own `space`/`tailSpace`, or a board object's `space`) — tagged onto the
   *  base disc as `data-space-id` alongside `data-fighter-base` so
   *  `scripts/visual-probe/tableBoard.cjs` can pair a piece's base with the
   *  space underneath it and measure concentricity as a real number instead
   *  of a screenshot impression (phase-5 target #2). Optional only because
   *  TypeScript's `SpaceId` can be `null` on the wire (an off-board token);
   *  omitting it just means this one piece is left out of that measurement. */
  spaceId?: string | null;
  /** Rim color for the in-plane base disc — a player's own token color reads
   *  as "whose piece is this" even before the figure billboards into view.
   *  Defaults to a neutral parchment tone for pieces with no owner color
   *  (board objects, some sidekick contexts). */
  baseAccent?: string;
  /** Draw the in-plane base disc (default). Off for a figure that stands
   *  BETWEEN two spaces — each of those spaces carries its own base, drawn by
   *  a separate anchor, so both stay concentric with the space under them. */
  base?: boolean;
  /** Content that lies IN the board plane at the piece's feet, drawn over the
   *  base and under the billboard: the front of a miniature's own base, or a
   *  flat token. Its origin is the feet point, in unscaled px — it gets the
   *  billboard's depth scale, so both halves of a figure stay the same size. */
  ground?: ReactNode;
  /** A just-committed move to tween through instead of snapping straight to
   *  (x, y) — deferred-item "pendingMove tweening" from the phase-2 report.
   *  Absent/null = static placement, byte-identical to before. */
  anim?: TableAnchorAnim | null;
  /** Fired once the tween settles — mirrors ProBoard's own
   *  `onAnimationComplete` contract so the caller can clear its pendingMove
   *  state the same way for either board. */
  onAnimComplete?: () => void;
  /** Marks this piece as a live pick for the auto-focus-zoom effect
   *  (TableStage) — the SAME `[data-pick]` convention ProBoard's fighter
   *  tokens use. Phase-2 fault #4. */
  pick?: boolean;
  /** Takes no pointer events at all — a preview ghost that must let a tap
   *  through to the gold step highlight underneath it. */
  inert?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title?: string;
  "data-fighter-id"?: string;
  /** This piece is one of several sharing a space (lib/pro/tokenStack): it is
   *  drawn off-centre at (x, y), but sorts and depth-scales as if it stood at
   *  the SPACE's own centre, tie-broken by the stack's `order` — so the big
   *  body sits behind the smalls on it, as on the flat board, instead of a
   *  ring slot at 12 o'clock sliding under it by painter's order. */
  stack?: TableStackDepth;
  children: ReactNode;
}

export interface TableStackDepth {
  /** The space centre's normalized y — what depth is measured from. */
  depthY: number;
  /** The stack slot's render order (ascending = nearer the viewer). */
  order: number;
  /** How far the piece's ground layer (its flat token) rises off the board,
   *  px. The board plane is `preserve-3d`, so the browser orders flat tokens
   *  by their real height, NOT by z-index: a small ringed onto a full-size
   *  token's rim sat under that token's thicker top face and vanished. Lifted
   *  by the thickness of what it stands on, it lies ON the body, as it would
   *  on a real table. */
  liftPx: number;
}

export const TableStandeeAnchor = ({
  x,
  y,
  tiltDeg,
  widthPx,
  heightPx,
  spaceDiamPx,
  spaceId,
  baseAccent = "rgba(250, 240, 222, 0.55)",
  base = true,
  ground,
  anim = null,
  onAnimComplete,
  pick = false,
  inert = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  title,
  innerRef,
  stack,
  children,
  ...rest
}: TableStandeeAnchorProps) => {
  const placement = placeStandee(stack ? stack.depthY : y, tiltDeg);
  const zIndex = placement.zIndex + (stack?.order ?? 0);
  // A PLAIN CIRCLE, sized off the space's own diameter — exactly how
  // `TableSpace` draws its own disc. The ambient `rotateX` on the shared
  // ancestor stage plane foreshortens this into the correctly-proportioned
  // ellipse "for free" (see tableProjection.ts's header comment on this same
  // effect), so — unlike the pre-phase-5 version — nothing here pre-squashes
  // it: a manual squash would double up with that ambient foreshortening and
  // produce the wrong shape, which is exactly what made the base disagree
  // with the space ellipse it should read as sitting inside.
  const baseDiamPx = standeeBaseDiameterPx(spaceDiamPx);

  // Contact shadow (phase-5 target #3): ONE fixed direction, applied as a
  // fraction of the base's OWN diameter so it scales with the piece the way
  // everything else here does, then stretched (both farther AND softer) the
  // deeper into the board a piece stands — see `standeeShadowStretch`'s own
  // comment on why this is a deliberate atmospheric cue rather than a
  // physically exact one.
  const shadowStretch = standeeShadowStretch(y);
  const shadowDiamPx = baseDiamPx * 0.92;
  const shadowOffsetXPx = baseDiamPx * SHADOW_OFFSET_X * shadowStretch;
  const shadowOffsetYPx = baseDiamPx * SHADOW_OFFSET_Y * shadowStretch;
  // The gradient's own inner/outer split softens as `shadowStretch` grows —
  // a lower peak alpha and a wider low-alpha ring read as "softer-edged" at
  // no extra paint cost over the sharper near-edge version, since both are
  // the same single `radial-gradient` fill (never a `filter: blur()` — see
  // this file's own header comment on why that matters on a phone with many
  // standees on screen at once).
  const shadowPeakAlpha = 0.5 / shadowStretch;
  const shadowGradient = `radial-gradient(ellipse, rgba(0,0,0,${shadowPeakAlpha.toFixed(3)}) 0%, rgba(0,0,0,${(shadowPeakAlpha * 0.45).toFixed(3)}) 55%, rgba(0,0,0,0) 100%)`;

  const steps = anim ? anim.xs.length : 1;
  const animate = anim
    ? {
        left: anim.xs.map((v) => `${v * 100}%`),
        top: anim.ys.map((v) => `${v * 100}%`),
        ...(anim.opacity ? { opacity: anim.opacity } : {}),
      }
    : { left: `${x * 100}%`, top: `${y * 100}%` };
  const times = anim?.times ?? (steps > 1 ? Array.from({ length: steps }, (_, i) => i / (steps - 1)) : undefined);

  return (
    <MotionBox
      position="absolute"
      w={`${widthPx}px`}
      h={`${heightPx}px`}
      // `initial={false}`: like ProBoard's MotionFlex, a move starting
      // mid-render is an ANIMATE UPDATE on the already-mounted node, not a
      // fresh mount — framer-motion only plays keyframes on updates.
      initial={false}
      animate={animate}
      transition={{ duration: anim ? anim.durationSec : 0, ease: "easeInOut", times } as never}
      onAnimationComplete={anim ? onAnimComplete : undefined}
      style={{ transform: "translate(-50%, -100%)", transformStyle: "preserve-3d" }}
      zIndex={zIndex}
      cursor={onClick ? "pointer" : undefined}
      pointerEvents={inert ? "none" : undefined}
      title={title}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-pick={pick ? "" : undefined}
      ref={innerRef}
      {...rest}
    >
      {/* Contact shadow — flat, in-plane, foreshortened by the SAME ancestor
          tilt as a space's disc, never counter-rotated. Centered on the SAME
          anchor point as the base below (bottom:0 + translate(-50%,+50%) —
          see the base's own comment for why that combination lands exactly
          on-center), then nudged by the fixed `SHADOW_OFFSET_X/Y` vector so
          it reads as light falling from one consistent direction rather than
          sitting dead-center under the figure — the SAME offset for every
          standee on the board (phase-3 "contact shadow" requirement; the
          offset itself and its distance-based stretch are phase-5 target
          #3 — see tableProjection.ts's header). */}
      <Box
        position="absolute"
        bottom="0"
        left="50%"
        w={`${shadowDiamPx}px`}
        h={`${shadowDiamPx}px`}
        style={{ transform: `translate(calc(-50% + ${shadowOffsetXPx.toFixed(2)}px), calc(50% + ${shadowOffsetYPx.toFixed(2)}px))` }}
        borderRadius="50%"
        bg={shadowGradient}
        pointerEvents="none"
      />
      {/* The standee BASE — a flat plastic-disc stand-in, IN the board plane
          (no counter-rotation), which is exactly what makes the figure above
          it read as "standing on the table" rather than "floating card".
          Phase-3: this used to be the ONLY thing carrying the owner's color
          (a thin 1.5px rim easily lost against a similarly-colored zone
          tint) — the figure's own hard border is gone now (see
          TableFighterStandee), so the rim here is thicker and paired with a
          dark outer ring that reads regardless of what's under it, making
          the base — not a border around the whole plate — the one and only
          place ownership shows.
          `bottom:0` puts the disc's OWN bottom edge at the anchor's bottom
          edge (the (x,y) point every other piece here is placed at);
          `translate(-50%, +50%)` then centers it exactly ON that point (the
          Y half shifts it down by half of the disc's OWN height, same
          convention `TableSpace` uses via `translate(-50%,-50%)` off a
          top/left-positioned box) — phase-5 target #2's concentricity fix:
          zero hand-tuned offset, so nothing can push the base off-center
          from the space it stands on again. */}
      {base && (
        <Box
          position="absolute"
          bottom="0"
          left="50%"
          w={`${baseDiamPx}px`}
          h={`${baseDiamPx}px`}
          style={{ transform: "translate(-50%, 50%)" }}
          borderRadius="50%"
          bg="radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.28) 0%, rgba(20,10,24,0.82) 65%, rgba(8,4,10,0.95) 100%)"
          border={`2.5px solid ${baseAccent}`}
          boxShadow={`0 0 0 1px rgba(0,0,0,0.75), 0 2px 5px rgba(0,0,0,0.7)`}
          pointerEvents="none"
          data-fighter-base=""
          data-space-id={spaceId ?? undefined}
        />
      )}
      {/* The ground layer: flat on the board like the base, but in front of it.
          A zero-size box at the feet (the anchor's bottom centre) so whatever
          lies here positions itself from that point. `preserve-3d` lets a
          flat token lift off the board with translateZ. */}
      {ground && (
        <Box
          position="absolute"
          left="50%"
          top="100%"
          w={0}
          h={0}
          pointerEvents="none"
          style={{
            transform: `${stack?.liftPx ? `translateZ(${stack.liftPx}px) ` : ""}scale(${placement.scale})`,
            transformOrigin: "0 0",
            transformStyle: "preserve-3d",
          }}
          data-standee-ground=""
        >
          {ground}
        </Box>
      )}
      {/* The billboard: counter-rotated about its own feet so it stands
          upright and faces the camera regardless of the board's tilt. */}
      {/* On a SHARED space the upright plate (transparent but for its
          badges) stands up through the ring slots behind it and would
          swallow a click meant for the piece lying there, so it lets the
          pointer through; the flat token and the root still take the tap. */}
      <Box
        position="relative"
        w="100%"
        h="100%"
        pointerEvents={stack ? "none" : undefined}
        data-stacked-plate={stack ? "" : undefined}
        style={{ transform: placement.transform, transformOrigin: "50% 100%" }}
      >
        {children}
      </Box>
    </MotionBox>
  );
};

/** Re-exported for callers (TableBoard) that need to hand-roll the same
 *  "cancel the board's tilt" transform outside a full anchor — e.g. a
 *  two-space band's midpoint label, which billboards but doesn't stand on a
 *  base the way a figure does. */
export const tableBillboardTransform = standeeTransform;
