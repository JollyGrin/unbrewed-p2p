import Head from "next/head";
import { ProLanding } from "@/components/Pro/ProLanding";

/**
 * Unbrewed Pro — the (in development) rules-enforced mode.
 * Roadmap & architecture: docs/pro/01-context.md
 */
const ProPage = () => (
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

export default ProPage;
