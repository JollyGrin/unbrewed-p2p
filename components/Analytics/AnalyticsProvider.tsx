import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAccount } from "@/lib/account/useAccount";
import { analyticsAvailable, identifyAccount, resetIdentity, trackPageview } from "@/lib/analytics";

/**
 * Ties the anonymous id to the Unbrewed account id (/me `account.id`) with the
 * profile as person properties, and resets a stale identity on a guest answer.
 * Mounted only when analytics is on. The wrapper remembers the answer, so it
 * applies even if PostHog only starts later, and sends nothing when unchanged.
 */
const AnalyticsIdentity = () => {
  const { status, account } = useAccount();
  useEffect(() => {
    if (status === "signed-in") identifyAccount(account);
    else if (status === "guest") resetIdentity();
  }, [status, account]);
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
