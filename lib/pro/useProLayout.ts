/**
 * Which arrangement /pro/game is wearing (issue #708).
 *
 * Desktop (>= 62em) keeps the floating-overlay choreography it has always had:
 * draggable HUD plates top-left, the decision dock parked at the right edge,
 * the hand fanned across the bottom, the activity log floating bottom-left.
 * Anything narrower mounts the mobile arrangement of the SAME components —
 * one compact match strip on top, the board filling the middle, the dock
 * re-homed as a bottom decision sheet with the hand as a scroll strip under it.
 *
 * Two hard constraints shape this hook:
 *
 *  1. /pro/game is statically exported, so nothing may touch `window` during
 *     render — that is why Chakra's `useBreakpointValue` is banned here (see
 *     the comment it replaced in pages/pro/game.tsx) and why the mode starts
 *     at "desktop" and is corrected by an effect.
 *  2. That correction runs in a LAYOUT effect on the client, so a phone never
 *     paints one frame of the desktop overlays before swapping. The static
 *     export still gets the plain effect (there is no `window` to lay out
 *     against), so the prerendered markup and the first client render agree
 *     and hydration stays quiet.
 */
import { RefObject, useCallback, useEffect, useLayoutEffect, useState } from "react";

/**
 * Everything BELOW Chakra's `lg` (62em), where the dock stops reserving its
 * right-hand column. Deliberately phrased as a max-width rather than as the
 * negation of `(min-width: 62em)`: a headless DOM whose matchMedia stub answers
 * `false` to everything (scripts/renderFuzz/domEnv.ts) then lands on DESKTOP,
 * which is the arrangement those harnesses have always rendered.
 */
export const MOBILE_QUERY = "(max-width: 61.9375em)";
/** A phone held sideways: too short to stack a decision sheet under the board. */
export const RAIL_QUERY = "(max-width: 61.9375em) and (max-height: 30em)";

export type ProLayoutMode = "desktop" | "portrait" | "rail";

export interface ProLayout {
  mode: ProLayoutMode;
  /** the desktop arrangement — kept under its old name, which callers read as
   *  "the dock owns a 20rem column on the right" */
  dockWide: boolean;
  mobile: boolean;
  /** landscape phone: the decision sheet + hand become a right rail */
  rail: boolean;
}

/** Pure mode pick, so the breakpoint policy is testable without a DOM. */
export const proLayoutMode = (narrow: boolean, shortAndNarrow: boolean): ProLayoutMode =>
  !narrow ? "desktop" : shortAndNarrow ? "rail" : "portrait";

const layoutOf = (mode: ProLayoutMode): ProLayout => ({
  mode,
  dockWide: mode === "desktop",
  mobile: mode !== "desktop",
  rail: mode === "rail",
});

/** Layout effect in a browser, plain effect during the static export. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export const useProLayout = (): ProLayout => {
  const [mode, setMode] = useState<ProLayoutMode>("desktop");

  useIsomorphicLayoutEffect(() => {
    // The render-fuzz jsdom (scripts/renderFuzz/domEnv.ts) stubs matchMedia,
    // but a bare jsdom has none at all — stay on the desktop arrangement there
    // rather than throwing during a headless render.
    if (typeof window.matchMedia !== "function") return;
    const narrow = window.matchMedia(MOBILE_QUERY);
    const rail = window.matchMedia(RAIL_QUERY);
    const sync = () => setMode(proLayoutMode(narrow.matches, rail.matches));
    sync();
    narrow.addEventListener?.("change", sync);
    rail.addEventListener?.("change", sync);
    return () => {
      narrow.removeEventListener?.("change", sync);
      rail.removeEventListener?.("change", sync);
    };
  }, []);

  return layoutOf(mode);
};

/**
 * Live pixel height of an element, or 0 while `enabled` is false.
 *
 * The mobile board fit is derived from the chrome that actually surrounds it —
 * the match strip and the bottom sheet both change height as a timer bar
 * appears or the sheet force-expands around a combat — so measuring beats the
 * hardcoded 120/136 the desktop path still uses.
 */
export const useElementHeight = (ref: RefObject<HTMLElement>, enabled: boolean): number => {
  const [height, setHeight] = useState(0);

  const measure = useCallback(() => {
    const el = ref.current;
    setHeight(el ? el.getBoundingClientRect().height : 0);
  }, [ref]);

  useEffect(() => {
    if (!enabled) {
      setHeight(0);
      return;
    }
    const el = ref.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled, measure, ref]);

  return height;
};
