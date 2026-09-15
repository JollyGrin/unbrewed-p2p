/**
 * Voice chat — spectator entry point: /voice?room=<id>.
 * Pro has no live spectating, so spectators only join the voice room; the
 * VoiceDock mounted in _app does the actual work.
 */
import { Flex, Text } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { voiceContextFromRoute } from "@/lib/voice/voiceRoute";

export default function VoicePage() {
  const router = useRouter();
  const context = voiceContextFromRoute(router.pathname, router.query);

  return (
    <Flex
      minH="100vh"
      bg="brand.secondary"
      color="brand.highlight"
      direction="column"
      alignItems="center"
      justifyContent="flex-end"
      gap="0.5rem"
      px="1rem"
      pb="3rem"
      textAlign="center"
    >
      {context ? (
        <Text opacity={0.8} maxW="24rem">
          You&apos;re joining the voice chat of game {context.roomId} as a spectator. The board isn&apos;t shown here —
          just talk along.
        </Text>
      ) : (
        <Text opacity={0.8}>This invite link is missing a room id.</Text>
      )}
    </Flex>
  );
}
