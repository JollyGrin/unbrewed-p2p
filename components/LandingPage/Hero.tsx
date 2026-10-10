import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { IconLogoTextmark } from "@/components/Icons/IconLogoTextmark";
import { DiscordPresence } from "@/components/Discord";
import { HeroCanvas } from "./HeroCanvas";
import { PlayChooser } from "./PlayChooser";
import type { LandingFighter } from "./useLandingRoster";

const Pill = ({ children }: { children: React.ReactNode }) => (
  <Text
    as="span"
    display="inline-flex"
    alignItems="center"
    fontSize="0.82rem"
    fontWeight={600}
    px="0.75rem"
    py="0.35rem"
    borderRadius="full"
    bg="rgba(241,224,193,.12)"
    border="1px solid rgba(241,224,193,.18)"
    color="brand.primary"
  >
    {children}
  </Text>
);

/**
 * Hero: wordmark, the page's one visible <h1>, a one-line sub, the "Play now"
 * chooser, a ghost link down to the four tables, and live fact pills. The hero
 * count only appears once the Pro server has answered — never a typed number.
 */
export const Hero = ({
  roster,
  sandboxMapCount,
}: {
  roster: LandingFighter[] | null;
  sandboxMapCount: number;
}) => (
  <Box
    as="section"
    id="top"
    aria-labelledby="hero-heading"
    position="relative"
    bg="brand.secondary"
    color="brand.primary"
    pt={{ base: "2.5rem", md: "4rem" }}
    pb={{ base: "2.5rem", md: "3.5rem" }}
  >
    <Box position="absolute" inset="0" overflow="hidden" pointerEvents="none">
      <HeroCanvas />
    </Box>
    <VStack position="relative" spacing="1.25rem" textAlign="center" px="1rem" maxW="48rem" mx="auto">
      <Text
        fontFamily="SpaceGrotesk"
        fontSize="0.75rem"
        fontWeight={700}
        letterSpacing="0.14em"
        textTransform="uppercase"
        color="brand.accent"
      >
        Free · open-source · no account · no install
      </Text>
      <IconLogoTextmark
        w="min(26rem, calc(100vw - 4rem))"
        h="auto"
        sx={{ aspectRatio: "681 / 168" }}
        aria-hidden="true"
      />
      <Text
        as="h1"
        id="hero-heading"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize={{ base: "1.75rem", md: "2.6rem" }}
        lineHeight="1.1"
        color="brand.parchment"
        maxW="22ch"
        sx={{ textWrap: "balance" }}
      >
        Play Unmatched fan decks online,{" "}
        <Box as="span" color="brand.accent">
          any way you like.
        </Box>
      </Text>
      <Text maxW="38rem" fontSize={{ base: "1rem", md: "1.08rem" }} opacity={0.92}>
        Pick a fan deck and play a friend, a bot or a bracket of strangers — on a
        2D table, a 3D one, or your phone at a real board.
      </Text>
      <VStack spacing="0.6rem">
        <PlayChooser />
        <Text
          as={Link}
          href="#ways"
          fontSize="0.9rem"
          fontWeight={600}
          opacity={0.85}
          _hover={{ opacity: 1, textDecoration: "underline" }}
        >
          See the four tables ↓
        </Text>
      </VStack>
      <HStack spacing="0.5rem" flexWrap="wrap" justify="center" rowGap="0.5rem">
        <DiscordPresence tone="light" />
        {roster && roster.length > 0 && <Pill>{roster.length} heroes in Pro</Pill>}
        <Pill>{sandboxMapCount} maps, or any image</Pill>
        <Pill>Works on your phone</Pill>
      </HStack>
    </VStack>
  </Box>
);
