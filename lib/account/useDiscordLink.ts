/**
 * Discord Linked Roles state for the perks card on /account (issue #578).
 *
 * Same shape and same two invariants as `useAccountStats`:
 *
 * 1. **A guest costs nothing.** Nothing fetches until the account probe says
 *    "signed-in", so /account still makes exactly one request for a guest.
 * 2. **No retry.** One `GET /me/discord` per mount. A deploy with the feature
 *    unconfigured answers 503 to every mount, and the card's answer to that is
 *    to not exist — retrying would only cost requests to say the same thing.
 *
 * Component state rather than a module store: one consumer, one page, and a
 * remount should genuinely re-ask (the user may have just come back from the
 * OAuth redirect with a brand-new grant).
 */
import { useCallback, useEffect, useState } from "react";

import {
  DiscordLinkFailure,
  DiscordLinkStatus,
  fetchDiscordLink,
  refreshDiscordLink,
  unlinkDiscord,
} from "./discordLink";
import { useAccount } from "./useAccount";

/**
 * - `loading`  — the account probe or the status request is in flight
 * - `hidden`   — render nothing: guest, API unreachable, or the feature is
 *                unconfigured server-side (503)
 * - `unlinked` — signed in, no grant on file → the explainer + link button
 * - `linked`   — a live grant → last-synced line, "Sync now", "Unlink"
 * - `stale`    — a grant Discord no longer honours → "re-link needed"
 */
export type DiscordLinkState =
  | "loading"
  | "hidden"
  | "unlinked"
  | "linked"
  | "stale";

export interface DiscordLinkView {
  state: DiscordLinkState;
  /** Null until a status has been read (or after the card goes hidden). */
  status: DiscordLinkStatus | null;
  /** A "Sync now" or "Unlink" request is in flight. */
  busy: boolean;
  /** `POST /me/discord/refresh`; resolves with the reason it failed, if it did. */
  sync: () => Promise<DiscordLinkFailure | null>;
  /** `POST /me/discord/unlink`; resolves with the reason it failed, if it did. */
  unlink: () => Promise<DiscordLinkFailure | null>;
}

const stateFor = (
  signedIn: boolean,
  loaded: boolean,
  loading: boolean,
  status: DiscordLinkStatus | null,
): DiscordLinkState => {
  if (!signedIn) return loading ? "loading" : "hidden";
  if (!loaded) return "loading";
  if (!status) return "hidden";
  if (!status.linked) return "unlinked";
  return status.stale ? "stale" : "linked";
};

export const useDiscordLink = (): DiscordLinkView => {
  const { status: accountStatus } = useAccount();
  const [status, setStatus] = useState<DiscordLinkStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const signedIn = accountStatus === "signed-in";

  useEffect(() => {
    if (!signedIn) {
      // Signing out drops the grant state rather than leaving the previous
      // account's link status on the page behind a sign-in prompt.
      setStatus(null);
      setLoaded(false);
      return;
    }
    let alive = true;
    void fetchDiscordLink().then((result) => {
      if (!alive) return;
      // Any failure — 503, 401, a dead API — lands on "no status", which the
      // card renders as nothing at all.
      setStatus(result.ok ? result.value : null);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const sync = useCallback(async (): Promise<DiscordLinkFailure | null> => {
    setBusy(true);
    const result = await refreshDiscordLink();
    setBusy(false);
    if (result.ok) {
      setStatus(result.value);
      return null;
    }
    // A 429 leaves the card exactly as it was — the caller says so in a toast.
    // A grant that vanished (404) or went stale under us is worth reflecting,
    // but only from a state we actually know: everything else is left alone
    // rather than blanking a card the user is looking at.
    if (result.reason === "not_linked") {
      setStatus({ linked: false, stale: false, lastPushAt: null });
    }
    return result.reason;
  }, []);

  const unlink = useCallback(async (): Promise<DiscordLinkFailure | null> => {
    setBusy(true);
    const result = await unlinkDiscord();
    setBusy(false);
    // 404 means it is already gone, which is the outcome the user asked for.
    if (result.ok || result.reason === "not_linked") {
      setStatus({ linked: false, stale: false, lastPushAt: null });
      return null;
    }
    return result.reason;
  }, []);

  return {
    state: stateFor(
      signedIn,
      loaded,
      accountStatus === "loading",
      status,
    ),
    status,
    busy,
    sync,
    unlink,
  };
};
