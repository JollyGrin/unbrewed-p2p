import { Button, Divider, Grid, HStack, Text, VStack } from "@chakra-ui/react";
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

  // Handles the redirect from the old unbrewed online router
  useEffect(() => {
    const [_, online, lobby, user] = router.asPath.split("/");
    if (online === "offline") {
      const deckId = lobby;

      router.push({
        pathname: "connect",
        query: {
          lobby: "offline-" + Date.now(),
          username: "offline-" + Date.now(),
          deckId,
        },
      });
      return;
    }

    if (online !== "online") return;

    const [username, deckId] = user?.split("?deck=");
    router.push({
      pathname: "connect",
      query: {
        lobby,
        username,
        deckId,
      },
    });
  }, [router.asPath]);

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
