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
import posthog from "posthog-js";
import { APP_COMMIT, APP_VERSION } from "@/lib/pro/appVersion";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
/** The first-party proxy (workers/posthog-proxy); EU ingest as the fallback. */
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const UI_HOST = "https://eu.posthog.com";
const CONSENT_KEY = "unbrewed-analytics-notice";

/** Routes that never report: dev tooling and the debug page. */
const SILENT_PREFIXES = ["/dev", "/debug"];

/**
 * Event names, in one place. Phase A only emits `$pageview`/`$pageleave`
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

let started = false;

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

const active = (): boolean =>
  started && analyticsAvailable() && !posthog.has_opted_out_capturing();

/**
 * Boot PostHog. Call only once the notice has rendered (or was dismissed on an
 * earlier visit). Idempotent; a declined visitor is never initialised.
 */
export const startAnalytics = (): void => {
  if (started || !analyticsAvailable()) return;
  if (readConsent() === "declined") return;
  posthog.init(KEY as string, {
    api_host: HOST,
    ui_host: UI_HOST,
    persistence: "localStorage",
    // Anonymous visitors get no person profile until identify(): cheaper, and
    // the engine's server events merge in when the account id is known.
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false, // SPA: pageviews are sent on route change
    capture_pageleave: true,
    disable_session_recording: true,
    disable_surveys: true,
    loaded: (ph) => {
      ph.register({ app_commit: APP_COMMIT, app_version: APP_VERSION });
    },
  });
  started = true;
};

/** The notice has rendered / been dismissed: start capturing. */
export const acknowledgeNotice = (): void => {
  if (readConsent() === "unseen") writeConsent("seen");
  startAnalytics();
};

/** Opt out for good (honoured by PostHog's own persisted flag too). */
export const declineAnalytics = (): void => {
  writeConsent("declined");
  if (started) posthog.opt_out_capturing();
};

/** Opt back in from the privacy page. */
export const resumeAnalytics = (): void => {
  writeConsent("seen");
  if (started) posthog.opt_in_capturing();
  else startAnalytics();
};

export const getConsent = (): ConsentState => (typeof window === "undefined" ? "unseen" : readConsent());

/** `$pageview` for the current location (referrer/UTM come from the SDK). */
export const trackPageview = (): void => {
  if (!active() || isSilentPath(window.location.pathname)) return;
  posthog.capture("$pageview");
};

export const track = (event: AnalyticsEvent, props?: AnalyticsProps): void => {
  if (!active() || isSilentPath(window.location.pathname)) return;
  posthog.capture(event, props);
};

/** Link the anonymous history to the Discord account (one-way merge). */
export const identifyAccount = (discordId: string): void => {
  if (!active()) return;
  if (posthog.get_distinct_id() !== discordId) posthog.identify(discordId);
};

/** Signed out: stop attributing events to the account. */
export const resetIdentity = (): void => {
  if (active()) posthog.reset();
};

/**
 * The anonymous id the engine should adopt as its `distinct_id` (wire field
 * `analyticsId`), or undefined when analytics is off/declined — in which case
 * the field is simply not sent.
 */
export const getAnalyticsId = (): string | undefined => {
  if (!active()) return undefined;
  const id = posthog.get_distinct_id();
  return typeof id === "string" && id ? id : undefined;
};
