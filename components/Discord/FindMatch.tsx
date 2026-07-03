import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Flex,
  HStack,
  Skeleton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import {
  DISCORD_FALLBACK_INVITE,
  useDiscordWidget,
} from "@/lib/hooks/useDiscordWidget";
import { LiveBeacon, ONLINE_GREEN } from "./LiveBeacon";

/** Discord "blurple" — the one non-parchment accent, kept to the icon + CTA. */
const BLURPLE = "#5865F2";

const STEPS = [
  {
    n: "1",
    title: "Join the battles channel",
    text: "Hop into the Discord — the invite drops you straight into #battles.",
  },
  {
    n: "2",
    title: "Go “battle ready”",
    text: "Give yourself the Battle Ready role so everyone can see you're up for a game.",
  },
  {
    n: "3",
    title: "Tag someone online",
    text: "Ping anyone who's online and battle ready, share a lobby name, and play.",
  },
];

/**
 * The full "find someone to play" module for the landing page. Leads with a
 * live count + faces of who's around, then the three steps to a match, then
 * the CTA into the battles channel. Degrades to a warm "be the first" prompt
 * when nobody's on / the widget can't be read, so it's never a dead card.
 */
export const FindMatch = () => {
  const { data, isLoading } = useDiscordWidget();

  const online = data?.presence_count ?? 0;
  const invite = data?.instant_invite ?? DISCORD_FALLBACK_INVITE;
  const onlineMembers =
    data?.members?.filter((m) => m.status === "online").slice(0, 6) ?? [];

  return (
    <Box
      mt="2.5rem"
      as="section"
      aria-labelledby="find-match-heading"
      bg="brand.secondary"
      borderRadius="0.75rem"
      p={{ base: "1.5rem", md: "2rem" }}
      boxShadow="card"
      position="relative"
      overflow="hidden"
    >
      {/* faint blurple glow to nod at Discord without leaving the palette */}
      <Box
        position="absolute"
        top="-40%"
        right="-10%"
        w="min(70%, 420px)"
        h="140%"
        bgGradient={`radial(${BLURPLE}, transparent 70%)`}
        opacity={0.16}
        pointerEvents="none"
      />

      <Flex
        direction={{ base: "column", md: "row" }}
        gap={{ base: "1.5rem", md: "2.5rem" }}
        position="relative"
      >
        {/* Left: the live pulse */}
        <VStack align="flex-start" spacing="0.75rem" minW={{ md: "12rem" }}>
          <HStack
            spacing="0.5rem"
            bg="blackAlpha.300"
            borderRadius="full"
            px="0.75rem"
            py="0.35rem"
          >
            <LiveBeacon />
            <Text
              fontFamily="ArchivoNarrow"
              letterSpacing="0.12em"
              textTransform="uppercase"
              fontSize="0.72rem"
              color="brand.primary"
              opacity={0.85}
            >
              Live on Discord
            </Text>
          </HStack>

          {isLoading ? (
            <Skeleton height="3.5rem" width="9rem" borderRadius="0.5rem" />
          ) : online > 0 ? (
            <Box>
              <HStack align="baseline" spacing="0.5rem">
                <Text
                  fontFamily="SpaceGrotesk"
                  fontWeight={700}
                  fontSize="3.25rem"
                  lineHeight="1"
                  color="brand.primary"
                >
                  {online}
                </Text>
                <Text
                  color="brand.primary"
                  opacity={0.75}
                  fontSize="1rem"
                  fontWeight={600}
                >
                  online now
                </Text>
              </HStack>
              {onlineMembers.length > 0 && (
                <AvatarGroup size="sm" max={5} mt="0.85rem" spacing="-0.6rem">
                  {onlineMembers.map((m) => (
                    <Avatar
                      key={m.id}
                      name={m.username}
                      src={m.avatar_url}
                      borderColor={ONLINE_GREEN}
                      showBorder
                    />
                  ))}
                </AvatarGroup>
              )}
            </Box>
          ) : (
            <Text
              color="brand.primary"
              opacity={0.85}
              fontSize="1.05rem"
              fontWeight={600}
              maxW="12rem"
            >
              Quiet right now — be the first to call out a game.
            </Text>
          )}
        </VStack>

        {/* Right: heading, steps, CTA */}
        <Box flex="1">
          <Text
            as="h2"
            id="find-match-heading"
            fontFamily="SpaceGrotesk"
            fontSize={{ base: "1.5rem", md: "1.75rem" }}
            fontWeight={700}
            color="brand.primary"
            lineHeight="1.15"
          >
            Looking for an opponent?
          </Text>
          <Text mt="0.35rem" color="brand.primary" opacity={0.8} fontSize="0.95rem">
            Unbrewed matches happen in the Discord. Three steps and you&apos;re at
            a table:
          </Text>

          <VStack mt="1.25rem" spacing="0.85rem" align="stretch">
            {STEPS.map((s) => (
              <HStack key={s.n} align="flex-start" spacing="0.85rem">
                <Flex
                  w="1.6rem"
                  h="1.6rem"
                  flexShrink={0}
                  borderRadius="full"
                  bg="brand.primary"
                  color="brand.secondary"
                  align="center"
                  justify="center"
                  fontFamily="SpaceGrotesk"
                  fontWeight={700}
                  fontSize="0.85rem"
                >
                  {s.n}
                </Flex>
                <Box>
                  <Text
                    fontFamily="SpaceGrotesk"
                    fontWeight={700}
                    fontSize="1rem"
                    color="brand.primary"
                  >
                    {s.title}
                  </Text>
                  <Text color="brand.primary" opacity={0.7} fontSize="0.9rem">
                    {s.text}
                  </Text>
                </Box>
              </HStack>
            ))}
          </VStack>

          <Button
            mt="1.5rem"
            as="a"
            href={invite}
            target="_blank"
            rel="noopener noreferrer"
            leftIcon={<FaDiscord size="1.25rem" />}
            bg={BLURPLE}
            color="white"
            _hover={{ bg: "#4752C4", transform: "translateY(-2px)" }}
            transition="all 0.2s ease"
          >
            Join the battles channel
          </Button>
        </Box>
      </Flex>
    </Box>
  );
};
