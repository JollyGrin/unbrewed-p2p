/**
 * Pinch/scroll zoom + drag pan for the Pro board (issue #120, behind the
 * `zoomMap` beta flag).
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

interface ZoomPanState {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: ZoomPanState = { scale: 1, tx: 0, ty: 0 };

const clampScale = (s: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

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
  /** snap back to the fit-to-frame identity view */
  reset: () => void;
}

/**
 * @param enabled  master switch (the `zoomMap` flag) — false = inert
 * @param frameRef ref to the transformed shrink-wrap frame; its live rect is
 *                 what keeps zoom anchored under the cursor as scale changes
 */
export function useZoomPan(enabled: boolean, frameRef: RefObject<HTMLElement>): ZoomPan {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ZoomPanState>(IDENTITY);

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
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled, zoomAt]);

  // Snap back to the fit view if the feature is switched off, so no stale
  // transform lingers on the frame when the flag flips.
  useEffect(() => {
    if (!enabled) setState(IDENTITY);
  }, [enabled]);

  const reset = useCallback(() => setState(IDENTITY), []);

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
        return;
      }

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (!panning.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > PAN_THRESHOLD) {
        panning.current = true;
      }
      if (panning.current) {
        didPan.current = true;
        // translate() sits outside scale() in the transform, so a screen-pixel
        // drag maps 1:1 to the translate regardless of zoom.
        setState((s) => ({ ...s, tx: s.tx + dx, ty: s.ty + dy }));
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
  }, [enabled, zoomAt]);

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
    active: enabled && (state.scale !== 1 || state.tx !== 0 || state.ty !== 0),
    reset,
  };
}
