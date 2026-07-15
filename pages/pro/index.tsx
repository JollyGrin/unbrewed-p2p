import { useEffect } from "react";
import Head from "next/head";
import { ProLanding } from "@/components/Pro/ProLanding";
import { markProNewSeen } from "@/components/Navbar/ProNavButton";

/**
 * Unbrewed Pro — the (in development) rules-enforced mode.
 * Roadmap & architecture: docs/pro/01-context.md
 */
const ProPage = () => {
  // Reaching Pro (even via direct URL) retires the front-page NEW badge (#358).
  useEffect(() => {
    markProNewSeen();
  }, []);

  return (
    <>
      <Head>
        <title>Unbrewed Pro — rules-enforced Unmatched (in development)</title>
        <meta
          name="description"
          content="Unbrewed Pro is an upcoming rules-enforced way to play Unmatched online: a server referees every move, so you can battle strangers — and eventually an AI. The free-form sandbox stays as it is."
        />
      </Head>
      <ProLanding />
    </>
  );
};

export default ProPage;
