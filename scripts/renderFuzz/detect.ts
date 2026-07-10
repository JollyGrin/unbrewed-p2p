/**
 * Render-throw detection seam (unbrewed-p2p-179).
 *
 * Kept jsdom-free so the detection primitives can be unit-tested in-process
 * (under Jest's own jsdom) against the REAL components/Pro/ProErrorBoundary
 * output, without importing the mount path (which loads the `jsdom` package).
 *
 * The page wraps its board in ProErrorBoundary (issue #178), which SWALLOWS a
 * render throw into a recoverable fallback panel — React stops error propagation
 * at the NEAREST boundary, so a harness boundary placed further out never fires
 * for board-level crashes. Left undetected, a sweep goes green-while-blind on
 * exactly the Hollow-Oak class this harness exists to catch. Two stable hooks
 * (documented in ProErrorBoundary's header as its public contract) keep it
 * observable: it `console.error`s the marker below with (error, componentStack),
 * and renders the `data-testid` below on its fallback root. If either changes in
 * that component, it must change here too.
 */

/** A caught render failure, with enough to re-open the exact spot in the code. */
export interface RenderThrow {
  message: string;
  stack: string | null;
  /** React's descendant chain to the throwing component (from componentDidCatch). */
  componentStack: string | null;
}

export const BOUNDARY_MARKER = "[pro] game view render crashed";
export const FALLBACK_TESTID = "pro-error-boundary-fallback";

/**
 * Recognize ProErrorBoundary's console.error signature and lift the swallowed
 * error + component stack out of it. Returns null for any other console.error.
 */
export function parseBoundaryMarker(args: unknown[]): RenderThrow | null {
  if (typeof args[0] !== "string" || !args[0].includes(BOUNDARY_MARKER)) return null;
  const err = args[1] as Error | undefined;
  const third = args[2];
  const componentStack =
    typeof third === "string"
      ? third
      : (third as { componentStack?: string } | undefined)?.componentStack ?? null;
  return {
    message: String(err?.message ?? err ?? "render crashed"),
    stack: err?.stack ?? null,
    componentStack,
  };
}

/** Is a ProErrorBoundary fallback panel currently mounted under `root`? */
export function fallbackShownIn(root: ParentNode): boolean {
  return !!root.querySelector(`[data-testid="${FALLBACK_TESTID}"]`);
}
