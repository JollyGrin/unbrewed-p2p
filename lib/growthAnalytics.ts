/**
 * Growth events (issue #1513): landing CTAs, share/invite/join links and the
 * IRL Mode install. Triggers are listed in docs/analytics.md, section 1.
 *
 * Every event here is sent at most once per page load: a re-render, a second
 * click or a URL rewrite in the same load sends nothing.
 */
import Router from "next/router";
import { useEffect, useRef } from "react";
import {
  analyticsAvailable,
  getConsent,
  track,
  type AnalyticsEvent,
  type AnalyticsProps,
} from "@/lib/analytics";
import { getToken } from "@/lib/pro/recentRooms";
import { TICKET_QUERY_KEYS } from "@/lib/pro/tournamentTicket";

const sent = new Set<AnalyticsEvent>();

/**
 * Set by the first client-side navigation. A link followed inside the app
 * (the bag's "Playtest in person" to `/irl?deckId=`, "back to your room" to
 * `/pro/game?room=`) is not a landing: only the URL the browser loaded is.
 * Shallow rewrites (a page tidying its own query) don't count. _app imports
 * this module, so the listener is on before any navigation can start.
 */
let navigated = false;
let keepNextNavigation = false;
const onRouteChangeStart = (_url: string, opts?: { shallow?: boolean }) => {
  if (opts?.shallow) return;
  if (keepNextNavigation) keepNextNavigation = false;
  else navigated = true;
};
// `?.`: tests mock next/router without the singleton.
Router?.events?.on("routeChangeStart", onRouteChangeStart);

/**
 * The 404 page forwards an old-style link (`/offline/<deckId>`) to its route
 * with one push: that push still carries the URL the browser loaded.
 */
export const keepLandingThroughRedirect = () => {
  if (!navigated) keepNextNavigation = true;
};

/** Tests only: forget what this page load already sent and where it went. */
export const resetGrowthAnalytics = () => {
  sent.clear();
  navigated = false;
  keepNextNavigation = false;
};

const claim = (event: AnalyticsEvent): boolean => {
  if (sent.has(event)) return false;
  sent.add(event);
  return true;
};

/** A click: analytics has long started by then, so it is sent now. */
export const trackOnce = (event: AnalyticsEvent, props?: AnalyticsProps): void => {
  if (claim(event)) track(event, props);
};

/**
 * An event fired as a page mounts. AnalyticsNotice starts PostHog in its own
 * effect (a returning visitor) or one frame after the notice paints (a new
 * one), and a page's effects run before it, so a plain `track` here would be
 * dropped. Sent after that frame instead. On a game route nothing starts a new
 * visitor, so theirs is still dropped (accepted, see the doc).
 */
export const trackEntryOnce = (event: AnalyticsEvent, props?: AnalyticsProps): void => {
  if (typeof window === "undefined" || !claim(event)) return;
  requestAnimationFrame(() => setTimeout(() => track(event, props), 0));
};

/**
 * {@link trackEntryOnce} for the first render where `props` is known (not
 * `undefined`). `null` there means "landed, nothing to send": a later value
 * (a URL the page rewrites itself) never counts as a landing. `landingOnly`:
 * nothing either once the app has navigated client-side (a link followed
 * inside the app, not one that brought the visitor here).
 */
export const useEntryEvent = (
  event: AnalyticsEvent,
  props: AnalyticsProps | null | undefined,
  { landingOnly = false }: { landingOnly?: boolean } = {},
): void => {
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || props === undefined) return;
    landed.current = true;
    if (props && !(landingOnly && navigated)) trackEntryOnce(event, props);
  });
};

export type LandingSection = "chooser" | "tables" | "intent" | "pro" | "progression" | "decks";

/** A landing CTA click, sent as `cta: "<section>:<href>"`. */
export const trackLandingCta = (section: LandingSection, href: string): void =>
  trackOnce("landing_cta_clicked", { cta: `${section}:${href}`, from_page: window.location.pathname });

/** A player copied an invite or seat link for this mode. */
export const trackInviteCopied = (mode: "sandbox" | "sandbox-table" | "pro"): void =>
  trackOnce("invite_link_copied", { mode });

/**
 * `join_link_opened` for /pro/game as it opened: a `?room=` invite, but not a
 * seat this browser already holds (a refresh, "back to your room") nor a
 * tournament ticket.
 */
export const proJoinLinkProps = (
  room: string | null,
  query: Record<string, string | string[] | undefined>,
): AnalyticsProps | null =>
  room && !getToken(room) && !TICKET_QUERY_KEYS.some((k) => query[k] !== undefined)
    ? { mode: "pro" }
    : null;

export const IRL_FIRST_OPEN_KEY = "unbrewed-irl-first-open";

/** How the page was launched: an installed app reports its manifest display. */
export const displayMode = (): string => {
  const modes = ["fullscreen", "standalone", "minimal-ui"];
  const match = modes.find((m) => window.matchMedia?.(`(display-mode: ${m})`).matches);
  if (match) return match;
  // iOS home-screen apps don't match display-mode queries before 16.4.
  return (navigator as Navigator & { standalone?: boolean }).standalone ? "standalone" : "browser";
};

/**
 * IRL Mode as an installed app (the manifest pages/irl.tsx links): `pwa_installed` when
 * the browser installs it from this page, and `app_first_open` the first time
 * it launches outside a browser tab on this device (a localStorage flag).
 */
export const useIrlInstallAnalytics = (): void => {
  useEffect(() => {
    const onInstalled = () => trackOnce("pwa_installed");
    window.addEventListener("appinstalled", onInstalled);

    const mode = displayMode();
    // Only once analytics can send it: the flag stays unset for a visitor who
    // hasn't dismissed the notice yet (it never shows on /irl), so a later
    // launch still counts.
    if (mode !== "browser" && analyticsAvailable() && getConsent() === "seen") {
      try {
        if (!window.localStorage.getItem(IRL_FIRST_OPEN_KEY)) {
          window.localStorage.setItem(IRL_FIRST_OPEN_KEY, "1");
          trackEntryOnce("app_first_open", { display_mode: mode });
        }
      } catch {
        /* storage blocked: no flag to keep it to once, so send nothing */
      }
    }
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);
};
