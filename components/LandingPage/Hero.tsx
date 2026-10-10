import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { IconLogoTextmark } from "@/components/Icons/IconLogoTextmark";
import { DiscordPresence } from "@/components/Discord";
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
 * Two oversized gradient layers over brand.secondary that drift in opposite
 * directions. Pure CSS, transform-only (compositor, no JS). Each loop starts and
 * ends at translate(0) — the same frame SSR paints and reduced motion keeps — so
 * there is no jump on hydration. Loops are 14 s / 11 s so the wash moves within
 * seconds but never syncs into a pulse. The warm plum is translucent and sits
 * below the eyebrow line, so the hero's text stays AA at the lightest moment.
 * Gradients go in inline style: Chakra's bg parser chokes on `… at …` in jsdom.
 */
const DRIFT = {
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  willChange: "transform",
} as const;

const HeroGradient = () => (
  <Box position="absolute" inset="0" overflow="hidden" pointerEvents="none" aria-hidden="true">
    <Box
      position="absolute"
      inset="-30%"
      style={{ backgroundImage: "radial-gradient(40% 38% at 20% 38%, rgba(106,59,116,.7), transparent 70%), radial-gradient(46% 42% at 78% 80%, rgba(44,24,49,.85), transparent 72%)" }}
      sx={{
        "@keyframes heroDriftA": {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "30%": { transform: "translate3d(12%, 9%, 0) rotate(6deg)" },
          "70%": { transform: "translate3d(-11%, -7%, 0) rotate(-5deg)" },
        },
        animation: "heroDriftA 14s ease-in-out infinite alternate",
        ...DRIFT,
      }}
    />
    <Box
      position="absolute"
      inset="-30%"
      style={{ backgroundImage: "radial-gradient(48% 44% at 76% 24%, rgba(58,33,64,.9), transparent 70%), radial-gradient(38% 36% at 20% 78%, rgba(58,33,64,.7), transparent 70%)" }}
      sx={{
        "@keyframes heroDriftB": {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "40%": { transform: "translate3d(-11%, 10%, 0)" },
          "75%": { transform: "translate3d(9%, -9%, 0)" },
        },
        animation: "heroDriftB 11s ease-in-out infinite alternate",
        ...DRIFT,
      }}
    />
  </Box>
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
    <HeroGradient />
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
