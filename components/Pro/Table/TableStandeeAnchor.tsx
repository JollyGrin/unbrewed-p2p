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
 * underneath it. It is now sized wider than the figure's silhouette (each
 * caller passes its own `shadowWidthFactor`, tuned against its own
 * silhouette's footprint) and its rim/outer-ring contrast is bumped, so the
 * base — never the figure — is the one place a piece's owner-color reads.
 */
import { ReactNode } from "react";
import { Box, chakra, shouldForwardProp } from "@chakra-ui/react";
import { isValidMotionProp, motion } from "framer-motion";
import { placeStandee, standeeTransform } from "@/lib/pro/tableProjection";

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
}

export interface TableStandeeAnchorProps {
  x: number;
  y: number;
  tiltDeg: number;
  widthPx: number;
  heightPx: number;
  /** Fraction of `widthPx` the base disc + contact shadow span — a standee's
   *  footprint reads best a little narrower than the figure standing on it. */
  shadowWidthFactor?: number;
  /** Rim color for the in-plane base disc — a player's own token color reads
   *  as "whose piece is this" even before the figure billboards into view.
   *  Defaults to a neutral parchment tone for pieces with no owner color
   *  (board objects, some sidekick contexts). */
  baseAccent?: string;
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
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title?: string;
  "data-fighter-id"?: string;
  children: ReactNode;
}

export const TableStandeeAnchor = ({
  x,
  y,
  tiltDeg,
  widthPx,
  heightPx,
  shadowWidthFactor = 0.7,
  baseAccent = "rgba(250, 240, 222, 0.55)",
  anim = null,
  onAnimComplete,
  pick = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  title,
  children,
  ...rest
}: TableStandeeAnchorProps) => {
  const placement = placeStandee(y, tiltDeg);
  const baseW = widthPx * shadowWidthFactor;
  // A standee's base reads as an ELLIPSE lying flat, not a circle — same
  // foreshortening a space's own disc gets from the ambient tilt (see the
  // header comment), so no extra maths: a shape roughly 0.4× as tall as it is
  // wide looks right across the whole tilt range this feature supports.
  const baseH = baseW * 0.4;

  const steps = anim ? anim.xs.length : 1;
  const animate = anim
    ? {
        left: anim.xs.map((v) => `${v * 100}%`),
        top: anim.ys.map((v) => `${v * 100}%`),
      }
    : { left: `${x * 100}%`, top: `${y * 100}%` };
  const times = steps > 1 ? Array.from({ length: steps }, (_, i) => i / (steps - 1)) : undefined;

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
      zIndex={placement.zIndex}
      cursor={onClick ? "pointer" : undefined}
      title={title}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-pick={pick ? "" : undefined}
      {...rest}
    >
      {/* Contact shadow — flat, in-plane, foreshortened by the SAME ancestor
          tilt as a space's disc, never counter-rotated. Offset further "away"
          (down-board) than the base disc itself so it reads as light falling
          from up-board rather than sitting dead-center under the figure —
          the SAME offset direction for every standee on the board, so the
          whole scene reads as one consistent light source rather than a
          per-piece special effect (phase-3 "contact shadow" requirement). */}
      <Box
        position="absolute"
        bottom="-11%"
        left="50%"
        w={`${baseW}px`}
        h={`${baseH * 0.85}px`}
        style={{ transform: "translate(-50%, 0)" }}
        borderRadius="50%"
        bg="rgba(0,0,0,0.55)"
        filter="blur(3px)"
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
          place ownership shows. */}
      <Box
        position="absolute"
        bottom="-6%"
        left="50%"
        w={`${baseW}px`}
        h={`${baseH}px`}
        style={{ transform: "translate(-50%, 0)" }}
        borderRadius="50%"
        bg="radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.28) 0%, rgba(20,10,24,0.82) 65%, rgba(8,4,10,0.95) 100%)"
        border={`2.5px solid ${baseAccent}`}
        boxShadow={`0 0 0 1px rgba(0,0,0,0.75), 0 2px 5px rgba(0,0,0,0.7)`}
        pointerEvents="none"
      />
      {/* The billboard: counter-rotated about its own feet so it stands
          upright and faces the camera regardless of the board's tilt. */}
      <Box
        position="relative"
        w="100%"
        h="100%"
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
