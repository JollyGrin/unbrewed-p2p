import { useEffect } from "react";
import Head from "next/head";
import { ProLanding } from "@/components/Pro/ProLanding";
import { markProNewSeen } from "@/components/Navbar/ProNavButton";

/**
 * Unbrewed Pro — the rules-enforced mode (open beta).
 * Architecture: docs/pro/01-context.md
 */
const ProPage = () => {
  // Reaching Pro (even via direct URL) retires the front-page NEW badge (#358).
  useEffect(() => {
    markProNewSeen();
  }, []);

  return (
    <>
      <Head>
        {/* single string child: next/head warns on a multi-child <title> */}
        <title>{"Unbrewed Pro — rules-enforced Unmatched: play vs AI or friends in your browser"}</title>
        <meta
          name="description"
          content="Play Unmatched with full rules enforcement in your browser. A referee server allows only legal moves, does the combat math, and keeps hands hidden — battle an AI at three difficulties, a friend, or a stranger. No account, no install."
        />
      </Head>
      <ProLanding />
    </>
  );
};

export default ProPage;
