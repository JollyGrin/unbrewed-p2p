/**
 * Contained mode for the in-game Pro view (issue #1678).
 *
 * /pro/game owns its whole page: it sizes itself off the viewport, parks its
 * HUD, dock, hand and log with `position: fixed`, and picks its arrangement
 * from a viewport media query. An EMBEDDED view (a puzzle panel on the landing
 * page, in a lobby) has to do all of that against the box it was given.
 *
 * `ProContainedFrame` is that box. Inside it:
 *  - `position: fixed` resolves against the frame, not the viewport (the frame
 *    is a containing block: `contain: layout` + a no-op `transform`), and the
 *    frame clips whatever overflows it;
 *  - every Chakra portal (modals, menus, tooltips, popovers) is appended inside
 *    the frame: the view is rendered through one `<Portal containerRef>`, and a
 *    nested Chakra portal attaches to its parent portal;
 *  - `useProLayout` picks desktop / portrait / rail from the FRAME's size;
 *  - Chakra's responsive props (`{ base, md }`) answer to the frame's width
 *    too: the frame provides a copy of the theme whose breakpoints are either
 *    "always" or "never", according to which ones the frame has reached;
 *  - `--pro-vh` / `--pro-vw` are 1% of the frame, so the few viewport units the
 *    view's chrome uses (`proVh(62)` and friends) measure the frame too.
 *
 * Outside a frame `useProContained()` is null, the two CSS variables are unset
 * and every helper here falls back to the viewport: /pro/game is unchanged.
 */
