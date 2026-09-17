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
import { ReactNode, useEffect, useRef, useState } from "react";
import { Box, Button } from "@chakra-ui/react";
import { useZoomPan, ZoomPanInset } from "@/lib/pro/useZoomPan";
import { useCoarsePointer } from "@/lib/pro/useCoarsePointer";
import { DEFAULT_TILT_DEG, boardTransform, perspectivePx, tableFocusCapDiameterPx } from "@/lib/pro/tableProjection";

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
  children,
}: TableStageProps) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const zoom = useZoomPan(zoomable, frameRef, fitInset, zoomable && rotated);
  const coarsePointer = useCoarsePointer();

  // Same measuring pattern as ProBoard's own frameW/frameH (issue #613's cosmetic
  // rim gate): LAYOUT px, read before the zoom transform, so table content can
  // convert the map's normalized x/y into true on-screen-shaped px regardless of
  // the board image's own aspect ratio (see TableSpace's header comment).
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
      const picks = Array.from(frame?.querySelectorAll<HTMLElement>("[data-pick]") ?? []);
      if (picks.length === 0) {
        releaseFocus();
        return;
      }
      const rects = picks.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
      if (rects.length === 0) {
        releaseFocus();
        return;
      }
      const diameters = rects.map((r) => Math.min(r.width, r.height));
      focusOn(
        {
          left: Math.min(...rects.map((r) => r.left)),
          top: Math.min(...rects.map((r) => r.top)),
          right: Math.max(...rects.map((r) => r.right)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
        },
        Math.min(...diameters),
        tableFocusCapDiameterPx(Math.max(...diameters))
      );
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
      // Fault #4, second half: even auto-focused, the frame the board sits in
      // is bigger than the board's own bounding box (aspect ratio, insets for
      // the fixed HUD). A flat void there reads as "unfinished"; a soft
      // radial vignette reads as "the rest of the table" instead — cheap,
      // GPU-composited (a background-image, nothing to animate), and never
      // competes with the board art itself for attention.
      bg={
        zoomable
          ? "radial-gradient(ellipse 70% 60% at 50% 45%, rgba(58,28,54,0.35) 0%, rgba(20,8,22,0.55) 70%, rgba(10,4,12,0.75) 100%)"
          : undefined
      }
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
            style={{ transform: boardTransform(tiltDeg), transformStyle: "preserve-3d" }}
          >
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
          bottom={`${(fitInset?.bottom ?? 0) + 8}px`}
          left={`${(fitInset?.left ?? 0) + 8}px`}
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
