/**
 * Product analytics (PostHog EU Cloud), issue #1438. The ONLY module that
 * imports `posthog-js`: everything else calls the wrapper below, so tests, dev
 * and the dev-only pages stay silent by construction.
 *
 * Privacy contract (docs/analytics.md):
 * - No cookie: the anonymous id lives in localStorage (`persistence`).
 * - Nothing is captured until the notice has rendered (`start()` is called from
 *   `AnalyticsNotice`, never at import time) and never after the user declines.
 * - The app works with the env vars unset: every call is then a no-op.
 */
import type { PostHog } from "posthog-js";
import { APP_COMMIT, APP_VERSION } from "@/lib/pro/appVersion";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
/** The first-party proxy (workers/posthog-proxy); EU ingest as the fallback. */
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const UI_HOST = "https://eu.posthog.com";
const CONSENT_KEY = "unbrewed-analytics-notice";

/** Routes that never report: dev tooling and the debug page. */
const SILENT_PREFIXES = ["/dev", "/debug"];

/**
 * Event names, in one place. Phase A only emits `$pageview`
 * (automatic) and `$identify`; the rest are the agreed taxonomy that phase B
 * call sites will use. Properties never carry user-typed text, deck names,
 * chat or e-mail.
 */
export type AnalyticsEvent =
  | "landing_cta_clicked"
  | "share_link_opened"
  | "invite_link_copied"
  | "join_link_opened"
  | "login_started"
  | "login_completed"
  | "deck_added"
  | "deck_add_failed"
  | "deck_removed"
  | "deck_replaced"
  | "deck_selected_for_game"
  | "hero_picked"
  | "lobby_created"
  | "lobby_joined"
  | "game_started"
  | "game_ended"
  | "irl_session_started"
  | "tableplace_handoff"
  | "ws_connect_failed"
  | "ws_closed_unexpected";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export type ConsentState = "unseen" | "seen" | "declined";

/**
 * In-game routes: the notice never renders there (it would cover the hand and
 * controls), so a first-time visitor who lands on one is NOT started until
 * they reach a normal route where the notice shows.
 */
const GAME_PREFIXES = ["/pro/game", "/game", "/irl", "/offline", "/table"];
export const isGameRoute = (pathname: string): boolean =>
  GAME_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

// posthog-js is loaded by dynamic import() inside startAnalytics only, so
// nothing downloads when analytics is off, declined or unavailable.
let ph: PostHog | null = null;
let starting = false;
/** Calls made between startAnalytics() and the import resolving. */
let queue: Array<(p: PostHog) => void> = [];

const isSilentPath = (pathname: string): boolean =>
  SILENT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Key present, a real browser, production build. Read per call so tests can flip it. */
export const analyticsAvailable = (): boolean =>
  !!KEY && typeof window !== "undefined" && process.env.NODE_ENV === "production";

const readConsent = (): ConsentState => {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "seen" || v === "declined" ? v : "unseen";
  } catch {
    return "unseen";
  }
};

const writeConsent = (v: ConsentState) => {
  try {
    window.localStorage.setItem(CONSENT_KEY, v);
  } catch {
    /* storage blocked: the notice just shows again next visit */
  }
};

/** Whether the one-line notice should render (analytics on, not yet dismissed). */
export const shouldShowNotice = (): boolean => analyticsAvailable() && readConsent() === "unseen";

/** Run now if PostHog is loaded, queue if it is loading, otherwise drop. Never throws. */
const run = (fn: (p: PostHog) => void): void => {
  if (!analyticsAvailable()) return;
  if (ph) {
    if (!ph.has_opted_out_capturing()) fn(ph);
  } else if (starting) {
    queue.push(fn);
  }
};

/**
 * Boot PostHog (async). Call only once the notice has rendered (or was
 * dismissed on an earlier visit). Idempotent; a declined visitor is never
 * initialised. After the first successful start one `$pageview` is sent for the
 * current location, which is the landing view for a first-time visitor.
 */
export const startAnalytics = (): void => {
  if (ph || starting || !analyticsAvailable()) return;
  if (readConsent() === "declined") return;
  starting = true;
  import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY as string, {
        api_host: HOST,
        ui_host: UI_HOST,
        persistence: "localStorage",
        // Anonymous visitors get no person profile until identify(): cheaper, and
        // the engine's server events merge in when the account id is known.
        person_profiles: "identified_only",
        autocapture: false,
        capture_pageview: false, // SPA: pageviews are sent on route change
        capture_pageleave: false, // doubles volume against the free tier; nothing planned needs it
        disable_session_recording: true,
        disable_surveys: true,
        // Pin every default capture off. posthog-js 1.200 has no client option for
        // exception autocapture or web vitals: both are switched on by the project's
        // remote config, so skipping that fetch (advanced_disable_decide) keeps them
        // off; capture_performance:false covers web vitals + network timing too.
        advanced_disable_decide: true,
        capture_performance: false,
        capture_heatmaps: false,
        enable_heatmaps: false,
        capture_dead_clicks: false,
      });
      posthog.register({ app_commit: APP_COMMIT, app_version: APP_VERSION });
      if (readConsent() === "declined") posthog.opt_out_capturing();
      ph = posthog;
      starting = false;
      const pending = queue;
      queue = [];
      pending.forEach((fn) => run(fn));
      // Once per page load: a returning visitor starts at mount, so exactly one.
      if (!isSilentPath(window.location.pathname)) run((p) => p.capture("$pageview"));
    })
    .catch(() => {
      starting = false;
      queue = [];
    });
};

/** The notice has rendered / been dismissed: start capturing. */
export const acknowledgeNotice = (): void => {
  if (readConsent() === "unseen") writeConsent("seen");
  startAnalytics();
};

/** Opt out for good (honoured by PostHog's own persisted flag too). */
export const declineAnalytics = (): void => {
  writeConsent("declined");
  queue = [];
  if (ph) ph.opt_out_capturing();
};

/** Opt back in from the privacy page. */
export const resumeAnalytics = (): void => {
  writeConsent("seen");
  if (ph) ph.opt_in_capturing();
  else startAnalytics();
};

export const getConsent = (): ConsentState => (typeof window === "undefined" ? "unseen" : readConsent());

/**
 * `$pageview` for the current location on a client-side route change. Skipped
 * while PostHog is still loading: the post-start landing pageview covers it.
 */
export const trackPageview = (): void => {
  if (!ph || isSilentPath(window.location.pathname)) return;
  run((p) => p.capture("$pageview"));
};

export const track = (event: AnalyticsEvent, props?: AnalyticsProps): void => {
  if (typeof window === "undefined" || isSilentPath(window.location.pathname)) return;
  run((p) => p.capture(event, props));
};

/** Link the anonymous history to the signed-in Unbrewed account id (one-way merge). */
export const identifyAccount = (accountId: string): void => {
  run((p) => {
    if (p.get_distinct_id() !== accountId) p.identify(accountId);
  });
};

/** Signed out: stop attributing events to the account. */
export const resetIdentity = (): void => {
  run((p) => p.reset());
};

/**
 * The anonymous id the engine should adopt as its `distinct_id` (wire field
 * `analyticsId`), or undefined when analytics is off/declined/not yet loaded —
 * in which case the field is simply not sent.
 */
export const getAnalyticsId = (): string | undefined => {
  if (!ph || !analyticsAvailable() || ph.has_opted_out_capturing()) return undefined;
  const id = ph.get_distinct_id();
  return typeof id === "string" && id ? id : undefined;
};
