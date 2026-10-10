import { Box, Flex, Grid, SimpleGrid, Text } from "@chakra-ui/react";
import Link from "next/link";
import { Eyebrow, Section } from "./ui";
import { BOT_LADDER, VS_BOT_HREF, proFeatures } from "./content";
import type { LandingFighter } from "./useLandingRoster";

/** /pro's skewed chip, so the hand-off to /pro looks like the same place. */
const skew = { transform: "skewX(-8deg)", "& > *": { transform: "skewX(8deg)" } };

const ProLink = ({ href, children, gold }: { href: string; children: React.ReactNode; gold?: boolean }) => (
  <Box
    as={Link}
    href={href}
    display="inline-flex"
    fontFamily="SpaceGrotesk"
    fontWeight={700}
    fontSize="0.9rem"
    letterSpacing="0.06em"
    textTransform="uppercase"
    px="1.4rem"
    py="0.75rem"
    bg={gold ? "brand.accent" : "transparent"}
    color={gold ? "brand.surfaceDim" : "brand.parchment"}
    border="1px solid"
    borderColor={gold ? "brand.accent" : "whiteAlpha.400"}
    _hover={{ bg: gold ? "brand.accentDeep" : "whiteAlpha.200" }}
    sx={skew}
  >
    <span>{children}</span>
  </Box>
);

/** Easy → Prodigy as a ladder of rising bars, the top rung in gold, labels underneath. */
const Ladder = () => (
  <Box mt="0.25rem" aria-label={`Bot tiers: ${BOT_LADDER.join(", ")}`} role="img">
    <Flex gap="4px" align="flex-end" aria-hidden="true">
      {BOT_LADDER.map((tier, i) => (
        <Box
          key={tier}
          flex="1"
          h={`${0.9 + i * 0.45}rem`}
          borderRadius="4px 4px 0 0"
          bg={i === BOT_LADDER.length - 1 ? "brand.accent" : `rgba(224,168,46,${0.22 + i * 0.1})`}
        />
      ))}
    </Flex>
    <Flex gap="4px" mt="0.3rem" aria-hidden="true">
      {BOT_LADDER.map((tier) => (
        <Text key={tier} flex="1" textAlign="center" fontSize="0.62rem" fontWeight={700} color="brand.primary">
          {tier}
        </Text>
      ))}
    </Flex>
  </Box>
);

/**
 * The live roster as a wrapped strip of name chips. Static on purpose: the
 * page's motion budget is the hero canvas, the card lift and the chooser.
 */
const Roster = ({ roster }: { roster: LandingFighter[] }) => (
  <Flex as="ul" listStyleType="none" m={0} p={0} wrap="wrap" gap="0.5rem">
    {roster.map((fighter) => (
      <Flex
        key={fighter.heroId}
        as="li"
        align="center"
        gap="0.4rem"
        px="0.75rem"
        py="0.45rem"
        borderRadius="0.5rem"
        bg="rgba(241,224,193,.08)"
        border="1px solid rgba(241,224,193,.14)"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="0.82rem"
        color="brand.parchment"
        whiteSpace="nowrap"
      >
        {fighter.name}
        {fighter.lab && (
          <Text as="span" fontSize="0.6rem" letterSpacing="0.1em" color="brand.accent">
            LAB
          </Text>
        )}
      </Flex>
    ))}
  </Flex>
);

/**
 * Section 5: the dark /pro look (League Gothic only here). Six feature tiles,
 * the bot ladder, and the live roster. The roster line and the
 * strip render only once the Pro server has answered.
 */
export const ProBand = ({ roster, proBoards }: { roster: LandingFighter[] | null; proBoards: string[] }) => {
  const ready = roster?.filter((f) => !f.lab).length ?? 0;
  const lab = roster ? roster.length - ready : 0;

  return (
    <Section id="pro" bg="brand.surfaceDim" color="brand.highlight">
      <Grid templateColumns={{ base: "1fr", md: "1.1fr .9fr" }} gap={{ base: "2rem", md: "2.5rem" }} alignItems="center" mb="2.5rem">
        <Box>
          <Eyebrow color="brand.accent">Unbrewed Pro · open beta</Eyebrow>
          <Box
            as="h2"
            id="pro-heading"
            fontFamily="LeagueGothic"
            fontWeight={400}
            fontSize={{ base: "3.5rem", md: "5.5rem" }}
            lineHeight="0.9"
            textTransform="uppercase"
            color="brand.parchment"
            mt="0.5rem"
          >
            The referee{" "}
            <Box as="span" color="brand.accent">
              is built in.
            </Box>
          </Box>
          <Text mt="1rem" maxW="52ch" fontSize="1.05rem" color="brand.primary">
            Full rules enforcement for Unmatched fan decks, in your browser. Only legal moves, combat math done
            for you, hands truly hidden.{" "}
            <Text as="strong" color="brand.parchment">
              Pick a fighter and go.
            </Text>{" "}
            The sandbox isn&apos;t going anywhere; Pro is an extra way to play.
          </Text>
          <Flex wrap="wrap" gap="0.75rem" mt="1.5rem">
            <ProLink href={VS_BOT_HREF} gold>
              Play vs a bot →
            </ProLink>
            <ProLink href="/pro/game?quick=1">⚡ Quick Match</ProLink>
            <ProLink href="/pro">Challenge a friend</ProLink>
          </Flex>
        </Box>
        <Box
          borderRadius="0.75rem"
          overflow="hidden"
          border="1px solid rgba(241,224,193,.15)"
          boxShadow="0 30px 60px -30px #000"
          transform={{ md: "rotate(1deg)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pro/hero/thrall-vs-batman-poster.webp"
            alt="A Pro match in the flat board view, with the combat panel and activity log open"
            width={1280}
            height={696}
            loading="lazy"
            decoding="async"
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        </Box>
      </Grid>

      <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing="0.9rem">
        {proFeatures(proBoards).map((feature, i) => (
          <Flex
            key={feature.title}
            direction="column"
            gap="0.5rem"
            p="1.1rem"
            borderRadius="0.75rem"
            bg="rgba(241,224,193,.06)"
            border="1px solid rgba(241,224,193,.12)"
            minW={0}
          >
            <Text as="h3" fontFamily="LeagueGothic" fontWeight={400} fontSize="1.7rem" letterSpacing="0.02em" textTransform="uppercase" color="brand.parchment">
              {feature.title}
            </Text>
            <Text fontSize="0.9rem" color="#D9C3A8">
              {feature.text}
            </Text>
            {i === 0 && <Ladder />}
          </Flex>
        ))}
      </SimpleGrid>

      {roster && roster.length > 0 && (
        <Box mt="2.25rem">
          <Flex justify="space-between" align="baseline" wrap="wrap" gap="0.5rem" mb="0.75rem">
            <Text as="h3" fontFamily="LeagueGothic" fontWeight={400} fontSize="2rem" letterSpacing="0.02em" textTransform="uppercase" color="brand.parchment">
              Choose your fighter
            </Text>
            <Text fontSize="0.85rem" color="#D9C3A8">
              {ready} battle-ready{lab > 0 ? ` · ${lab} in the lab` : ""} · new decks most weeks
            </Text>
          </Flex>
          <Roster roster={roster} />
        </Box>
      )}
    </Section>
  );
};
