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
import type { CaptureResult, PostHog } from "posthog-js";
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
  | "hero_preview_opened"
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

/**
 * Query params a URL may keep on its way to PostHog: campaign tags plus public
 * ids. Everything else (`name`, `gid`, `ticket`, `room`, `lobby`, ...) can be
 * user-typed text or a secret, so it is dropped (issue #1520).
 */
const KEPT_PARAM = /^(utm_.+|ref|deckId|tour|match)$/;

/** A URL (or a bare path) without its fragment and without non-allowlisted query params. */
export const sanitizeUrl = (raw: string): string => {
  const [beforeHash] = raw.split("#");
  const q = beforeHash.indexOf("?");
  if (q < 0) return beforeHash;
  const kept = beforeHash
    .slice(q + 1)
    .split("&")
    .filter((pair) => {
      try {
        return KEPT_PARAM.test(decodeURIComponent(pair.split("=")[0]));
      } catch {
        return false;
      }
    });
  return beforeHash.slice(0, q) + (kept.length ? `?${kept.join("&")}` : "");
};

/** A referrer: our own pages are sanitized like any URL; other sites (and `$direct`) only lose the fragment. */
const sanitizeReferrer = (raw: string, origin: string): string =>
  raw === origin || raw.startsWith(`${origin}/`) || raw.startsWith(`${origin}?`) ? sanitizeUrl(raw) : raw.split("#")[0];

const OWN_URL_KEYS = ["$current_url", "$initial_current_url", "$pathname", "$initial_pathname"];
const REFERRER_KEYS = ["$referrer", "$initial_referrer"];

/**
 * Sanitize the URL-valued properties of one property bag, in place. Covers the
 * compact `$initial_person_info` ({ r: referrer, u: url }) that posthog-js 1.200
 * sends on every event and expands into the `$initial_*` person properties.
 */
export const sanitizeEventProperties = (props: Record<string, unknown> | undefined, origin: string): void => {
  if (!props) return;
  for (const k of OWN_URL_KEYS) if (typeof props[k] === "string") props[k] = sanitizeUrl(props[k] as string);
  for (const k of REFERRER_KEYS) if (typeof props[k] === "string") props[k] = sanitizeReferrer(props[k] as string, origin);
  const info = props.$initial_person_info as { r?: unknown; u?: unknown } | undefined;
  if (info && typeof info === "object") {
    props.$initial_person_info = {
      ...info,
      ...(typeof info.r === "string" ? { r: sanitizeReferrer(info.r, origin) } : {}),
      ...(typeof info.u === "string" ? { u: sanitizeUrl(info.u) } : {}),
    };
  }
};

/** `before_send` hook: drops `title`, sanitizes the event's properties plus every `$set` / `$set_once` bag. */
export const sanitizeEvent = (cr: CaptureResult | null): CaptureResult | null => {
  if (!cr) return cr;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const p = cr.properties as Record<string, unknown> | undefined;
  // document.title can hold a user-named deck (IRL Mode) and is set on `$pageview`.
  if (p) delete p.title;
  for (const bag of [p, p?.$set, p?.$set_once, cr.$set, cr.$set_once])
    sanitizeEventProperties(bag as Record<string, unknown> | undefined, origin);
  return cr;
};

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
        before_send: sanitizeEvent, // strip user-typed query params + fragments from URLs (#1520)
      });
      posthog.register({ app_commit: APP_COMMIT, app_version: APP_VERSION });
      if (readConsent() === "declined") posthog.opt_out_capturing();
      ph = posthog;
      starting = false;
      // Identity first, so queued and landing events already carry the account.
      if (known && !posthog.has_opted_out_capturing()) applyIdentity(posthog);
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

/**
 * `beacon`: send now over `navigator.sendBeacon`, for a capture made while the
 * page is going away (`pagehide`), where a batched or fetch send can be lost.
 */
export const track = (
  event: AnalyticsEvent,
  props?: AnalyticsProps,
  opts?: { beacon?: boolean },
): void => {
  if (typeof window === "undefined" || isSilentPath(window.location.pathname)) return;
  run((p) =>
    opts?.beacon
      ? p.capture(event, props, { transport: "sendBeacon", send_instantly: true })
      : p.capture(event, props),
  );
};

/**
 * What `/me` says about the signed-in player, as person properties. Fields the
 * API does not return yet are absent, never null. Never e-mail, never tokens.
 */
export type AnalyticsAccount = {
  id: string;
  username: string;
  avatarUrl: string | null;
  discordId?: string;
  createdAt?: string;
};

/** Last person properties sent for this browser, so a repeat page load sends nothing. */
const PERSON_KEY = "unbrewed-analytics-person";
/** `once` is the `createdAt` the last `$set_once` carried ("" = none yet), so it goes out once per value. */
type PersonFingerprint = { id: string; set?: string; once?: string; roles?: boolean };

const readPerson = (): PersonFingerprint | null => {
  try {
    const v = JSON.parse(window.localStorage.getItem(PERSON_KEY) || "null");
    return v && typeof v.id === "string" ? v : null;
  } catch {
    return null;
  }
};

