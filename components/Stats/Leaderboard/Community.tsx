/**
 * The community half of the leaderboard dashboard (Main.dc.html), all fed by
 * `GET /community` (contract §2a): games per week, the table-talk split, the
 * most-played heroes with their crowns, and the hero-vs-hero match grid.
 * Each card renders nothing when its slice of the payload is `null` — today's
 * prod api 404s the route, and then none of these exist.
 */
import { useState } from "react";
import NextLink from "next/link";
import { Box, Button } from "@chakra-ui/react";

import {
  GRID_HERO_COUNT,
  HERO_TILE_COUNT,
  heroHref,
  humanVsExpertLine,
  mostPlayedPair,
  neverPlayedPair,
  pairSplitPhrase,
  topHeroes,
  winPercent,
} from "@/lib/stats/leaderboardDashboard";
import { MatchGridMode, matchupLookup, maxCellGames } from "@/lib/stats/matchGrid";
import { heroDisplayName, ROSTER_SIZE } from "@/lib/stats/roster";
import type { Community, CommunityHero, StatsWindow } from "@/lib/stats/types";

import { DashCard } from "../DashCard";
import { HeroToken } from "../HeroToken";
import { MatchGrid, MatchGridLegend } from "../MatchGrid";
import { ProgressBar } from "../ProgressBar";
import { SplitBar } from "../SplitBar";
import { StackedColumns } from "../StackedColumns";
import { captionStyle, GOLD, INK, INK_DEEP, INK_MUTED, INK_SOFT, RULE, WASH } from "../tokens";

const linkStyle = {
  fontWeight: 700,
  fontSize: "14px",
  minH: "44px",
  display: "flex",
  alignItems: "center",
  color: INK,
  textDecoration: "underline",
  _hover: { color: INK_DEEP },
};

export const GamesPlayedCard = ({ community }: { community: Community }) =>
  community.weekly && community.weekly.length > 0 ? (
    <DashCard title="Games played" subtitle={`Per week, last ${community.weekly.length} weeks, by who was across the table`} gap="18px">
      <StackedColumns weeks={community.weekly} />
    </DashCard>
  ) : null;

export const TableTalkCard = ({ community, window }: { community: Community; window: StatsWindow }) => {
  const totals = community.totals;
  if (!totals) return null;
  const line = humanVsExpertLine(community, window);
  return (
    <DashCard title={window === "month" ? "This month's table talk" : "All-time table talk"}>
      {totals.games === 0 ? (
        <Box fontSize="13px" color={INK_SOFT}>
          {window === "month" ? "No games finished this month yet." : "No games finished yet."}
        </Box>
      ) : (
        <SplitBar counts={totals} />
      )}
      {line && (
        <Box fontSize="13px" lineHeight={1.5} color={INK_SOFT} borderTop={RULE} pt="12px">
          {line}
        </Box>
      )}
    </DashCard>
  );
};

const Crown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#C48F1E" stroke="#8a6210" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 18h18l1.5-10-5.5 4-5-7-5 7-5.5-4z" />
  </svg>
);

