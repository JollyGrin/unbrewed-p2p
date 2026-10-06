/**
 * `loading` for a `next/dynamic` screen that explains something to the player
 * (#1265). A chunk that fails to load (typically a tab opened before a deploy
 * replaced the chunks) must not leave the page blank: it says so and offers a
 * reload. Static on purpose — no dynamic import of its own.
 */
import { Box, Button, Text } from "@chakra-ui/react";

export const LazyScreenFallback = ({ error }: { error?: Error | null }) => {
  if (!error) return null;
  return (
    <Box role="alert" p="2rem" textAlign="center" color="brand.parchment" fontFamily="SpaceGrotesk">
      <Text fontWeight={700} mb="0.75rem">
        This screen couldn&apos;t load. The site was probably updated since you opened this tab.
      </Text>
      <Button size="sm" onClick={() => window.location.reload()}>
        Reload the page
      </Button>
    </Box>
  );
};
