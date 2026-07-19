/**
 * Pinch/scroll zoom + drag pan for the Pro board (issue #120; the board fills
 * the viewport as of #450).
 *
 * The transform lives on ProBoard's shrink-wrap box — the `w:fit-content`
 * frame that holds the map image AND every %-positioned overlay (hit-circles,
 * tokens, fighters, FX). Scaling/translating that one box moves the art and all
 * overlays as a single unit, so nothing drifts, and the browser hit-tests the
 * transformed geometry — element identity is unchanged, so an identity-based
 * `onSpaceClick(id)` / `onFighterClick(id)` still lands the same action at any
 * zoom or pan (no screen-coordinate math anywhere here).
 *
 * Zero footprint when `enabled` is false: no wheel/pointer listeners are
 * attached, `transform` is `undefined` (not even an identity transform), and
 * the state is held at rest — the board renders exactly as it does today.
 */
import {
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;

// wheel deltaY -> multiplicative scale step (exp keeps zoom feel even across
// devices; small constant = gentle). Trackpad pinch arrives as ctrl+wheel and
// flows through the same path, so pinch and scroll both zoom to the cursor.
const WHEEL_ZOOM_SPEED = 0.0015;
// px of pointer travel before a press becomes a pan — below this it stays a
// click, so tapping a highlighted space still fires its action untouched.
const PAN_THRESHOLD = 4;
// Fraction of the board that must stay inside the viewport while panning, so a
// mis-drag can never strand it off-screen (issue #450). Capped at the viewport
// size too, or a board zoomed larger than the screen would be unpannable.
const MIN_VISIBLE = 0.25;

interface ZoomPanState {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: ZoomPanState = { scale: 1, tx: 0, ty: 0 };

/** Insets (px) of the region NOT covered by the fixed overlays — HUD band on
 *  top, decision dock on the right, hand along the bottom. The initial fit
 *  centers the board inside what's left. */
export interface ZoomPanInset {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

const clampScale = (s: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

const same = (a: ZoomPanState, b: ZoomPanState) =>
  Math.abs(a.scale - b.scale) < 1e-3 && Math.abs(a.tx - b.tx) < 0.5 && Math.abs(a.ty - b.ty) < 0.5;

/** Clamp one axis so `span` px of board keeps `MIN_VISIBLE` of itself (or the
 *  whole viewport, whichever is smaller) overlapping [0, viewport]. */
const clampAxis = (t: number, span: number, viewport: number): number => {
  if (!span || !viewport) return t;
  const keep = Math.min(span * MIN_VISIBLE, viewport);
  return Math.min(viewport - keep, Math.max(keep - span, t));
};

// A region inset panel (Baba Yaga's Hut) is a child of the board container but
// its own interactive surface — dragging its header, tapping its collapse
// caret, or scrolling over it must not also pan/zoom the board (issue #216).
// The panel root carries a `data-region-panel` marker; any gesture whose target
// sits inside it is left alone here.
const insideRegionPanel = (target: EventTarget | null): boolean =>
  target instanceof Element && !!target.closest("[data-region-panel]");

export interface ZoomPan {
  /** attach to the OUTER container — the wheel/pointer target + measuring box */
  containerRef: RefObject<HTMLDivElement>;
  /** put on the shrink-wrap frame; `undefined` when disabled (no transform at all) */
  transform: string | undefined;
  transformOrigin: string | undefined;
  /** pointer/click handlers for the outer container (empty object when disabled) */
  handlers: {
    onPointerDown?: (e: ReactPointerEvent) => void;
    onClickCapture?: (e: ReactMouseEvent) => void;
  };
  /** true once zoomed or panned away from the fit view — gate the reset control on it */
  active: boolean;
  /** snap back to the computed initial fit */
  reset: () => void;
}

/**
 * @param enabled  master switch (the `zoomMap` flag) — false = inert
 * @param frameRef ref to the transformed shrink-wrap frame; its live rect is
 *                 what keeps zoom anchored under the cursor as scale changes
 * @param inset    px of the container hidden behind the fixed overlays; the
 *                 initial fit centers the board in the remaining region
 */
export function useZoomPan(
  enabled: boolean,
  frameRef: RefObject<HTMLElement>,
  inset: ZoomPanInset = {}
): ZoomPan {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ZoomPanState>(IDENTITY);
  // The transform the board loads at and "reset view" returns to. Recomputed
  // whenever the container or the (layout-size) frame changes — including the
  // map image finishing its load, which is what first gives the frame a height.
  const [fit, setFit] = useState<ZoomPanState>(IDENTITY);
  // Set by any user gesture: until then the board keeps re-fitting on resize,
  // after it we leave the player's view alone.
  const touched = useRef(false);

  const { top = 0, right = 0, bottom = 0, left = 0 } = inset;

  const computeFit = useCallback((): ZoomPanState | null => {
    const c = containerRef.current;
    const f = frameRef.current;
    if (!c || !f) return null;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    // offsetWidth/Height are LAYOUT sizes — unaffected by the transform we're
    // about to replace, so this is stable to run at any current zoom.
    const fw = f.offsetWidth;
    const fh = f.offsetHeight;
    if (!cw || !ch || !fw || !fh) return null;
    const availW = Math.max(cw - left - right, 1);
    const availH = Math.max(ch - top - bottom, 1);
    const scale = clampScale(Math.min(availW / fw, availH / fh));
    return {
      scale,
      tx: left + (availW - fw * scale) / 2,
      ty: top + (availH - fh * scale) / 2,
    };
  }, [frameRef, top, right, bottom, left]);

  // Re-fit on any size change of the viewport box or the board frame. While the
  // player hasn't touched the view, the board follows along; once they have, we
  // only refresh what "reset view" will restore.
  useEffect(() => {
    if (!enabled) return;
    const c = containerRef.current;
    const f = frameRef.current;
    if (!c || !f || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const next = computeFit();
      if (!next) return;
      setFit((prev) => (same(prev, next) ? prev : next));
      if (!touched.current) setState((prev) => (same(prev, next) ? prev : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(c);
    ro.observe(f);
    return () => ro.disconnect();
  }, [enabled, frameRef, computeFit]);

  // Zoom keeping the frame-local point under (clientX, clientY) fixed. The
  // frame's CURRENT rect already folds in the live tx/ty/scale, so the new
  // translate is origin-agnostic — no need to know where the centered frame
  // sits inside the container.
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const el = frameRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setState((s) => {
        const next = clampScale(s.scale * factor);
        const k = next / s.scale;
        if (k === 1) return s;
        return {
          scale: next,
          tx: s.tx + (clientX - rect.left) * (1 - k),
          ty: s.ty + (clientY - rect.top) * (1 - k),
        };
      });
    },
    [frameRef]
  );

  // Native, non-passive wheel listener so preventDefault actually sticks
  // (React's synthetic onWheel is passive and can't cancel page scroll).
  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Scroll/pinch over an inset panel does nothing — zooming the board
      // behind a panel that stays put reads as a glitch. Let the event pass
      // (no preventDefault) so the panel keeps normal scroll semantics.
      if (insideRegionPanel(e.target)) return;
      e.preventDefault();
      touched.current = true;
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled, zoomAt]);

  // Drop back to a bare identity if the feature is switched off, so no stale
  // transform lingers on the frame when the flag flips (the untransformed board
  // is centered by its own layout again).
  useEffect(() => {
    if (!enabled) {
      touched.current = false;
      setState(IDENTITY);
      setFit(IDENTITY);
    }
  }, [enabled]);

  const reset = useCallback(() => {
    touched.current = false;
    setState(computeFit() ?? fit);
  }, [computeFit, fit]);

  // Active pointers (by id) for pinch; a press only becomes a pan once it
  // crosses PAN_THRESHOLD, and a pan sets didPan so the trailing click is
  // swallowed (see onClickCapture) — a drag that started on a gold space must
  // not also fire that space's action.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const panning = useRef(false);
  const didPan = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled) return;
      // A press that begins inside an inset panel (header drag, collapse caret)
      // is the panel's own gesture — never start a board pan from it (issue
      // #216). The panel header also stopPropagation()s, so this is a backstop.
      if (insideRegionPanel(e.target)) return;
      // clear here (not on click) so a touch pan — which fires no click — can't
      // leave didPan set and swallow the NEXT genuine tap.
      didPan.current = false;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        start.current = { x: e.clientX, y: e.clientY };
        panning.current = false;
      }
    },
    [enabled]
  );

  // Track moves at the window level while any pointer is down, so a fast drag
  // that outruns the element still pans (mirrors the region-panel drag). Lazy
  // pointer capture would retarget the click and break the identity model, so
  // we deliberately don't capture — clicks stay on their real targets.
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: PointerEvent) => {
      const pts = pointers.current;
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pts.size >= 2) {
        // two-finger pinch (touch): zoom about the midpoint by the change in
        // finger gap.
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist.current) {
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinchDist.current);
        }
        pinchDist.current = dist;
        didPan.current = true;
        touched.current = true;
        return;
      }

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (!panning.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > PAN_THRESHOLD) {
        panning.current = true;
      }
      if (panning.current) {
        didPan.current = true;
        touched.current = true;
        // translate() sits outside scale() in the transform, so a screen-pixel
        // drag maps 1:1 to the translate regardless of zoom. The result is
        // clamped so a chunk of the board always stays on screen — with the
        // board filling the viewport there's no surrounding page to drag back
        // from (issue #450).
        const c = containerRef.current;
        const f = frameRef.current;
        setState((s) => {
          const tx = s.tx + dx;
          const ty = s.ty + dy;
          if (!c || !f) return { ...s, tx, ty };
          return {
            ...s,
            tx: clampAxis(tx, f.offsetWidth * s.scale, c.clientWidth),
            ty: clampAxis(ty, f.offsetHeight * s.scale, c.clientHeight),
          };
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinchDist.current = null;
      if (pointers.current.size === 0) panning.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [enabled, zoomAt, frameRef]);

  // Capture-phase: if the gesture just panned, eat the click before it reaches
  // a hit-circle/fighter so panning never triggers an action.
  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (didPan.current) {
      e.preventDefault();
      e.stopPropagation();
      didPan.current = false;
    }
  }, []);

  return {
    containerRef,
    transform: enabled ? `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})` : undefined,
    transformOrigin: enabled ? "0 0" : undefined,
    handlers: enabled ? { onPointerDown, onClickCapture } : {},
    // "reset view" is offered only once the player has moved AWAY from the fit —
    // the fit itself is the resting view, however far from identity it sits.
    active: enabled && !same(state, fit),
    reset,
  };
}
