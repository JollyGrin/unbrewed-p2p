/**
 * `/heroes` — every hero on the public Pro roster (issue #938), each linking
 * to its ladder. Numbers come from `GET /community?window=`; without them
 * (today's prod api 404s the route) the grid is still the roster, just
 * without games or crowns, rather than claiming every hero is unplayed.
 */
import { Box } from "@chakra-ui/react";
import NextLink from "next/link";

import { HeroToken } from "@/components/Stats";
import { INK, INK_SOFT, PARCHMENT } from "@/components/Stats/tokens";
import { formatRate, heroesHref, heroIndexRows, HeroIndexRow } from "@/lib/stats/heroPage";
import { useCommunity } from "@/lib/stats/hooks";
import { ROSTER_SIZE } from "@/lib/stats/roster";
import type { StatsWindow } from "@/lib/stats/types";

import { BandTitle, BandTopRow, BAND_SOFT, CrownGlyph, HeroesFrame, Kicker, WindowToggle } from "./parts";

const HeroCard = ({
  row,
  window,
  withNumbers,
}: {
  row: HeroIndexRow;
  window: StatsWindow;
  withNumbers: boolean;
}) => {
  const dim = withNumbers && !row.played;
  return (
    <Box
      as={NextLink}
      href={heroesHref(row.heroId, window)}
      data-testid="hero-card"
      data-hero={row.heroId}
      data-played={withNumbers ? String(row.played) : undefined}
      display="flex"
      gap="14px"
      alignItems="center"
      p="14px"
      minH="92px"
      bg={PARCHMENT}
      color={INK}
      borderRadius="12px"
      boxShadow={dim ? "none" : "0 2px 8px rgba(20,8,24,0.25)"}
      border={dim ? "1px dashed rgba(72,40,79,0.25)" : "1px solid transparent"}
      opacity={dim ? 0.75 : 1}
      minW={0}
      _hover={{ boxShadow: "0 4px 12px rgba(20,8,24,0.3)", opacity: 1 }}
    >
      <HeroToken heroId={row.heroId} heroName={row.name} size={64} muted={dim} decorative />
      <Box minW={0} display="flex" flexDirection="column" gap="2px">
        <Box fontWeight={700} fontSize="16px" lineHeight={1.2}>
          {row.name}
        </Box>
        {withNumbers && (
          <>
            <Box fontSize="13px" color={INK_SOFT} sx={{ fontVariantNumeric: "tabular-nums" }}>
              {row.played
                ? `${row.games.toLocaleString("en-US")} ${row.games === 1 ? "game" : "games"} · ${formatRate(row.rate)} win rate`
                : window === "month"
                  ? "Not played this month"
                  : "Not played yet"}
            </Box>
            <Box display="flex" gap="6px" alignItems="center" fontSize="13px" color={INK_SOFT} minW={0}>
              {row.crown ? (
                <>
                  <CrownGlyph size={14} color="#C48F1E" />
                  <Box as="span" fontWeight={700} color={INK} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                    {row.crown.username}
                  </Box>
                </>
              ) : (
                "Unclaimed"
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export const HeroIndex = ({ window }: { window: StatsWindow }) => {
  const community = useCommunity(window);
  const heroes = community.status === "ready" ? community.data?.heroes ?? null : null;
  const rows = heroIndexRows(heroes);
  const withNumbers = heroes !== null;

  return (
    <HeroesFrame
      seo={{
        path: "/heroes",
        title: "Heroes | Unbrewed",
        description: "Every hero on Unbrewed Pro: games played, win rates and who holds each crown.",
      }}
      band={
        <>
          <BandTopRow toggle={<WindowToggle value={window} hrefFor={(w) => heroesHref(null, w)} />} />
          <Kicker>Unbrewed Pro</Kicker>
          <BandTitle>Heroes</BandTitle>
          <Box fontSize="16px" lineHeight={1.5} color="rgba(250,235,215,0.78)" maxW="640px">
            All {ROSTER_SIZE} heroes on the Pro roster. The crown goes to whoever has the most wins on
            that hero.
          </Box>
          {community.status === "unavailable" && (
            <Box data-testid="community-unavailable" fontSize="14px" color={BAND_SOFT}>
              Hero numbers are unavailable right now. Every hero still links to its page.
            </Box>
          )}
        </>
      }
    >
      <Box
        as="ul"
        listStyleType="none"
        m={0}
        p={0}
        display="grid"
        gridTemplateColumns={{ base: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }}
        gap={{ base: "12px", md: "16px" }}
      >
        {rows.map((row) => (
          <Box as="li" key={row.heroId} minW={0} display="flex" flexDirection="column">
            <HeroCard row={row} window={window} withNumbers={withNumbers} />
          </Box>
        ))}
      </Box>
    </HeroesFrame>
  );
};
