/**
 * Error events for the "Errors" dashboard (issue #1514, docs/analytics.md §4).
 * Named events only: `$exception` autocapture stays off and
 * `posthog.captureException` is never called (it bills Error Tracking).
 *
 * Every event here fires at most once per key per page load, so a crash loop or
 * a redeploy reconnect storm costs one event, not hundreds.
 */
import { AnalyticsEvent, AnalyticsProps, track } from "@/lib/analytics";

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

const MESSAGE_MAX = 200;
/** Quoted runs longer than this are likely input echoed back (e.g. JSON.parse errors). */
const QUOTED_MAX = 16;
const QUOTED = new RegExp(`"[^"]{${QUOTED_MAX + 1},}"|'[^']{${QUOTED_MAX + 1},}'`, "g");

/** The message with long quoted segments redacted, cut to MESSAGE_MAX chars. */
export const scrubMessage = (message: string): string =>
  message.replace(QUOTED, (m) => `${m[0]}…${m[0]}`).slice(0, MESSAGE_MAX);

/** `client_error` from an error boundary's componentDidCatch; one per boundary per page load. */
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
};
