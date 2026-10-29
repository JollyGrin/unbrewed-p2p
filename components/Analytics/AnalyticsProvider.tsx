import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useAccount } from "@/lib/account/useAccount";
import { analyticsAvailable, identifyAccount, resetIdentity, trackPageview } from "@/lib/analytics";

/** Ties the anonymous id to the Discord account. Mounted only when analytics is on. */
const AnalyticsIdentity = () => {
  const { status, account } = useAccount();
  const identified = useRef(false);
  const accountId = account?.id;
  useEffect(() => {
    if (status === "signed-in" && accountId) {
      identifyAccount(accountId);
      identified.current = true;
    } else if (status === "guest" && identified.current) {
      identified.current = false;
      resetIdentity();
    }
  }, [status, accountId]);
  return null;
};

/**
 * Renders nothing. Sends a `$pageview` per client-side route change (the
 * landing view is sent by startAnalytics). The account probe lives in a child
 * that mounts only when analytics is available, so with no key there is no
 * extra network request.
 */
export const AnalyticsProvider = () => {
  const router = useRouter();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!analyticsAvailable()) return;
    setAvailable(true);
    router.events.on("routeChangeComplete", trackPageview);
    return () => router.events.off("routeChangeComplete", trackPageview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return available ? <AnalyticsIdentity /> : null;
};
