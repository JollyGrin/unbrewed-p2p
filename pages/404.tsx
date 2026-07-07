import {
  Button,
  Divider,
  Grid,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect } from "react";

import type { GetStaticProps } from "next";
import Link from "next/link";

type Props = Record<string, never>;

export const getStaticProps: GetStaticProps<Props> = () => {
  return { props: {} };
};

export default function Custom404() {
  const router = useRouter();

  const [, online, lobby, user] = router.asPath.split("/");
  // A referral link (/online/... or /offline/...) always lands here first
  // since the site is a static export — this isn't a real 404, so it should
  // never show error copy.
  const isReferralRedirect = online === "online" || online === "offline";

  // Handles the redirect from the old unbrewed online router
  useEffect(() => {
    if (online === "offline") {
      // /offline/<deckId> is a solo, local-only session — no lobby, no
      // websocket. Route straight to the offline board; it loads the deck
      // client-side. `name=offline` is what the board reads as `self`.
      const deckId = lobby;

      router.push({
        pathname: "offline",
        query: { deckId, name: "offline" },
      });
      return;
    }

    if (online !== "online") return;

    const [username, deckId] = user?.split("?deck=") ?? [];
    router.push({
      pathname: "connect",
      query: {
        lobby,
        username,
        deckId,
      },
    });
  }, [router.asPath]);

  if (isReferralRedirect) {
    return (
      <Grid
        bg="brand.primary"
        color="brand.secondary"
        h="100vh"
        placeItems="center"
      >
        <VStack>
          <Spinner size="xl" />
          <Text fontFamily="heading" fontSize="1.5rem" fontWeight={700}>
            Loading your game…
          </Text>
        </VStack>
      </Grid>
    );
  }

  return (
    <Grid
      bg="brand.primary"
      color="brand.secondary"
      h="100vh"
      placeItems="center"
    >
      <VStack>
        <Text fontFamily="heading" fontSize="3rem" fontWeight={700}>
          Whoops!
        </Text>
        <Text>This page does not exist!</Text>
        <Divider />
        <Text>We recently updated the website for more functionality:</Text>
        <Button as={Link} href="/">
          Go Home
        </Button>
      </VStack>
    </Grid>
  );
}