const HeroTile = ({ hero, maxGames }: { hero: CommunityHero; maxGames: number }) => {
  const name = heroDisplayName(hero.heroId, hero.heroName);
  const pct = winPercent(hero.wins, hero.games);
  return (
    <Box
      as={NextLink}
      href={heroHref(hero.heroId)}
      data-testid="hero-tile"
      textDecoration="none"
      color={INK}
      display="flex"
      gap="14px"
      alignItems="center"
      p="14px"
      borderRadius="10px"
      bg={WASH}
      minW={0}
      _hover={{ bg: "rgba(72,40,79,0.1)", textDecoration: "none" }}
    >
      <HeroToken heroId={hero.heroId} heroName={hero.heroName} size={{ base: 64, md: 72 }} shadow decorative />
      <Box display="flex" flexDirection="column" gap="6px" minW={0} flexGrow={1}>
        <Box fontWeight={700} fontSize="16px" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
          {name}
        </Box>
        <ProgressBar value={hero.games / Math.max(1, maxGames)} label={`${name} usage`} color={INK} />
        <Box fontSize="12px" color={INK_SOFT}>
          {hero.games.toLocaleString("en-US")} {hero.games === 1 ? "game" : "games"} · {pct}% wins
        </Box>
        <Box display="flex" gap="6px" alignItems="center" fontSize="12px" fontWeight={700} minW={0}>
          <Crown />
          <Box as="span" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" color={hero.crown ? INK : INK_MUTED}>
            {hero.crown ? hero.crown.username : "Unclaimed"}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export const HeroesInPlayCard = ({ community, window }: { community: Community; window: StatsWindow }) => {
  if (!community.heroes) return null;
  const heroes = topHeroes(community.heroes, HERO_TILE_COUNT);
  const maxGames = heroes[0]?.games ?? 0;
  return (
    <DashCard
      title="Heroes in play"
      subtitle={`Most played ${window === "month" ? "this month" : "of all time"}. The crown goes to whoever has the most wins on that hero.`}
      gap="20px"
      action={
        <Box as={NextLink} href="/heroes" {...linkStyle}>
          All {ROSTER_SIZE} heroes
        </Box>
      }
    >
      {heroes.length === 0 ? (
        <Box fontSize="13px" color={INK_SOFT}>
          {window === "month" ? "No hero has been played this month yet." : "No hero has been played yet."}
        </Box>
      ) : (
        <Box
          display="grid"
          gridTemplateColumns={{ base: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }}
          gap={{ base: "10px", md: "16px" }}
        >
          {heroes.map((hero) => (
            <HeroTile key={hero.heroId} hero={hero} maxGames={maxGames} />
          ))}
        </Box>
      )}
    </DashCard>
  );
};

const GridToggle = ({ mode, onChange }: { mode: MatchGridMode; onChange: (m: MatchGridMode) => void }) => (
  <Box display="flex" gap="8px" flexWrap="wrap" role="group" aria-label="Match grid shows">
    {(["games", "winRate"] as const).map((m) => (
      <Button
        key={m}
        onClick={() => onChange(m)}
        aria-pressed={mode === m}
        h="44px"
        px="18px"
        borderRadius="22px"
        border={`1px solid ${INK}`}
        bg={mode === m ? INK : "transparent"}
        color={mode === m ? "#FAEBD7" : INK}
        _hover={{ bg: mode === m ? INK_DEEP : "rgba(72,40,79,0.08)" }}
        _active={{ bg: mode === m ? INK_DEEP : "rgba(72,40,79,0.12)" }}
        fontSize="14px"
        fontWeight={700}
      >
        {m === "games" ? "Games played" : "Win rate"}
      </Button>
    ))}
  </Box>
);

const SidePanel = ({ caption, title, children }: { caption: string; title: string; children?: React.ReactNode }) => (
  <Box p="16px" borderRadius="10px" bg={WASH} display="flex" flexDirection="column" gap="4px">
    <Box {...captionStyle} color={INK_MUTED}>
      {caption}
    </Box>
    <Box fontWeight={700} fontSize="16px">
      {title}
    </Box>
    {children}
  </Box>
);

export const MatchGridCard = ({ community }: { community: Community }) => {
  const [mode, setMode] = useState<MatchGridMode>("games");
  if (!community.heroes || !community.matchups) return null;
  const heroes = topHeroes(community.heroes, GRID_HERO_COUNT);
  if (heroes.length < 2) return null;

  const ids = heroes.map((h) => h.heroId);
  const lookup = matchupLookup(community.matchups);
  const maxGames = maxCellGames(ids, ids, lookup);
  const busiest = mostPlayedPair(heroes, community.matchups);
  const empty = neverPlayedPair(heroes, community.matchups);
  const name = (h: CommunityHero) => heroDisplayName(h.heroId, h.heroName);
  const gridHeroes = heroes.map((h) => ({ heroId: h.heroId, heroName: h.heroName }));

  return (
    <DashCard
      title="Match grid"
      subtitle={
        mode === "games"
          ? "How often each pair of heroes has met. Darker squares are well-trodden, pale ones are waiting for you."
          : "How the row hero fares against the column hero. Green favours the row, red the column."
      }
      gap="20px"
      action={<GridToggle mode={mode} onChange={setMode} />}
    >
      <Box display="flex" flexDirection={{ base: "column", lg: "row" }} gap={{ base: "20px", lg: "32px" }} alignItems={{ base: "stretch", lg: "flex-start" }} minW={0}>
        <Box minW={0} maxW="100%">
          <MatchGrid
            rows={gridHeroes}
            cols={gridHeroes}
            lookup={lookup}
            mode={mode}
            caption={mode === "games" ? "Games between each pair of the most played heroes" : "Row hero win rate against each column hero"}
          />
        </Box>
        <Box flexGrow={1} display="flex" flexDirection="column" gap="16px" minW={0}>
          <MatchGridLegend
            mode={mode}
            maxGames={maxGames}
            title={mode === "games" ? "Games between the pair" : "Row hero win rate"}
          />
          {busiest && (
            <SidePanel caption="Most played matchup" title={`${name(busiest.a)} vs ${name(busiest.b)}`}>
              <Box fontSize="13px" color={INK_SOFT}>
                {pairSplitPhrase(busiest)}
              </Box>
            </SidePanel>
          )}
          {empty && (
            <SidePanel caption="Never been played" title={`${name(empty[0])} vs ${name(empty[1])}`}>
              <Box fontSize="13px" color={INK_SOFT}>
                Be the first to fill this square.
              </Box>
              <Box
                as={NextLink}
                href="/pro"
                alignSelf="flex-start"
                mt="8px"
                minH="44px"
                display="flex"
                alignItems="center"
                px="18px"
                borderRadius="22px"
                bg={GOLD}
                color={INK_DEEP}
                fontWeight={700}
                fontSize="14px"
                textDecoration="none"
                _hover={{ bg: "#C48F1E", textDecoration: "none" }}
              >
                Play this matchup
              </Box>
            </SidePanel>
          )}
        </Box>
      </Box>
    </DashCard>
  );
};
