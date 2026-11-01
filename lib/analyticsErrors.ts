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

/** `track` the first time `key` is seen this page load; later calls are dropped. */
export const trackOncePerPageLoad = (key: string, event: AnalyticsEvent, props?: AnalyticsProps): void => {
  if (sent.has(key)) return;
  sent.add(key);
  track(event, props);
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
    message: (err ? err.message : String(error)).slice(0, MESSAGE_MAX),
    room_id: ctx.roomId ?? undefined,
    seat: ctx.seat ?? undefined,
    state_hash: ctx.stateHash ?? undefined,
  });
};
