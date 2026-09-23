/**
 * The tabletop view's camera rig: perspective + tilt, composed with the SAME
 * pinch/zoom/pan the flat board uses (`useZoomPan`), plus the board's ground
 * image and a "reset view" control matching ProBoard's own.
 *
 * HOW THE 3D COMPOSES WITH PAN/ZOOM. `useZoomPan` was written to drive a plain
 * 2D `translate()/scale()` on one element (`frameRef`) and to measure that same
 * element's `getBoundingClientRect()` to anchor a pinch under the fingers. A 3D
 * `rotateX` on THAT element would turn its rendered box into a foreshortened
 * trapezoid, and the hook's anchor math (which assumes a plain affine box)
 * would zoom around the wrong point. So the tilt never touches `frameRef`: it
 * lands on a CHILD, `stagePlane` below, that fills `frameRef` via
 * `position: absolute; inset: 0`. `frameRef` keeps carrying only
 * `zoom.transform` — byte-identical to how ProBoard drives it — so every
 * distance/anchor computation inside useZoomPan is exactly as valid here as on
 * the flat board; the 3D tilt is purely something `frameRef`'s content does
 * AFTER useZoomPan has already placed and scaled the frame. `offsetWidth` /
 * `offsetHeight` (what `computeFit` measures) are LAYOUT sizes and are
 * unaffected by any transform on an element or its descendants, so the tilt
 * changes nothing about how big the board is judged to be for fit/pan/zoom.
 *
 * `frameRef` gets its LAYOUT size from a normal, untransformed, invisible
 * `<img>` — exactly the sizing trick ProBoard's own frame uses, just marked
 * `visibility: hidden` because the VISIBLE ground art is a second copy of the
 * same image drawn inside the tilted stage (browsers dedupe the request from
 * cache, so this costs no extra network fetch).
 */
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Box, Button } from "@chakra-ui/react";
import { useReducedMotion } from "framer-motion";
import { useZoomPan, ZoomPanInset } from "@/lib/pro/useZoomPan";
import { pickTapSizePx, tableFocusBox } from "@/lib/pro/tableFocus";
import { ContentBox, contentBoxFromRects } from "@/lib/pro/fitContent";
import { useCoarsePointer } from "@/lib/pro/useCoarsePointer";
import {
  DEFAULT_TILT_DEG,
  TABLE_YAW_DEG,
  boardTransform,
  perspectivePx,
  tableFocusCapDiameterPx,
} from "@/lib/pro/tableProjection";
import { TableBoardEdge } from "./TableBoardEdge";
import { TableBoardLight, TableSurface } from "./TableSurface";

/** What a `TableStage` child render-prop needs to place content correctly:
 *  the frame's LAYOUT (pre-zoom) pixel size, for sizing anything that must
 *  render as a true, undistorted circle regardless of the board image's own
 *  aspect ratio (see the note on `TableSpace`). */
export interface TableStageMetrics {
  frameW: number;
  frameH: number;
  tiltDeg: number;
}

export interface TableStageProps {
  imageUrl: string;
  imageAlt: string;
  imgMaxH?: string;
  zoomable?: boolean;
  rotated?: boolean;
  fitInset?: ZoomPanInset;
  tiltDeg?: number;
  /** Fault #4 (phase-2 report — "the board sits small in a large empty
   *  field"): a string that changes whenever the set of currently-pickable
   *  spaces/fighters changes, so the auto-focus-zoom effect below knows when
   *  to re-measure. Mirrors ProBoard's own `pickKey` (built from the same
   *  highlighted/relocate/targetable lists) — TableBoard builds it because
   *  TableStage, generic over its children, has no idea what a "space" or
   *  "fighter" even is; it only knows how to scan for `[data-pick]`. Omitted
   *  = the effect still runs once on mount/resize but never re-triggers on a
   *  prompt change (acceptable for a caller with no picks, e.g. a
   *  read-only board preview). */
  pickKey?: string;
  /** Where "reset view" stands, when the default spot (the fit inset's
   *  bottom-left corner) is taken — the tabletop HUD's side buttons are there. */
  resetViewSpot?: { left: string; bottom: string };
  children: (metrics: TableStageMetrics) => ReactNode;
}

