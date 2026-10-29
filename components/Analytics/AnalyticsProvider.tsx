import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useAccount } from "@/lib/account/useAccount";
import { identifyAccount, resetIdentity, trackPageview } from "@/lib/analytics";

/**
 * Renders nothing. Sends a `$pageview` per client-side route change and ties
 * the anonymous id to the Discord account once sign-in is detected. Both are
 * no-ops until `AnalyticsNotice` has started analytics.
 */
export const AnalyticsProvider = () => {
  const router = useRouter();
  const { status, account } = useAccount();
  const identified = useRef(false);

  useEffect(() => {
    // Initial load; the notice's start() runs in its own effect, so defer a tick.
    const t = setTimeout(trackPageview, 0);
    router.events.on("routeChangeComplete", trackPageview);
    return () => {
      clearTimeout(t);
      router.events.off("routeChangeComplete", trackPageview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountId = account?.id;
  useEffect(() => {
    if (status === "signed-in" && accountId) {
      const t = setTimeout(() => {
        identifyAccount(accountId);
        identified.current = true;
      }, 0);
      return () => clearTimeout(t);
    }
    if (status === "guest" && identified.current) {
      identified.current = false;
      resetIdentity();
    }
  }, [status, accountId]);

  return null;
};
