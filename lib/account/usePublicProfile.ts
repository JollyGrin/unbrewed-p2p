/**
 * Another player's profile for /stats (issue #590).
 *
 * Component state, like `useAccountStats` and unlike the shared `/me` probe:
 * there is one consumer on one page, the subject changes with the query string,
 * and a remount should genuinely re-ask.
 *
 * The standing rules of the epic still hold — one request per username, no
 * retry, and every failure a quiet state — with one addition specific to a
 * public page: `not_found` is kept apart from `unavailable`. "Nobody by that
 * name" and "the API is down" look identical to a fetch and read completely
 * differently to a visitor who just typed a username.
 */
import { useEffect, useState } from "react";

import { fetchPublicProfile, PublicProfile } from "./publicProfile";

/**
 * - `loading`     — the profile request is in flight (or `?u=` isn't read yet)
 * - `not_found`   — no account by that name
 * - `unavailable` — the accounts API is unreachable or wouldn't answer
 * - `ready`       — a profile in hand
 */
export type PublicProfileStatus =
  | "loading"
  | "not_found"
  | "unavailable"
  | "ready";

export interface PublicProfileView {
  status: PublicProfileStatus;
  profile: PublicProfile | null;
}

export const usePublicProfile = (username: string | null): PublicProfileView => {
  const [view, setView] = useState<PublicProfileView>({
    status: "loading",
    profile: null,
  });

  useEffect(() => {
    // No username yet: the page is a static export, so `?u=` only arrives once
    // the router hydrates. Stay on `loading` rather than flashing not-found.
    if (!username) {
      setView({ status: "loading", profile: null });
      return;
    }
    let alive = true;
    // A changed `?u=` must not leave the previous player's numbers under the
    // new name while the second request is in flight.
    setView({ status: "loading", profile: null });
    void fetchPublicProfile(username).then((result) => {
      if (!alive) return;
      if (result.ok) {
        setView({ status: "ready", profile: result.value });
        return;
      }
      setView({
        status: result.reason === "not_found" ? "not_found" : "unavailable",
        profile: null,
      });
    });
    return () => {
      alive = false;
    };
  }, [username]);

  return view;
};
