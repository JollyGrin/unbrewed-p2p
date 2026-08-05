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
import { ReplaySharePage } from "@/components/Pro/ReplayShareLanding";
import { ShareLanding } from "@/components/Share/ShareLanding";
import { parseSharePath } from "@/lib/share/sharedItem";

type Props = Record<string, never>;

export const getStaticProps: GetStaticProps<Props> = () => {
  return { props: {} };
};

export default function Custom404() {
  const router = useRouter();

  const [, online, lobby, user] = router.asPath.split("/");
  // Share links — `/share/replay/<uuid>` (#567) and `/share/deck|map/<uuid>`
  // (#566). No runtime-minted id can be pre-rendered, so GitHub Pages serves
  // 404.html for them and the matching landing renders in place, with no
  // redirect hop and the URL intact.
  const share = parseSharePath(router.asPath);
  // A referral link (/online/... or /offline/...) always lands here first
  // since the site is a static export — this isn't a real 404, so it should
  // never show error copy.
  const isReferralRedirect = online === "online" || online === "offline";

  // Handles the redirect from the old unbrewed online router
  useEffect(() => {
    if (share) return;
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

  // A share link isn't a 404 either — render the right landing right here.
  if (share?.kind === "replay") return <ReplaySharePage id={share.id} />;
  if (share) return <ShareLanding route={share.kind} id={share.id} />;

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
