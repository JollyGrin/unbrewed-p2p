import { Box, Text } from "@chakra-ui/react";
import Link from "next/link";
import { IconChangelog } from "@/components/Icons/IconChangelog";
import { useChangelogSeen } from "@/lib/changelog/useChangelogSeen";

/**
 * "What's new" entry point (unbrewed-p2p-984): always links to /changelog;
 * the unseen-count pill is hidden at 0 and hidden until after mount, matching
 * ProNavButton's hydration-safe pattern (here via useChangelogSeen's
 * useSyncExternalStore, which itself returns the empty snapshot for SSR/first
 * paint — see the hook's doc comment).
 */
export const ChangelogNavLink = () => {
  const { unseen } = useChangelogSeen();
  const count = unseen.length;

  return (
    <Link href="/changelog" aria-label="What's new">
      <Box
        position="relative"
        display="inline-flex"
        alignItems="center"
        gap="0.5rem"
        minH="2.75rem"
        color="brand.primary"
        transition="all 0.25s ease-in-out"
        _hover={{ filter: "saturate(2)", transform: "scale(1.05)" }}
        _active={{ transform: "scale(0.98)" }}
      >
        <IconChangelog fontSize="1.15rem" flexShrink={0} />
        <Text
          display={{ base: "none", md: "inline" }}
          fontFamily="ArchivoNarrow"
          textTransform="uppercase"
          letterSpacing="0.08em"
          fontSize="0.9rem"
        >
          What&apos;s new
        </Text>
        {count > 0 && (
          <Box
            position="absolute"
            top="-0.35rem"
            right="-0.65rem"
            px="0.3rem"
            py="0.02rem"
            borderRadius="full"
            bg="brand.accent"
            color="brand.secondary"
            fontFamily="ArchivoNarrow"
            fontSize="0.65rem"
            fontWeight="bold"
            lineHeight="1.4"
            boxShadow="0 1px 3px rgba(0,0,0,0.45)"
            pointerEvents="none"
          >
            {count}
          </Box>
        )}
      </Box>
    </Link>
  );
};
