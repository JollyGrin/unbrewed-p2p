import { Button, Flex, Text } from "@chakra-ui/react";
import { proErrorMessage } from "@/lib/pro/proErrors";
import { reloadPage, useClientStale } from "@/lib/pro/staleClient";

/**
 * Page-wide "new version — reload" banner (p2p #1549). Mounted once in _app so
 * every surface that talks to the Pro engine (picker, waiting room, game, /pro
 * and home rosters) shows it the moment any socket is refused for its protocol
 * version. Sticky: there is no dismiss, because nothing works until a reload.
 */
export const StaleClientBanner = () => {
  const stale = useClientStale();
  if (!stale) return null;
  return (
    <Flex
      role="alert"
      aria-label="New version available"
      position="fixed"
      top={2}
      left={2}
      right={2}
      zIndex={2000}
      maxW="640px"
      mx="auto"
      px={3}
      py={2}
      gap={3}
      align="center"
      justify="space-between"
      bg="#2b1b3d"
      color="#f3e9d2"
      border="1px solid #6b4a8e"
      borderRadius="md"
      fontSize="sm"
    >
      <Text>{proErrorMessage("VERSION")}</Text>
      <Button size="xs" flexShrink={0} onClick={() => reloadPage.run()}>
        Reload
      </Button>
    </Flex>
  );
};
