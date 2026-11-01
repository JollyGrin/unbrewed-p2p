/**
 * Props for every "Sign in with Discord" link (issue #1510): the OAuth href
 * plus a `login_started` event, so each call site is one spread instead of a
 * copy of the tracking code. `onClick` chains a site's own click handler.
 */
import { track } from "@/lib/analytics";
import { signInUrl } from "./useAccount";

export const signInLink = (returnTo?: string, onClick?: () => void) => ({
  href: signInUrl(returnTo),
  onClick: () => {
    track("login_started", { provider: "discord", from_page: window.location.pathname });
    onClick?.();
  },
});
