import { useEffect } from "react";
import { PageSeo } from "@/components/Helmet/Head";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import { TIER_ORDER } from "@/lib/pro/botTiers";
import { ProLanding } from "@/components/Pro/ProLanding";
import { markProNewSeen } from "@/components/Navbar/ProNavButton";

/** Counted from the catalogs, so the meta can't drift from the product (#1353). */
const PRO_DESCRIPTION = `Play Unmatched fan decks with full rules enforcement in your browser: legal moves only, combat math done, hands hidden. Fight bots at ${TIER_ORDER.length} tiers up to Prodigy, a friend or a stranger, on ${MAP_CATALOG.filter((entry) => !entry.hidden).length} boards. No install.`;

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
      <PageSeo
        path="/pro"
        title="Unbrewed Pro — rules-enforced Unmatched: play vs bots or friends in your browser"
        description={PRO_DESCRIPTION}
        image="/og-pro.png"
      />
      <ProLanding />
    </>
  );
};

export default ProPage;
