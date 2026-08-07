/**
 * /pro/replays — save, browse, and scrub full-match God-view replays (#122).
 * Ships DARK behind the beta-features flag (`?replays`, lib/flags.ts); the page
 * is just that gate, and the browser itself lives in components/Pro/ReplaysBrowser.
 *
 * The gate covers the replays UI only. Share links minted here (#567) land on
 * /share/replay/<id>, which is deliberately NOT gated — a link is usually the
 * recipient's first contact with replays.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import { Box, Button, Flex, Heading, Spinner, Text } from "@chakra-ui/react";
import { useFlag } from "@/lib/flags";
import { ReplaysBrowser } from "@/components/Pro/ReplaysBrowser";

const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";

const BTN = { size: "sm" as const, bg: "whiteAlpha.200", color: "brand.parchment", _hover: { bg: "whiteAlpha.400" } };
const BTN_GOLD = { ...BTN, bg: "brand.accent", color: "brand.surfaceDim", _hover: { bg: "brand.accentDeep" } };

const GatedNotice = ({ onEnable }: { onEnable: () => void }) => (
  <Box minH="100svh" bg={TABLE_BG} color="brand.parchment">
    <Flex direction="column" align="center" justify="center" minH="100svh" gap="1rem" px="1rem" textAlign="center">
      <Heading fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.05em" fontSize="2.5rem">
        REPLAYS
      </Heading>
      <Text opacity={0.8} maxW="28rem">
        Full-match replays are a beta feature that isn&apos;t switched on yet.
      </Text>
      <Button {...BTN_GOLD} onClick={onEnable}>
        Enable beta replays
      </Button>
      <Text fontSize="0.75rem" opacity={0.5}>
        (or open this page with <code>?replays</code>)
      </Text>
    </Flex>
  </Box>
);

const ReplaysPage = () => {
  const [enabled, toggleReplays] = useFlag("replays");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <Head>
        <title>Unbrewed Pro — Replays</title>
        <meta name="robots" content="noindex" />
      </Head>
      {!mounted ? (
        <Flex minH="100svh" align="center" justify="center" bg={TABLE_BG}>
          <Spinner color="brand.accent" />
        </Flex>
      ) : enabled ? (
        <ReplaysBrowser />
      ) : (
        <GatedNotice onEnable={toggleReplays} />
      )}
    </>
  );
};

export default ReplaysPage;