const writePerson = (v: PersonFingerprint | null) => {
  try {
    if (v) window.localStorage.setItem(PERSON_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(PERSON_KEY);
  } catch {
    /* storage blocked: properties are re-sent next load, harmless */
  }
};

/**
 * The latest `/me` answer this page session, kept in the module so it can be
 * applied whenever PostHog starts, including late (a first visit that lands
 * on a game route only starts on the next normal route).
 */
let known: AnalyticsAccount | "guest" | null = null;

const isIdentified = (p: PostHog): boolean => p.get_property("$user_state") === "identified";

const resetPerson = (p: PostHog) => {
  p.reset();
  writePerson(null);
};

const personSet = (a: AnalyticsAccount): Record<string, string> => ({
  username: a.username,
  ...(a.avatarUrl ? { avatar_url: a.avatarUrl } : {}),
  ...(a.discordId ? { discord_id: a.discordId } : {}),
  auth_provider: "discord",
});

/** Bring PostHog's identity in line with `known`. Idempotent: steady state sends nothing. */
const applyIdentity = (p: PostHog): void => {
  if (known === "guest") {
    // Covers sign-out in this tab and a session that ended elsewhere (expired,
    // signed out in another tab) while PostHog still persists the account id.
    if (isIdentified(p)) resetPerson(p);
    return;
  }
  if (!known) return;
  const account = known;
  const set = personSet(account);
  const setKey = JSON.stringify(set);
  const onceKey = account.createdAt ?? "";
  const setOnce = {
    ...(account.createdAt ? { account_created_at: account.createdAt } : {}),
    first_identified_at: new Date().toISOString(),
  };
  const last = readPerson();
  const kept = last?.id === account.id ? last : {};
  if (p.get_distinct_id() !== account.id) {
    // posthog-js reads its persistence once per tab: if another tab on this
    // device already identified this account (sign-in opened in a new tab),
    // this tab still looks anonymous. Same sign-in, so no second login_completed.
    const otherTab = last?.id === account.id;
    // A different account was signed in on this device: start it fresh.
    if (isIdentified(p)) resetPerson(p);
    p.identify(account.id, set, setOnce);
    writePerson({ ...(otherTab ? kept : {}), id: account.id, set: setKey, once: onceKey });
    if (!otherTab && !isSilentPath(window.location.pathname)) p.capture("login_completed", { provider: "discord" });
    return;
  }
  // Already identified (phase A, or before /me had createdAt): $set_once has to
  // ride on setPersonProperties, once per createdAt value.
  const needOnce = last?.id !== account.id || last.once !== onceKey;
  if (!needOnce && last?.set === setKey) return;
  if (needOnce) p.setPersonProperties(set, setOnce);
  else p.setPersonProperties(set);
  writePerson({ ...kept, id: account.id, set: setKey, once: onceKey });
};

/**
 * Link the anonymous history to the signed-in Unbrewed account id (one-way
 * merge), with the player's profile as person properties. Remembered, so it
 * also applies if analytics only starts later in this page session.
 */
export const identifyAccount = (account: AnalyticsAccount): void => {
  known = account;
  if (ph && analyticsAvailable() && !ph.has_opted_out_capturing()) applyIdentity(ph);
};

/**
 * `/me` answered guest (signed out here, elsewhere, or the session expired):
 * stop attributing events to whichever account PostHog last persisted.
 */
export const resetIdentity = (): void => {
  known = "guest";
  if (ph && analyticsAvailable() && !ph.has_opted_out_capturing()) applyIdentity(ph);
};

/**
 * The Discord Linked Roles grant, from the `/me/discord` read the account page
 * already makes (and after link/unlink). Sent only when it changed.
 */
export const setDiscordRolesLinked = (linked: boolean): void => {
  run((p) => {
    if (!known || known === "guest" || p.get_distinct_id() !== known.id) return;
    const last = readPerson();
    if (last?.id === known.id && last.roles === linked) return;
    p.setPersonProperties({ discord_roles_linked: linked });
    writePerson({ ...(last?.id === known.id ? last : {}), id: known.id, roles: linked });
  });
};

/** What posthog-js persisted in localStorage on an earlier load (read before it loads). */
const readPersisted = (): { distinctId?: string; identified: boolean } => {
  try {
    const v = JSON.parse(window.localStorage.getItem(`ph_${KEY}_posthog`) || "null");
    const id = v?.distinct_id;
    return { distinctId: typeof id === "string" && id ? id : undefined, identified: v?.$user_state === "identified" };
  } catch {
    return { identified: false };
  }
};

/**
 * The id the engine should adopt as its `distinct_id` (wire field
 * `analyticsId`), or undefined when analytics is off/declined/unavailable — in
 * which case the field is simply not sent.
 *
 * Before posthog-js has loaded (a direct `/pro/game` load can bind first), a
 * visitor who accepted the notice gets the id PostHog persisted on an earlier
 * load: it is the id PostHog itself is about to use, so the engine's events
 * land on the same person without delaying the bind. Exceptions: a known
 * signed-in account wins (identify is about to switch to it), and a persisted
 * account id on a guest load is withheld (reset is about to replace it).
 */
export const getAnalyticsId = (): string | undefined => {
  if (!analyticsAvailable()) return undefined;
  if (ph) {
    if (ph.has_opted_out_capturing()) return undefined;
    const id = ph.get_distinct_id();
    return typeof id === "string" && id ? id : undefined;
  }
  if (readConsent() !== "seen") return undefined;
  if (known && known !== "guest") return known.id;
  // Trade-off: before /me answers, a persisted account id whose session has
  // since expired is still sent; withholding it would drop attribution on the
  // (far more common) valid sessions.
  const persisted = readPersisted();
  if (known === "guest" && persisted.identified) return undefined;
  return persisted.distinctId;
};