export const TableStage = ({
  imageUrl,
  imageAlt,
  imgMaxH,
  zoomable = false,
  rotated = false,
  fitInset,
  tiltDeg = DEFAULT_TILT_DEG,
  pickKey,
  resetViewSpot,
  children,
}: TableStageProps) => {
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Same measuring pattern as ProBoard's own frameW/frameH (issue #613's cosmetic
  // rim gate): LAYOUT px, read before the zoom transform, so table content can
  // convert the map's normalized x/y into true on-screen-shaped px regardless of
  // the board image's own aspect ratio (see TableSpace's header comment).
  //
  // Measured BEFORE `useZoomPan` is called (not after, as before phase 5) so
  // `frameW` is available to size the extra fit-inset below — see
  // `effectiveFitInset`'s own comment for why the fit itself now needs it.
  const [frameW, setFrameW] = useState(0);
  const [frameH, setFrameH] = useState(0);
  useEffect(() => {
    const f = frameRef.current;
    if (!f || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      setFrameW((prev) => (prev === f.offsetWidth ? prev : f.offsetWidth));
      setFrameH((prev) => (prev === f.offsetHeight ? prev : f.offsetHeight));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(f);
    return () => ro.disconnect();
  }, []);

  const coarsePointer = useCoarsePointer();
  // Camera life (phase-5 target #5 — see tableProjection.ts's header). A
  // static yaw, not an animation, so there is nothing here for
  // `prefers-reduced-motion` to interrupt mid-transition — but the brief is
  // explicit that the WHOLE effect (not just a future drag-parallax) should
  // be absent for a player who has asked for reduced motion, so it is gated
  // the same way the pendingMove tween is in TableBoard.tsx.
  const reducedMotion = !!useReducedMotion();
  const yawDeg = reducedMotion ? 0 : TABLE_YAW_DEG;

  // Fit what the board DRAWS, not its flat layout box (see
  // lib/pro/fitContent). Tipped back ~48°, the plane is drawn at about two
  // thirds of its layout height, so fitting the layout box scaled the board
  // down for height it never uses. The extruded edge hangs below the plane,
  // so it is part of the drawn box too — which is what replaced the old
  // hand-tuned bottom reserve for it. Pieces are deliberately NOT measured:
  // the resting fit must not shift every time a standee's head moves.
  //
  // `frameW`/`tiltDeg` are deps only so a resize or a tilt change hands the
  // hook a new callback and it re-fits; the body reads the live DOM.
  const measureContent = useCallback((): ContentBox | null => {
    const frame = frameRef.current;
    if (!frame || !frameW) return null;
    const drawn = Array.from(
      frame.querySelectorAll<HTMLElement>("[data-table-stage-plane], [data-table-board-edge]")
    ).map((el) => el.getBoundingClientRect());
    const layoutW = rotated && zoomable ? frame.offsetHeight : frame.offsetWidth;
    return contentBoxFromRects(frame.getBoundingClientRect(), layoutW, drawn);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frameW/tiltDeg/yawDeg stand in for "the drawing changed"
  }, [frameW, frameH, tiltDeg, yawDeg, rotated, zoomable]);
  const zoom = useZoomPan(zoomable, frameRef, fitInset, zoomable && rotated, measureContent);

  // Same mobile auto-focus-zoom ProBoard runs (issue #831): with nothing to
  // pick, a whole-board fit is correct — but the instant a prompt offers gold
  // spaces or targetable fighters, ProBoard zooms onto exactly those, and
  // this view never did (phase 1 simply didn't wire it — TableStage didn't
  // exist to be wired). That gap is most of what fault #4 actually was: the
  // "small board in a big empty field" screenshot was taken mid-prompt, where
  // the flat board would already be zoomed in.
  //
  // GATED ON `frameW`: this view mounts FRESH the instant a player switches
  // to it (unlike ProBoard, which is usually already mounted long before any
  // prompt appears), so on the very FIRST paint `useZoomPan`'s own initial
  // fit (a separate ResizeObserver on the same element) has not necessarily
  // landed yet — measuring picks against that stale/default zoom state
  // produced a wildly wrong focus (confirmed by instrumenting the real
  // values: the frame measured ~300px above the viewport). `frameW` is 0
  // until THIS component's own ResizeObserver has fired at least once, which
  // in practice means the sibling zoom-fit observer has had its chance too —
  // so gating on it, and re-running once it flips, sidesteps the race
  // without needing to reach into useZoomPan's internals.
  //
  // PHASE 3 FAULT #2 — this used to hand `focusOn` a single diameter (the
  // SMALLEST pick's), copying ProBoard's own call verbatim. On a FLAT board
  // every pick renders roughly the same size, so that number is a fine proxy
  // for "how far should we zoom". On THIS tilted board a far-rank pick can
  // render a third the size of a near-rank one on the very same prompt (see
  // tableProjection.ts's file header) — driving the zoom ceiling off the
  // smallest pick in a mixed near/far set tries to enlarge the far one past
  // comfortable, which blows the near pick, and the board itself, off the
  // screen (measured: far-rank spaces landing at `cy: -111` on a 390px-tall
  // viewport). `pickDiameterPx` (smallest) still decides WHETHER to zoom —
  // any pick under the touch minimum should still trigger a focus — but
  // `capDiameterPx` (largest, floored so an all-small pick set can't repeat
  // the same failure) now decides how FAR, via useZoomPan's own new,
  // opt-in `capDiameterPx` parameter.
  const { focusOn, releaseFocus } = zoom;
  useEffect(() => {
    if (!zoomable || !coarsePointer || !frameW) return;
    const raf = requestAnimationFrame(() => {
      const frame = frameRef.current;
      const boxesOf = (selector: string) =>
        Array.from(frame?.querySelectorAll<HTMLElement>(selector) ?? []).map((el) => el.getBoundingClientRect());
      const rects = boxesOf("[data-pick]").filter((r) => r.width > 0);
      // Picks PLUS every fighter — see lib/pro/tableFocus for why a pick-only
      // frame hid the opponent under the landscape rail.
      const box = tableFocusBox(rects, boxesOf("[data-fighter-id]"));
      if (!box) {
        releaseFocus();
        return;
      }
      // Tap size by area (see pickTapSizePx): a foreshortened ellipse's short
      // side undersells it and zoomed the board for picks that were fine.
      const diameters = rects.map(pickTapSizePx);
      focusOn(box, Math.min(...diameters), tableFocusCapDiameterPx(Math.max(...diameters)));
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pickKey stands in for the picks list itself
  }, [pickKey, zoomable, coarsePointer, frameW, focusOn, releaseFocus]);

  return (
    <Box
      ref={zoom.containerRef}
      maxW="100%"
      w={zoomable ? "100%" : undefined}
      h={zoomable ? "100%" : undefined}
      position={zoomable ? "relative" : undefined}
      overflow={zoomable ? "hidden" : undefined}
      sx={zoomable ? { touchAction: "none", cursor: "grab" } : undefined}
      // The table surface (phase-5 target #4 — "the surround is flat dead
      // colour"). A flat void around the board reads as "unfinished"; a
      // soft, warm vignette reads as "the rest of the table the board is
      // resting on" instead — cheap, GPU-composited (a background-image,
      // nothing to animate) and deliberately DESATURATED/darker than
      // anything on the board itself, so the eye still goes to the map, not
      // the surface it sits on. Warmer (wood/felt-adjacent) than the app's
      // own brand-purple chrome around it, specifically so the table reads
      // as a distinct surface rather than a continuation of the UI
      // background. Unconditional now (used to be `zoomable`-only, phase-2)
      // — the non-zoomable/inset context wants the same grounding cue, and
      // this is a background-image on an otherwise-plain Box either way, so
      // there is no zoomable-only layout reason to withhold it.
      bg="radial-gradient(ellipse 72% 62% at 50% 45%, rgba(64,44,30,0.28) 0%, rgba(38,24,18,0.5) 60%, rgba(16,10,9,0.72) 100%)"
      {...zoom.handlers}
    >
      <Box
        ref={frameRef}
        position={zoomable ? "absolute" : "relative"}
        top={zoomable ? 0 : undefined}
        left={zoomable ? 0 : undefined}
        w="fit-content"
        maxW="100%"
        mx={zoomable ? undefined : "auto"}
        userSelect="none"
        transform={zoom.transform}
        transformOrigin={zoom.transformOrigin}
        transition={zoom.transition}
        sx={zoom.transition ? { "@media (prefers-reduced-motion: reduce)": { transition: "none" } } : undefined}
      >
        {/* Sizing spacer only — establishes the frame's fit-content box from the
            image's intrinsic size, exactly like ProBoard's own <img>. Never
            painted: the visible ground art is the tilted copy below. */}
        <Box
          as="img"
          src={imageUrl}
          alt=""
          aria-hidden
          maxW="100%"
          maxH={imgMaxH}
          display="block"
          visibility="hidden"
          draggable={false}
        />

        {/* The camera rig. `perspective` lives on this wrapper (a CSS property,
            not a transform — it never rotates itself), so `stagePlane`, one
            level in, is what recedes. */}
        <Box
          position="absolute"
          inset={0}
          style={{ perspective: `${perspectivePx(frameW || 1)}px` }}
        >
          <Box
            data-table-stage-plane
            position="relative"
            w="100%"
            h="100%"
            style={{ transform: boardTransform(tiltDeg, yawDeg), transformStyle: "preserve-3d" }}
          >
            {/* The table the board stands on — behind and below everything
                in this plane (see TableSurface.tsx). */}
            <TableSurface frameW={frameW} />
            <Box
              as="img"
              src={imageUrl}
              alt={imageAlt}
              position="absolute"
              inset={0}
              w="100%"
              h="100%"
              draggable={false}
              borderRadius="0.5rem"
              sx={{ objectFit: "fill" }}
            />
            <TableBoardLight />
            {/* The board's own thickness (phase-5 target #1) — a real side
                face extruded from the board's near edge, sharing this same
                `preserve-3d` frame and tilt/yaw so it tilts as one rigid
                object with the board it is attached to. See
                TableBoardEdge.tsx's own header for how the extrusion works. */}
            <TableBoardEdge frameW={frameW} frameH={frameH} />
            {children({ frameW, frameH, tiltDeg })}
          </Box>
        </Box>
      </Box>

      {/* "reset view" — same placement/behaviour as ProBoard's, so a player
          switching between flat and tabletop finds it in the same spot. */}
      {zoom.active && (
        <Button
          size="xs"
          position="absolute"
          bottom={resetViewSpot?.bottom ?? `${(fitInset?.bottom ?? 0) + 8}px`}
          left={resetViewSpot?.left ?? `${(fitInset?.left ?? 0) + 8}px`}
          zIndex={8}
          bg="whiteAlpha.300"
          color="brand.parchment"
          _hover={{ bg: "whiteAlpha.500" }}
          onClick={zoom.reset}
        >
          reset view
        </Button>
      )}
    </Box>
  );
};
