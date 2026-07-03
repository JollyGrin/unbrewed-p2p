import { HStack, Skeleton, Text, StackProps } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import Link from "next/link";
import {
  DISCORD_FALLBACK_INVITE,
  useDiscordWidget,
} from "@/lib/hooks/useDiscordWidget";
import { LiveBeacon } from "./LiveBeacon";

/**
 * A compact, tappable live-count pill: a breathing beacon, the number online,
 * and a Discord glyph. Links into the battles channel. Meant to sit under a
 * hero CTA or on the lobby screen as an at-a-glance "people are here" signal.
 * Renders nothing until the count is known, so it never flashes an empty pill.
 */
export const DiscordPresence = ({
  tone = "dark",
  ...rest
}: { tone?: "dark" | "light" } & StackProps) => {
  const { data, isLoading } = useDiscordWidget();
  const online = data?.presence_count ?? 0;
  const invite = data?.instant_invite ?? DISCORD_FALLBACK_INVITE;

  // ink = text/icon color; the pill sits on either the purple hero or parchment
  const ink = tone === "dark" ? "brand.secondary" : "brand.primary";
  const bg = tone === "dark" ? "blackAlpha.100" : "blackAlpha.400";
  const bgHover = tone === "dark" ? "blackAlpha.200" : "blackAlpha.500";

  if (isLoading) {
    return <Skeleton height="1.9rem" width="12rem" borderRadius="full" {...rest} />;
  }

  return (
    <HStack
      as={Link}
      href={invite}
      target="_blank"
      rel="noopener noreferrer"
      spacing="0.55rem"
      bg={bg}
      color={ink}
      borderRadius="full"
      px="0.85rem"
      py="0.4rem"
      fontSize="0.85rem"
      transition="all 0.2s ease"
      _hover={{ bg: bgHover, transform: "translateY(-1px)" }}
      {...rest}
    >
      <LiveBeacon size="0.55rem" />
      <Text fontWeight={600}>
        {online > 0 ? (
          <>
            <Text as="span" fontFamily="SpaceGrotesk" fontWeight={700}>
              {online}
            </Text>{" "}
            online on Discord
          </>
        ) : (
          "Find a match on Discord"
        )}
      </Text>
      <FaDiscord size="1.05rem" />
    </HStack>
  );
};
