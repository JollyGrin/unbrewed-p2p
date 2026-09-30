/**
 * Client analytics emitter (unbrewed-p2p#1097).
 *
 * The client has no event pipeline today (counter.dev is page views only and the
 * telemetry service ingests server-to-server), so this is deliberately just the
 * seam: typed events go to ONE pluggable {@link AnalyticsSink}. The default sink
 * is nothing, and the emitter is OFF unless `NEXT_PUBLIC_ANALYTICS=1` at build
 * time — disabled, `track` returns before building anything. A transport (a beacon
 * to an ingest route) plugs in later via {@link setAnalyticsSink}; none exists yet.
 *
 * No PII: events carry hero/enemy ids, counts and durations — never display
 * names, account ids, tokens or room ids.
 */

export interface AnalyticsEvent {
  /** snake_case, `<surface>_<what>` (e.g. `adventure_verdict`) */
  name: string;
  /** flat JSON-safe props */
  props: Record<string, string | number | boolean | null | string[]>;
  /** epoch ms at emit */
  ts: number;
}

/** The whole transport contract. Must not throw; failures are swallowed by `track` anyway. */
export type AnalyticsSink = (event: AnalyticsEvent) => void;

/** Literal property access so Next inlines it at build time. */
export const analyticsEnabled = (): boolean => process.env.NEXT_PUBLIC_ANALYTICS === "1";

let sink: AnalyticsSink | null = null;

/** Install (or with `null`, remove) the transport. */
export const setAnalyticsSink = (next: AnalyticsSink | null): void => {
  sink = next;
};

/**
 * Emit one event. No-ops (does not even call `props`) when analytics is disabled or
 * no sink is installed. Accepts a thunk so call sites never pay to build props when off.
 */
export const track = (name: string, props: AnalyticsEvent["props"] | (() => AnalyticsEvent["props"]) = {}): void => {
  if (!sink || !analyticsEnabled()) return;
  try {
    sink({ name, props: typeof props === "function" ? props() : props, ts: Date.now() });
  } catch {
    // analytics must never break the game
  }
};
