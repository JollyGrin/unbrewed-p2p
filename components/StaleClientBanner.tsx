import { Button, Flex, Text } from "@chakra-ui/react";
import { proErrorMessage } from "@/lib/pro/proErrors";
import { reloadPage, useClientStale } from "@/lib/staleClient";

/**
 * Page-wide "new version — reload" banner. Mounted once in _app so every
 * surface shows it the moment the bundle is known to be out of date, for
 * either reason in `lib/staleClient.ts`: a Pro socket refused for its protocol
 * version (p2p #1549), or a lazy chunk that failed while a newer build is
 * deployed (p2p #1605, e.g. the token icons on /game). Sticky: there is no
 * dismiss, because the page is missing code until a reload.
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
