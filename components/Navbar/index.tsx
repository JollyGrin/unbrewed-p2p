import styled from "@emotion/styled";
import { Box, HStack, Text } from "@chakra-ui/react";
import { IconLogo } from "../Icons/IconLogo";
import { IconChangelog } from "../Icons/IconChangelog";
import { ProNavButton } from "./ProNavButton";
import { AccountChip } from "../Account/AccountChip";
import Link from "next/link";
import { useChangelogSeen } from "@/lib/changelog/useChangelogSeen";

import { FaDiscord } from "react-icons/fa";
import { GiSwapBag } from "react-icons/gi";
import { FaGithub } from "react-icons/fa";
import { FaYoutube } from "react-icons/fa";
import { IconType } from "react-icons";

export const Navbar = () => {
  return (
    <HStack p="0.75rem 0.5rem" justifyContent="space-between">
      <Link href="/">
        <IconLogo fontSize="2rem" />
      </Link>

      <HStack flexWrap="wrap" justifyContent="flex-end">
        <ChangelogNavLink />
        <ProNavButton />
        <Link href="/bag">
          <BagIcon />
        </Link>
        <Link href="https://discord.gg/qPxHFjwkNN">
          <DiscordIcon />
        </Link>
        <Link href="https://youtube.com/playlist?list=PLjsjwAfJTj3a2NMDzOENFMwOYUzsFQn_C&si=Wi-MwpmS6loyBpB3">
          <YoutubeIcon />
        </Link>
        <Link href="https://github.com/jollygrin/unbrewed-p2p/">
          <GithubIcon />
        </Link>
        {/* Optional Discord account (#459) — renders nothing unless the
            accounts API answers, so guest play is untouched. */}
        <AccountChip />
      </HStack>
    </HStack>
  );
};

/**
 * "What's new" entry point (unbrewed-p2p-984): always links to /changelog;
 * the unseen-count pill is hidden at 0 and hidden until after mount, matching
 * ProNavButton's hydration-safe pattern (here via useChangelogSeen's
 * useSyncExternalStore, which itself returns the empty snapshot for SSR/first
 * paint — see the hook's doc comment).
 */
const ChangelogNavLink = () => {
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

const iconProps = `
  font-size: 2rem;
  transition: all 0.25s ease-in-out;
  :hover {
    filter: saturate(2);
    transform: scale(1.2);
  }

  :active {
    transform: scale(1.1);
  }
`;
function i(icon: IconType) {
  return styled(icon)(iconProps);
}
const BagIcon = i(GiSwapBag);
const DiscordIcon = i(FaDiscord);
const GithubIcon = i(FaGithub);
const YoutubeIcon = i(FaYoutube);
