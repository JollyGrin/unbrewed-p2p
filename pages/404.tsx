import { Grid, Text, VStack } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function Custom404() {
  const router = useRouter();

  // Handles the redirect from the old unbrewed online router
  useEffect(() => {
    const [_, online, lobby, user] = router.asPath.split("/");
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
      </VStack>
    </Grid>
  );
}
// online/fds/fds?deck=B4ZIGdn
