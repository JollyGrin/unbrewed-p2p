/**
 * Client-side account state for the optional Discord sign-in (issue #459).
 *
 * unbrewed.xyz is a static site with no server code, so "who am I" is a single
 * cookie-authenticated probe of the accounts API (`GET /me`, see the epic plan
 * in unbrewed-api/docs/plan/accounts-phase-1-2.md). Everything here is
 * strictly additive: no existing feature reads this state, and every failure
 * path lands on "no account" without an error UI, a retry, or a console log.
 *
 * The probe lives in a module-level store rather than in component state so
 * that N mounted chips (navbar + Pro header) share ONE request per page load,
 * and so `signOut()` can refresh every consumer at once.
 */
import { useEffect, useState } from "react";
import { API_URL } from "./apiUrl";

export type Account = {
  id: string;
  username: string;
  /** Discord CDN URL built server-side; null if the user has no avatar. */
  avatarUrl: string | null;
};

/**
 * `guest` and `offline` are both "no account", deliberately distinguished:
 * `guest` means the API answered 401 (sign-in works, the user just isn't), and
 * `offline` means we never reached it (unset/down/blocked). The chip hides
 * itself when offline so a build pointed at a dead API looks exactly like the
 * site does today, instead of advertising a sign-in link that 404s.
 */
export type AccountState =
  | { status: "loading"; account: null }
  | { status: "guest"; account: null }
  | { status: "offline"; account: null }
  | { status: "signed-in"; account: Account };

const LOADING: AccountState = { status: "loading", account: null };
const GUEST: AccountState = { status: "guest", account: null };
const OFFLINE: AccountState = { status: "offline", account: null };

let state: AccountState = LOADING;
/** The in-flight (or settled) probe. Non-null means "already asked". */
let probe: Promise<AccountState> | null = null;
const listeners = new Set<(next: AccountState) => void>();

const publish = (next: AccountState) => {
  state = next;
  listeners.forEach((listener) => listener(next));
  return next;
};

/**
 * One `GET /me`. Never throws and never logs: a 401 is the expected
 * signed-out answer, and anything else (DNS failure, CORS, offline, malformed
 * body, `fetch` missing entirely) is treated as "API unreachable".
 */
const fetchMe = async (): Promise<AccountState> => {
  try {
    const res = await fetch(`${API_URL}/me`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    // 401 is the documented signed-out reply; any other non-2xx means the
    // service is there but unhappy — either way there's no account to show.
    if (!res.ok) return res.status === 401 ? GUEST : OFFLINE;
    const body = await res.json();
    const user = body?.user;
    if (!user || typeof user.id !== "string") return GUEST;
    return {
      status: "signed-in",
      account: {
        id: user.id,
        username:
          typeof user.username === "string" && user.username
            ? user.username
            : "Player",
        avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : null,
      },
    };
  } catch {
    return OFFLINE;
  }
};

/**
 * Fire the probe once per page load. Repeat calls (extra chips mounting,
 * StrictMode's double effect, client-side route changes) reuse the same
 * promise — there is no retry, so an unreachable API costs exactly one
 * failed request for the whole session.
 */
export const ensureAccountProbe = (): Promise<AccountState> => {
  if (!probe) probe = fetchMe().then(publish);
  return probe;
};

/** Re-ask `/me` and push the answer to every consumer (used after sign-out). */
export const refreshAccount = (): Promise<AccountState> => {
  probe = fetchMe().then(publish);
  return probe;
};

/** Where the "Sign in with Discord" affordance points. */
export const signInUrl = (returnTo?: string): string => {
  // The API only accepts a path (its own open-redirect guard); `//evil.com` is
  // a protocol-relative URL, so it must not survive either.
  const path =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/";
  return `${API_URL}/auth/discord?return_to=${encodeURIComponent(path)}`;
};

/** Revoke the session cookie, then refetch so the UI reflects the truth. */
export const signOut = async (): Promise<AccountState> => {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* the refetch below decides what the UI shows */
  }
  return refreshAccount();
};

/**
 * Subscribe to account state. Starts at `loading` on every mount so the server
 * render and the first client paint agree (same no-hydration-flash idiom as
 * the PRO nav badge), then syncs from the shared store.
 */
export const useAccount = (): AccountState => {
  const [snapshot, setSnapshot] = useState<AccountState>(LOADING);

  useEffect(() => {
    let alive = true;
    const listener = (next: AccountState) => {
      if (alive) setSnapshot(next);
    };
    listeners.add(listener);
    // A later mount inherits whatever the first probe already settled on.
    if (state !== LOADING) setSnapshot(state);
    ensureAccountProbe();
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  return snapshot;
};

/** Test-only: drop the shared probe so each case starts from a cold store. */
export const __resetAccountStoreForTests = () => {
  state = LOADING;
  probe = null;
  listeners.clear();
};
