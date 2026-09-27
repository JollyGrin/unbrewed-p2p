/**
 * Frame and small pieces shared by the two hero pages (issue #938): the page
 * shell (navbar over a full-width DarkBand), the back link, the This month /
 * All time toggle, band tiles, the crown glyph and the one-panel notice.
 */
import { ReactNode } from "react";
import { Box, Heading, Text } from "@chakra-ui/react";
import NextLink from "next/link";

import { PageSeo, SeoProps } from "@/components/Helmet/Head";
import { Navbar } from "@/components/Navbar";
import { StatsCaveat } from "@/components/Account/StatsCaveat";
import { DarkBand, DashCard } from "@/components/Stats";
import { BAND_INK, captionStyle, GOLD, INK, INK_DEEP, INK_SOFT, PAGE_BG } from "@/components/Stats/tokens";
import type { StatsWindow } from "@/lib/stats/types";

export const BAND_SOFT = "rgba(250,235,215,0.72)";

/** Navbar, the band, then the parchment content column, caveat last. */
export const HeroesFrame = ({
  seo,
  band,
  children,
}: {
  seo: SeoProps;
  band: ReactNode;
  children?: ReactNode;
}) => (
  <Box bg={PAGE_BG} minH="100svh" color={INK} display="flex" flexDirection="column" overflowX="hidden">
    <PageSeo {...seo} />
    <Box color="brand.secondary">
      <Navbar />
    </Box>
    <DarkBand variant="profile" gap={{ base: "16px", md: "24px" }}>
      {band}
    </DarkBand>
    <Box
      as="main"
      w="100%"
      maxW="1280px"
      mx="auto"
      p={{ base: "20px 16px 40px", md: "40px 48px 56px" }}
      display="flex"
      flexDirection="column"
      gap={{ base: "20px", md: "32px" }}
      minW={0}
    >
      {children}
      <StatsCaveat color={INK} />
    </Box>
  </Box>
);

/** Back link on the left, window toggle on the right; wraps on a phone. */
export const BandTopRow = ({ toggle }: { toggle?: ReactNode }) => (
  <Box display="flex" flexWrap="wrap" justifyContent="space-between" alignItems="center" gap="8px">
    <Box
      as={NextLink}
      href="/leaderboard"
      color="rgba(250,235,215,0.8)"
      fontSize="14px"
      fontWeight={500}
      minH="44px"
      display="flex"
      alignItems="center"
      textDecoration="underline"
      _hover={{ color: BAND_INK }}
    >
      Back to the leaderboard
    </Box>
    {toggle}
  </Box>
);

const WINDOWS: { value: StatsWindow; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

/** The leaderboard's pill pair, as links so the window lives in the URL. */
export const WindowToggle = ({
  value,
  hrefFor,
}: {
  value: StatsWindow;
  hrefFor: (window: StatsWindow) => string;
}) => (
  <Box as="nav" aria-label="Time window" display="flex" gap="8px">
    {WINDOWS.map((option) => {
      const active = option.value === value;
      return (
        <Box
          key={option.value}
          as={NextLink}
          href={hrefFor(option.value)}
          shallow
          scroll={false}
          aria-current={active ? "page" : undefined}
          data-testid={`window-${option.value}`}
          h="44px"
          px="20px"
          display="inline-flex"
          alignItems="center"
          borderRadius="22px"
          border={active ? "0" : "1px solid rgba(250,235,215,0.35)"}
          bg={active ? GOLD : "transparent"}
          color={active ? INK_DEEP : BAND_INK}
          fontWeight={active ? 700 : 500}
          fontSize="14px"
          whiteSpace="nowrap"
          _hover={{ bg: active ? GOLD : "rgba(250,235,215,0.08)" }}
        >
          {option.label}
        </Box>
      );
    })}
  </Box>
);

/** Gold uppercase line above the band's title. */
export const Kicker = ({ children }: { children: ReactNode }) => (
  <Box
    fontFamily="ArchivoNarrow"
    fontSize="14px"
    letterSpacing="0.12em"
    textTransform="uppercase"
    color={GOLD}
  >
    {children}
  </Box>
);

export const BandTitle = ({ children }: { children: ReactNode }) => (
  <Heading
    as="h1"
    m={0}
    fontFamily="LeagueGothic"
    fontWeight={400}
    fontSize={{ base: "56px", md: "104px" }}
    lineHeight={0.9}
    overflowWrap="anywhere"
  >
    {children}
  </Heading>
);

/** A bare band number over its caption (Hero.dc.html's header tiles). */
export const BandTile = ({ value, label }: { value: ReactNode; label: string }) => (
  <Box data-testid="band-tile" minW={0}>
    <Box
      fontFamily="LeagueGothic"
      fontSize={{ base: "40px", md: "48px" }}
      lineHeight={1}
      sx={{ fontVariantNumeric: "tabular-nums" }}
    >
      {value}
    </Box>
    <Box fontSize="13px" color={BAND_SOFT}>
      {label}
    </Box>
  </Box>
);

export const CrownGlyph = ({ size = 18, color = GOLD }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d="M3 18h18l1.5-10-5.5 4-5-7-5 7-5.5-4z" />
  </svg>
);

/** A small caption in the tables' uppercase style. */
export const Caption = (props: React.ComponentProps<typeof Box>) => (
  <Box {...captionStyle} color="rgba(72,40,79,0.72)" {...props} />
);

/** A one-card state: a heading, a sentence, the way onward. */
export const Notice = ({ title, children }: { title: string; children: ReactNode }) => (
  <DashCard title={title} as="h2">
    <Text fontSize="14px" lineHeight={1.45} color={INK_SOFT} m={0}>
      {children}
    </Text>
    <Box>
      <Box
        as={NextLink}
        href="/heroes"
        textDecoration="underline"
        fontSize="14px"
        fontWeight={500}
        minH="44px"
        display="inline-flex"
        alignItems="center"
      >
        See every hero
      </Box>
    </Box>
  </DashCard>
);