import { Box, BoxProps, Portal, toCSSVar, useTheme } from "@chakra-ui/react";
import { ThemeProvider as EmotionThemeProvider } from "@emotion/react";
import { createContext, ReactNode, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface ProContained {
  /** the frame element: the containing block, the portal host, the focus scope */
  el: HTMLElement;
  /** the frame's content box, in px */
  width: number;
  height: number;
}

const ProContainedContext = createContext<ProContained | null>(null);

/** The frame this component is rendered inside, or null on a full page. */
export const useProContained = (): ProContained | null => useContext(ProContainedContext);

type ViewportHeightUnit = "vh" | "svh" | "dvh";
type ViewportWidthUnit = "vw" | "svw";

/**
 * `n` percent of the height the view has: the frame's inside a contained
 * frame, the viewport's (in the unit the call site always used) otherwise.
 */
export const proVh = (n: number, unit: ViewportHeightUnit = "svh"): string => `calc(var(--pro-vh, 1${unit}) * ${n})`;
/** `n` percent of the width the view has. See `proVh`. */
export const proVw = (n: number, unit: ViewportWidthUnit = "vw"): string => `calc(var(--pro-vw, 1${unit}) * ${n})`;

/**
 * The frame's top-left corner in viewport px ({0, 0} on a full page).
 * `getBoundingClientRect()` answers in viewport coordinates, but a
 * `position: fixed` box inside a frame is placed from the FRAME's corner: any
 * measured rect that feeds a fixed position has to have this subtracted.
 */
export const containedOrigin = (el: HTMLElement | null | undefined): { left: number; top: number } => {
  if (!el) return { left: 0, top: 0 };
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
};

/**
 * Whether a window-level key press belongs to this view. On a full page
 * (`el` null) every key does. Inside a frame only while focus is in it, so
 * two panels on one page — or a panel beside the real game — never both act
 * on the same key.
 */
export const containedOwnsKeys = (el: HTMLElement | null | undefined): boolean => {
  if (!el) return true;
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return !!active && el.contains(active);
};

/**
 * Extra props for a Chakra Modal / AlertDialog opened by the view. Inside a
 * frame the dialog is the PANEL's, not the page's: it must not lock the host
 * page's scroll, nor mark the rest of the host page inert (`aria-hidden`).
 * Focus is still trapped in the dialog, which is inside the frame. `{}` on a
 * full page, so /pro/game's dialogs keep every default.
 */
export const useContainedModalProps = (): { blockScrollOnMount?: false; useInert?: false } =>
  useProContained() ? CONTAINED_MODAL_PROPS : NO_MODAL_PROPS;
const CONTAINED_MODAL_PROPS = { blockScrollOnMount: false, useInert: false } as const;
const NO_MODAL_PROPS = {};

/** The root to look for an open modal under: the frame, or the whole page. */
export const containedScope = (el: HTMLElement | null | undefined): ParentNode | null =>
  el ?? (typeof document !== "undefined" ? document : null);

/**
 * Which arrangement a frame of this size wears. The viewport policy
 * (lib/pro/useProLayout) is "desktop from 62em, else portrait, else the rail on
 * a landscape phone"; a panel is not a device, so the same three arrangements
 * are picked from the box alone:
 *
 *  - `desktop` from 900 × 680: the floating plates, the right-hand dock, the
 *    log and the fanned hand need about that much in BOTH directions. In a
 *    shorter box the hand fan stands on the dock and the log.
 *  - `rail` for any other box that is wider than tall: the board keeps its
 *    landscape orientation and the decisions + hand stand in a right rail.
 *    The portrait arrangement would turn the map on end and leave it a strip.
 *  - `portrait` otherwise: the phone arrangement, board stood on end.
 */
export const CONTAINED_DESKTOP_MIN_WIDTH_PX = 900;
export const CONTAINED_DESKTOP_MIN_HEIGHT_PX = 680;
export const containedLayoutMode = (width: number, height: number): "desktop" | "portrait" | "rail" =>
  width >= CONTAINED_DESKTOP_MIN_WIDTH_PX && height >= CONTAINED_DESKTOP_MIN_HEIGHT_PX
    ? "desktop"
    : width > height
      ? "rail"
      : "portrait";

const toPx = (value: unknown): number => {
  const text = String(value);
  const n = parseFloat(text);
  if (!Number.isFinite(n)) return 0;
  return /r?em$/.test(text) ? n * 16 : n;
};

/**
 * The theme a frame `width` px wide gives its content: every breakpoint the
 * frame has reached becomes `0em` (its styles always apply) and every one it
 * has not becomes unreachable. `{ base: a, md: b }` then resolves against the
 * frame, with no per-component change. Exported for the unit test.
 */
export const containedBreakpoints = (breakpoints: Record<string, unknown>, width: number): Record<string, string> =>
  Object.fromEntries(
    Object.entries(breakpoints).map(([key, value]) => [key, key === "base" || toPx(value) <= width ? "0em" : "99999em"])
  );

export const ProContainedFrame = ({ children, ...rest }: { children: ReactNode } & BoxProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // clientWidth/Height: the content box, whole px, unaffected by a
      // transform an ancestor may be animating the panel with.
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const theme = useTheme();
  const reached = size ? JSON.stringify(containedBreakpoints(theme.breakpoints ?? {}, size.width)) : null;
  // Rebuilt only when the frame crosses a breakpoint, not on every resize.
  const framedTheme = useMemo(
    () => (reached ? toCSSVar({ ...theme, breakpoints: JSON.parse(reached) as Record<string, string> }) : theme),
    [theme, reached]
  );

  const value = useMemo<ProContained | null>(
    () => (size && ref.current ? { el: ref.current, width: size.width, height: size.height } : null),
    [size]
  );

  return (
    <Box
      ref={ref}
      data-testid="pro-contained"
      // Focusable, so a click anywhere in the panel gives it the keyboard.
      tabIndex={0}
      position="relative"
      w="100%"
      h="100%"
      overflow="hidden"
      color="brand.parchment"
      _focusVisible={{ outline: "2px solid rgba(224, 168, 46, 0.6)", outlineOffset: "-2px" }}
      {...rest}
      sx={{
        contain: "layout",
        transform: "translateZ(0)",
        // `clip`, not just `hidden`: a hidden box can still be scrolled (focus
        // moving to a control near an edge does it), and a scrolled frame
        // shifts every fixed overlay inside it.
        "@supports (overflow: clip)": { overflow: "clip" },
        // The view's own portal node (below): it has to BE the frame's box, or
        // the view's `height: 100%` resolves against an auto-height div.
        "& > .chakra-portal": { position: "absolute", inset: 0 },
        // Chakra sizes a modal's overlay and its centring container to
        // 100vw × 100vh: inside the frame they are the frame's size.
        "& .chakra-modal__overlay, & .chakra-modal__content-container": {
          width: "100%",
          height: "100%",
        },
        ...(size ? { "--pro-vh": `${size.height / 100}px`, "--pro-vw": `${size.width / 100}px` } : {}),
        ...rest.sx,
      }}
    >
      {/* Nothing until the frame is measured: the first paint already wears
          the arrangement that fits, never one frame of the desktop overlays. */}
      {value && (
        <ProContainedContext.Provider value={value}>
          <EmotionThemeProvider theme={framedTheme}>
            <Portal containerRef={ref}>{children}</Portal>
          </EmotionThemeProvider>
        </ProContainedContext.Provider>
      )}
    </Box>
  );
};
