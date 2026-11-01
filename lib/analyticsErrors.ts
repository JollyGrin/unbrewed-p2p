/**
 * Error events for the "Errors" dashboard (issue #1514, docs/analytics.md §4).
 * Boundary crashes also go to Error Tracking via `captureException` (#1526):
 * React swallows them, so exception autocapture never sees them.
 *
 * Every event here fires at most once per key per page load, so a crash loop or
 * a redeploy reconnect storm costs one event, not hundreds.
 */
import { AnalyticsEvent, AnalyticsProps, captureException, track } from "@/lib/analytics";
import { scrubMessage } from "@/lib/analyticsScrub";

export { scrubMessage };

const sent = new Set<string>();

/**
 * `track` until `key` is captured (or queued) once this page load; later calls
 * are dropped. A call `track` drops (analytics not started) keeps the slot free.
 * Never throws: callers run it before a setState or a reconnect backoff.
 */
export const trackOncePerPageLoad = (key: string, event: AnalyticsEvent, props?: AnalyticsProps): void => {
  if (sent.has(key)) return;
  try {
    if (track(event, props)) sent.add(key);
  } catch {
    /* analytics must never break the caller */
  }
};

/** Tests only: forget what was sent, as a fresh page load would. */
export const resetOncePerPageLoad = (): void => sent.clear();

export type ErrorBoundaryName = "pro" | "sandbox" | "table" | "irl";

/** Room identifiers the Pro boundary already shows in its panel. */
export interface ClientErrorContext {
  roomId?: string | null;
  seat?: string | null;
  stateHash?: string | null;
}

/**
 * `client_error` from an error boundary's componentDidCatch, plus a
 * `$exception` (with stack) for Error Tracking; each one per boundary per page load.
 */
export const reportClientError = (
  boundary: ErrorBoundaryName,
  error: unknown,
  ctx: ClientErrorContext = {}
): void => {
  const err = error instanceof Error ? error : null;
  trackOncePerPageLoad(`client_error:${boundary}`, "client_error", {
    boundary,
    route: typeof window === "undefined" ? undefined : window.location.pathname,
    error_name: err?.name || typeof error,
    message: scrubMessage(err ? err.message : String(error)),
    room_id: ctx.roomId ?? undefined,
    seat: ctx.seat ?? undefined,
    state_hash: ctx.stateHash ?? undefined,
  });
  const key = `exception:${boundary}`;
  if (sent.has(key)) return;
  try {
    if (captureException(error, { boundary })) sent.add(key);
  } catch {
    /* analytics must never break the boundary */
  }
};
