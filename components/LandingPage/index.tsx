import { Box, Flex, Text } from "@chakra-ui/react";
import Link from "next/link";
import { Hero } from "./Hero";
import { LandingNav } from "./LandingNav";
import { FourTables } from "./FourTables";
import { IntentHelper } from "./IntentHelper";
import { ProBand } from "./ProBand";
import { Progression } from "./Progression";
import { BringAnyDeck } from "./BringAnyDeck";
import { Community } from "./Community";
import { Faq } from "./Faq";
import { LandingFooter } from "./LandingFooter";
import { ChangelogUpdateDialog } from "./ChangelogUpdateDialog";
import { useLandingRoster } from "./useLandingRoster";
import type { LandingCatalog } from "./catalog";
import { DISCORD_URL, FAQS, GITHUB_URL, TABLES } from "./content";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE,
  SITE_URL,
} from "@/components/Helmet/Head";

/**
 * JSON-LD for `/`: WebSite + Organization, the WebApplication with its four
 * tables, and an FAQPage built from the same FAQS array the accordions render.
 */
export const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Unbrewed",
      url: `${SITE_URL}/`,
      description: DEFAULT_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Unbrewed",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/favicon.ico`,
      sameAs: [GITHUB_URL, DISCORD_URL],
    },
    {
      "@type": "WebApplication",
      name: "Unbrewed",
      url: `${SITE_URL}/`,
      applicationCategory: "GameApplication",
      operatingSystem: "Web browser",
      browserRequirements: "Requires a modern web browser with JavaScript.",
      description: DEFAULT_DESCRIPTION,
      image: `${SITE_URL}${DEFAULT_IMAGE}`,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: TABLES.map((table) => `${table.name}: ${table.text}`),
      author: {
        "@type": "Person",
        name: "JollyGrin",
        url: "https://github.com/JollyGrin",
      },
      about: { "@type": "Game", name: "Unmatched" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
  ],
};

const JsonLd = () => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
  />
);

const Disclaimer = () => (
  <Box bg="brand.primary" color="brand.surfaceDim" textAlign="center" fontSize="0.8rem" px="1rem" py="0.6rem">
    <Text>
      Unbrewed is not owned by or associated with{" "}
      <Box as={Link} href="https://restorationgames.com/unmatched/" fontWeight={700}>
        Restoration Games, LLC
      </Box>
      . A free, open-source hobby project for playing and playtesting fan decks.
    </Text>
  </Box>
);

/** The "Four tables" landing page (unbrewed-p2p-1353). Section order is the brief's. */
export const LandingPage = ({ catalog }: { catalog: LandingCatalog }) => {
  const roster = useLandingRoster();

  return (
    <Flex direction="column" minH="100svh" overflowX="clip">
      <JsonLd />
      <ChangelogUpdateDialog />
      <LandingNav />
      <Box as="main">
        <Hero roster={roster} sandboxMapCount={catalog.sandboxMapCount} />
        <Disclaimer />
        <FourTables />
        <IntentHelper />
        <ProBand roster={roster} proBoards={catalog.proBoards} />
        <Progression />
        <BringAnyDeck showcaseMaps={catalog.showcaseMaps} sandboxMapCount={catalog.sandboxMapCount} />
        <Community />
        <Faq />
      </Box>
      <LandingFooter />
    </Flex>
  );
};
