import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import Link from "next/link";
import { BADGE_ART, BadgeGlyph, MAX_WORN_BADGES } from "@/components/Badges/BadgeGlyph";
import { COSMETIC_RIM_PAINTS, COSMETIC_RIM_TIERS } from "@/lib/pro/cosmetics";
import { SIZES } from "@/lib/tournaments/createForm";
import { Eyebrow, H2, Section } from "./ui";
import { TOURNAMENT_SIZES_TEXT } from "./content";

/** Our own deck's cardback (King Taranis) — the rims are shown on a real card. */
const CARDBACK = "/cardbacks/taranis.webp";

/** A handful of the real badges, straight from the badge art catalog. */
const SHOWCASE_BADGES = Object.keys(BADGE_ART).slice(0, 6);

const Card = ({ children }: { children: React.ReactNode }) => (
  <Flex
    direction="column"
    gap="0.8rem"
    p="1.35rem"
    bg="#FFF6E8"
    border="1px solid rgba(72,40,79,.18)"
    borderRadius="0.9rem"
    boxShadow="0 10px 24px -12px rgba(44,24,49,.45)"
    minW={0}
  >
    {children}
  </Flex>
);

const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <Text as="h3" fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.2rem">
    {children}
  </Text>
);

const SmallLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Box
    as={Link}
    href={href}
    alignSelf="flex-start"
    mt="auto"
    fontFamily="SpaceGrotesk"
    fontWeight={700}
    fontSize="0.88rem"
    border="1.5px solid"
    borderRadius="0.5rem"
    px="0.8rem"
    py="0.45rem"
    _hover={{ bg: "brand.secondary", color: "brand.highlight", borderColor: "brand.secondary" }}
  >
    {children}
  </Box>
);

/** A first-round bracket, drawn from the smallest single-elimination size. */
const BracketSketch = () => {
  const seeds = Array.from({ length: SIZES[0] }, (_, i) => i + 1);
  const slot = (label: string, winner?: boolean) => (
    <Box
      key={label}
      fontSize="0.75rem"
      fontWeight={600}
      bg="brand.highlight"
      borderRadius="0.35rem"
      px="0.5rem"
      py="0.35rem"
      borderLeft="3px solid"
      borderLeftColor={winner ? "brand.positive" : "rgba(72,40,79,.35)"}
    >
      {label}
    </Box>
  );
  return (
    <Grid templateColumns="1fr 1fr 1fr" gap="0.4rem" alignItems="center" aria-hidden="true">
      <Grid gap="0.35rem">{seeds.map((s) => slot(`Seed ${s}`, s % 2 === 1))}</Grid>
      <Grid gap="0.35rem">{seeds.filter((s) => s % 2 === 1).map((s) => slot(`Seed ${s}`))}</Grid>
      <Grid>{slot("Champion")}</Grid>
    </Grid>
  );
};

/** Section 6: cosmetics, badges + leaderboard, tournaments. */
export const Progression = () => (
  <Section id="compete">
    <Eyebrow>Play, earn, show off</Eyebrow>
    <H2 id="compete">Every Pro game counts for something.</H2>
    <Text mt="0.75rem" maxW="62ch" fontSize="1.05rem" opacity={0.85}>
      Sign in with Discord and finished Pro games earn XP, badges and cosmetic points. Nothing you unlock
      changes a card, a rule or a result.
    </Text>
    <Grid templateColumns={{ base: "1fr", lg: "1.2fr 1fr 1fr" }} gap="1.1rem" mt="1.75rem">
      <Card>
        <CardTitle>Cosmetics you earn by playing</CardTitle>
        <Text fontSize="0.92rem" opacity={0.85}>
          Points go to the hero you piloted. Spend them on card rims and token rims, bronze to iridescent.
        </Text>
        <Flex gap="0.9rem" justify="space-between" align="flex-end" mt="0.25rem">
          {COSMETIC_RIM_TIERS.map((tier) => (
            <Flex key={tier} direction="column" align="center" gap="0.4rem" flex="1">
              <Box p="3px" borderRadius="7px" bg={COSMETIC_RIM_PAINTS[tier].ring} boxShadow="0 6px 12px -6px rgba(0,0,0,.6)" w="100%" maxW="4rem">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={CARDBACK}
                  alt=""
                  width={928}
                  height={1232}
                  loading="lazy"
                  style={{ display: "block", width: "100%", height: "auto", borderRadius: "5px" }}
                />
              </Box>
              <Text fontSize="0.65rem" fontWeight={700} letterSpacing="0.06em" textTransform="uppercase" opacity={0.7} textAlign="center">
                {COSMETIC_RIM_PAINTS[tier].label}
              </Text>
            </Flex>
          ))}
        </Flex>
        <SmallLink href="/collection">Your collection</SmallLink>
      </Card>

      <Card>
        <CardTitle>Levels, badges, leaderboard</CardTitle>
        <Text fontSize="0.92rem" opacity={0.85}>
          XP per game, more for wins and for tougher opponents. Wear up to {MAX_WORN_BADGES} badges on your
          profile, and climb the leaderboard and each hero&apos;s ladder.
        </Text>
        <Flex as="ul" listStyleType="none" m={0} p={0} wrap="wrap" gap="0.5rem">
          {SHOWCASE_BADGES.map((id) => (
            <Flex as="li" key={id} align="center" gap="0.4rem" bg="brand.highlight" borderRadius="0.5rem" pl="0.25rem" pr="0.6rem" py="0.2rem">
              <BadgeGlyph id={id} size="1.6rem" />
              <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="0.8rem">
                {BADGE_ART[id].name}
              </Text>
            </Flex>
          ))}
        </Flex>
        <SmallLink href="/leaderboard">See the leaderboard</SmallLink>
      </Card>

      <Card>
        <CardTitle>Run your own tournament</CardTitle>
        <Text fontSize="0.92rem" opacity={0.85}>
          Pick {TOURNAMENT_SIZES_TEXT}. Share one link; players ready up and play on their own time. Results
          and replays land on the bracket.
        </Text>
        <BracketSketch />
        <SmallLink href="/tournaments">Browse tournaments</SmallLink>
      </Card>
    </Grid>
  </Section>
);
