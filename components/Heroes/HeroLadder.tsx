/**
 * `/heroes?h=<heroId>` — one hero's ladder (issue #938, mockup Hero.dc.html).
 *
 * Three reads: `GET /heroes?h=&window=` for the hero, `GET /community?window=month`
 * only to know whether this hero is the month's most played (the kicker), and —
 * for a signed-in viewer — their own `GET /players?u=` for the hero-rank track.
 * Every section renders nothing when its data didn't arrive (today's prod api
 * 404s `/heroes`), so against prod the page is still the hero's name, token and
 * the viewer's own rank track.
 */
import { useState } from "react";
import { Box, Button, Text } from "@chakra-ui/react";
import NextLink from "next/link";

import { DashCard, HeroToken, ProgressBar, SplitBar } from "@/components/Stats";
import { GOLD, GOLD_DEEP, INK, INK_SOFT, RULE } from "@/components/Stats/tokens";
import { profileHref } from "@/lib/account/publicProfile";
import { useAccount } from "@/lib/account/useAccount";
import {
  collapsedMatchups,
  crownLine,
  formatRate,
  gamesOnHero,
  heroesHref,
  heroRankTrack,
  isMostPlayed,
  MATCHUPS_SHOWN,
  matchupBars,
  MatchupBar,
  pilotGapLine,
  pilotRows,
  PilotRow,
  shareOfAllGames,
  winRate,
} from "@/lib/stats/heroPage";
import { useCommunity, useHeroStats, useStatsPlayer } from "@/lib/stats/hooks";
import { heroDisplayName, isRosterHero } from "@/lib/stats/roster";
import type { HeroStats, KindCounts, StatsWindow } from "@/lib/stats/types";

import {
  BandTile,
  BandTitle,
  BandTopRow,
  BAND_SOFT,
  Caption,
  CrownGlyph,
  HeroesFrame,
  Kicker,
  Notice,
  WindowToggle,
} from "./parts";

const windowPhrase = (window: StatsWindow) => (window === "month" ? "this month" : "all time");

// --- band --------------------------------------------------------------------

const CrownCard = ({ hero, name }: { hero: HeroStats; name: string }) => (
  <Box
    data-testid="crown-card"
    w={{ base: "100%", lg: "300px" }}
    flexShrink={0}
    boxSizing="border-box"
    p={{ base: "16px", md: "22px" }}
    borderRadius="14px"
    bg="rgba(224,168,46,0.14)"
    border={`1px solid ${GOLD}`}
    display="flex"
    flexDirection="column"
    gap="8px"
  >
    <Box
      display="flex"
      gap="8px"
      alignItems="center"
      fontFamily="ArchivoNarrow"
      fontSize="12px"
      letterSpacing="0.08em"
      textTransform="uppercase"
      color={GOLD}
    >
      <CrownGlyph />
      Crown holder
    </Box>
    {hero.crown ? (
      <>
        <Box
          as={NextLink}
          href={profileHref(hero.crown.username)}
          fontSize="26px"
          fontWeight={700}
          alignSelf="flex-start"
          minH="44px"
          display="flex"
          alignItems="center"
          overflowWrap="anywhere"
          _hover={{ textDecoration: "underline" }}
        >
          {hero.crown.username}
        </Box>
        <Box fontSize="14px" color="rgba(250,235,215,0.78)" lineHeight={1.45}>
          {crownLine(hero.crown)}
        </Box>
      </>
    ) : (
      <Box fontSize="14px" color="rgba(250,235,215,0.78)" lineHeight={1.45}>
        Unclaimed. Win a game with {name} to take it.
      </Box>
    )}
  </Box>
);

const HeaderTiles = ({ hero }: { hero: HeroStats }) => {
  const share = shareOfAllGames(hero.games, hero.totalHumanSeatGames);
  return (
    <Box
      display={{ base: "grid", md: "flex" }}
      gridTemplateColumns="repeat(2, minmax(0, 1fr))"
      gap={{ base: "16px", md: "36px" }}
    >
      <BandTile value={hero.games.toLocaleString("en-US")} label={hero.games === 1 ? "game" : "games"} />
      <BandTile value={formatRate(winRate(hero.wins, hero.games))} label="win rate" />
      {share !== null && <BandTile value={`${share}%`} label="of all games" />}
      {hero.pilotCount !== null && (
        <BandTile value={hero.pilotCount.toLocaleString("en-US")} label={hero.pilotCount === 1 ? "pilot" : "pilots"} />
      )}
    </Box>
  );
};

// --- your hero rank ----------------------------------------------------------

const YourRank = ({ heroId, name, games }: { heroId: string; name: string; games: number }) => {
  const track = heroRankTrack(games, name);
  return (
    <DashCard>
      <Box
        data-testid="your-hero-rank"
        display="flex"
        flexDirection={{ base: "column", lg: "row" }}
        alignItems={{ base: "stretch", lg: "center" }}
        gap={{ base: "16px", lg: "40px" }}
      >
        <Box w={{ base: "100%", lg: "300px" }} flexShrink={0} display="flex" flexDirection="column" gap="4px">
          <Box as="h2" m={0} fontSize="22px" fontWeight={700}>
            Your hero rank
          </Box>
          <Box fontSize="14px" lineHeight={1.45} color={INK_SOFT}>
            {track.sentence}
          </Box>
        </Box>
        <Box flexGrow={1} minW={0} display="flex" flexDirection="column" gap="10px">
          <ProgressBar value={track.fill / 100} height={12} color={GOLD_DEEP} label={`Hero rank progress on ${name}`} />
          <Box display="grid" gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap={{ base: "8px", md: "12px" }} fontSize="13px">
            {track.steps.map((step) => (
              <Box key={step.name} minW={0}>
                <Box fontWeight={700}>{step.name}</Box>
                <Box color={INK_SOFT}>{step.caption}</Box>
              </Box>
            ))}
          </Box>
        </Box>
        <Box
          as={NextLink}
          href="/pro"
          data-testid="play-hero"
          data-hero={heroId}
          minH="48px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          px="24px"
          borderRadius="24px"
          bg={INK}
          color="#FAEBD7"
          fontWeight={700}
          fontSize="15px"
          flexShrink={0}
          alignSelf={{ base: "flex-start", lg: "center" }}
          _hover={{ bg: "#2C1831" }}
        >
          Play {name}
        </Box>
      </Box>
    </DashCard>
  );
};

// --- top pilots --------------------------------------------------------------

const PILOT_COLUMNS = {
  base: "28px minmax(0, 1fr) 40px 48px 48px",
  md: "40px minmax(0, 1fr) 72px 72px 72px",
};

const PilotLine = ({ row }: { row: PilotRow }) => (
  <Box
    as={NextLink}
    href={profileHref(row.username)}
    data-testid="pilot-row"
    display="grid"
    gridTemplateColumns={PILOT_COLUMNS}
    gap={{ base: "8px", md: "12px" }}
    alignItems="center"
    minH="56px"
    px={{ base: "8px", md: "12px" }}
    borderRadius="8px"
    bg={row.you ? "rgba(72,40,79,0.1)" : "transparent"}
    color={INK}
    textDecoration="none"
    sx={{ fontVariantNumeric: "tabular-nums" }}
    _hover={{ bg: row.you ? "rgba(72,40,79,0.14)" : "rgba(72,40,79,0.05)" }}
  >
    <Box fontFamily="LeagueGothic" fontSize={{ base: "24px", md: "30px" }}>
      {row.rank}
    </Box>
    <Box display="flex" flexDirection="column" minW={0}>
      <Box display="flex" gap="8px" alignItems="center" minW={0}>
        <Box as="span" fontWeight={700} fontSize="16px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {row.username}
        </Box>
        {row.you && (
          <Box
            as="span"
            fontFamily="ArchivoNarrow"
            fontSize="11px"
            fontWeight={700}
            letterSpacing="0.08em"
            bg={INK}
            color="#FAEBD7"
            px="6px"
            py="2px"
            borderRadius="4px"
            flexShrink={0}
          >
            YOU
          </Box>
        )}
      </Box>
      {row.tier && (
        <Box fontSize="12px" color={INK_SOFT}>
          {row.tier}
        </Box>
      )}
    </Box>
    <Box textAlign="right" fontWeight={700}>
      {row.wins}
    </Box>
    <Box textAlign="right">{row.games}</Box>
    <Box textAlign="right">{formatRate(row.rate)}</Box>
  </Box>
);

const TopPilots = ({
  hero,
  name,
  viewer,
}: {
  hero: HeroStats & { pilots: NonNullable<HeroStats["pilots"]> };
  name: string;
  viewer: string | null;
}) => {
  const rows = pilotRows(hero.pilots, viewer);
  const gap = pilotGapLine(rows);
  return (
    <DashCard title="Top pilots" subtitle="Ranked by wins with this hero" gap="8px">
      {rows.length === 0 ? (
        <Text data-testid="pilots-empty" m={0} fontSize="14px" lineHeight={1.45} color={INK_SOFT} py="8px">
          {hero.games === 0
            ? `Nobody has played ${name} ${hero.window === "month" ? "this month" : "yet"}. Win a game with ${name} while signed in to top this list.`
            : `No signed-in pilots for ${name} ${windowPhrase(hero.window)} yet. Sign in and win a game with ${name} to top this list.`}
        </Text>
      ) : (
        <>
          <Box
            role="presentation"
            display="grid"
            gridTemplateColumns={PILOT_COLUMNS}
            gap={{ base: "8px", md: "12px" }}
            p={{ base: "12px 8px 8px", md: "12px 12px 8px" }}
            fontFamily="ArchivoNarrow"
            fontSize="12px"
            letterSpacing="0.06em"
            textTransform="uppercase"
            color="rgba(72,40,79,0.72)"
            borderBottom={RULE}
          >
            <div>#</div>
            <div>Pilot</div>
            <Box textAlign="right">Wins</Box>
            <Box textAlign="right">Games</Box>
            <Box textAlign="right">Win %</Box>
          </Box>
          <Box display="flex" flexDirection="column">
            {rows.map((row) => (
              <PilotLine key={row.username} row={row} />
            ))}
          </Box>
          {gap && (
            <Box data-testid="pilot-gap" fontSize="13px" color={INK_SOFT} p={{ base: "12px 8px", md: "12px" }}>
              {gap}
            </Box>
          )}
        </>
      )}
    </DashCard>
  );
};

// --- matchups ----------------------------------------------------------------

const NAME_W = { base: "84px", md: "130px" };
const RATE_W = "46px";

const MatchupLine = ({ bar }: { bar: MatchupBar }) => (
  <Box
    data-testid="matchup-row"
    title={bar.tip}
    aria-label={`${bar.name}: ${bar.tip}`}
    role="listitem"
    display="flex"
    gap="10px"
    alignItems="center"
    minH="40px"
  >
    <HeroToken heroId={bar.opponentHeroId} heroName={bar.name} size={36} decorative />
    <Box w={NAME_W} flexShrink={0} fontSize="14px" fontWeight={500} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
      {bar.name}
    </Box>
    <Box flexGrow={1} minW={0} display="flex" h="16px">
      <Box w="50%" display="flex" justifyContent="flex-end" borderRight="1px solid rgba(72,40,79,0.45)">
        {bar.side === "loss" && <Box w={`${bar.width}%`} h="16px" bg="brand.danger" borderRadius="4px 0 0 4px" />}
      </Box>
      <Box w="50%">
        {bar.side === "win" && <Box w={`${bar.width}%`} h="16px" bg="brand.positive" borderRadius="0 4px 4px 0" />}
      </Box>
    </Box>
    <Box w={RATE_W} flexShrink={0} textAlign="right" fontSize="14px" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
      {bar.rate}%
    </Box>
  </Box>
);

const Matchups = ({ bars, name }: { bars: MatchupBar[]; name: string }) => {
  const [expanded, setExpanded] = useState(false);
  const { top, bottom } = collapsedMatchups(bars);
  return (
    <DashCard
      title="Matchups"
      subtitle={`Win rate against each hero, measured from an even 50%. Counts every game with ${name} at the table, bot seats included.`}
    >
      <Box display="flex" gap="10px" aria-hidden="true">
        <Box w={{ base: "130px", md: "176px" }} flexShrink={0} />
        {/* A phone's bar area is too narrow for all three words: keep the 50% axis. */}
        <Caption flexGrow={1} minW={0} display="flex" justifyContent={{ base: "center", md: "space-between" }}>
          <Box as="span" display={{ base: "none", md: "inline" }}>
            Struggles
          </Box>
          <span>50%</span>
          <Box as="span" display={{ base: "none", md: "inline" }}>
            Thrives
          </Box>
        </Caption>
        <Box w={RATE_W} flexShrink={0} />
      </Box>
      <Box role="list" display="flex" flexDirection="column" gap="6px">
        {expanded ? (
          bars.map((bar) => <MatchupLine key={bar.opponentHeroId} bar={bar} />)
        ) : (
          <>
            {top.map((bar) => (
              <MatchupLine key={bar.opponentHeroId} bar={bar} />
            ))}
            {bottom.length > 0 && <Box data-testid="matchup-divider" role="separator" h="1px" my="2px" bg={RULE} />}
            {bottom.map((bar) => (
              <MatchupLine key={bar.opponentHeroId} bar={bar} />
            ))}
          </>
        )}
      </Box>
      {bars.length > MATCHUPS_SHOWN && (
        <Button
          alignSelf="flex-start"
          variant="ghost"
          h="44px"
          px="12px"
          color={INK}
          fontSize="14px"
          fontWeight={700}
          textDecoration="underline"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          {expanded ? "Show fewer" : `Show all ${bars.length}`}
        </Button>
      )}
    </DashCard>
  );
};

// --- across the table --------------------------------------------------------

const AcrossTheTable = ({ counts, name, window }: { counts: KindCounts; name: string; window: StatsWindow }) => (
  <DashCard>
    <Box
      data-testid="across-the-table"
      display="flex"
      flexDirection={{ base: "column", lg: "row" }}
      alignItems={{ base: "stretch", lg: "center" }}
      gap={{ base: "16px", lg: "40px" }}
    >
      <Box w={{ base: "100%", lg: "300px" }} flexShrink={0} display="flex" flexDirection="column" gap="4px">
        <Box as="h2" m={0} fontSize="22px" fontWeight={700}>
          Across the table
        </Box>
        <Box fontSize="14px" lineHeight={1.45} color={INK_SOFT}>
          Who {name} was played against {windowPhrase(window)}.
        </Box>
      </Box>
      <Box flexGrow={1} minW={0}>
        <SplitBar counts={counts} variant="legend" />
      </Box>
    </Box>
  </DashCard>
);

// --- page --------------------------------------------------------------------

export const HeroLadder = ({ heroId, window }: { heroId: string; window: StatsWindow }) => {
  const known = isRosterHero(heroId);
  const hero = useHeroStats(known ? heroId : null, window);
  const month = useCommunity("month");
  const { account } = useAccount();
  const viewer = account?.username ?? null;
  const mine = useStatsPlayer(known ? viewer : null);

  const toggle = <WindowToggle value={window} hrefFor={(w) => heroesHref(heroId, w)} />;

  if (!known) {
    return (
      <HeroesFrame
        seo={{ path: "/heroes", title: "Heroes | Unbrewed", noindex: true }}
        band={
          <>
            <BandTopRow />
            <Kicker>Hero ladder</Kicker>
            <BandTitle>Heroes</BandTitle>
          </>
        }
      >
        <Notice title="No hero by that name">
          There is no hero called{" "}
          <Box as="code" fontWeight={600}>
            {heroId}
          </Box>{" "}
          on the Pro roster. Check the address, or pick a hero from the full list.
        </Notice>
      </HeroesFrame>
    );
  }

  const data = hero.status === "ready" ? hero.data : null;
  const name = heroDisplayName(heroId, data?.heroName);
  const mostPlayed = month.status === "ready" && isMostPlayed(heroId, month.data?.heroes ?? null);
  const bars = data?.matchups ? matchupBars(data.matchups) : [];
  const kinds = data?.byOpponentKind ?? null;
  const kindSum = kinds ? kinds.human + kinds.hardExpert + kinds.casual : 0;
  const pilots = data?.pilots ?? null;
  const myGames = mine.status === "ready" && mine.data ? gamesOnHero(mine.data.stats.byHero, heroId) : null;

  return (
    <HeroesFrame
      seo={{
        path: heroesHref(heroId, "month"),
        title: `${name} hero ladder | Unbrewed`,
        description: `${name} on Unbrewed Pro: games, win rate, the crown holder, top pilots and matchups.`,
        noindex: true,
      }}
      band={
        <>
          <BandTopRow toggle={toggle} />
          <Box
            display="flex"
            flexDirection={{ base: "column", lg: "row" }}
            gap={{ base: "20px", lg: "40px" }}
            alignItems={{ base: "flex-start", lg: "center" }}
          >
            <HeroToken heroId={heroId} heroName={name} size={{ base: 120, md: 200 }} ring={{ color: GOLD, width: 5 }} />
            <Box flexGrow={1} minW={0} display="flex" flexDirection="column" gap="16px">
              <Kicker>Hero ladder{mostPlayed ? " · most played this month" : ""}</Kicker>
              <BandTitle>{name}</BandTitle>
              {data && <HeaderTiles hero={data} />}
              {data && window === "month" && data.games === 0 && (
                <Box
                  as={NextLink}
                  href={heroesHref(heroId, "all")}
                  data-testid="empty-month-nudge"
                  fontSize="13px"
                  color={BAND_SOFT}
                  textDecoration="underline"
                  alignSelf="flex-start"
                  minH="44px"
                  display="flex"
                  alignItems="center"
                >
                  No one played {name} this month. See all time
                </Box>
              )}
              {hero.status === "unavailable" && (
                <Box data-testid="hero-unavailable" fontSize="14px" color={BAND_SOFT}>
                  Hero numbers are unavailable right now. Try again later.
                </Box>
              )}
            </Box>
            {data && <CrownCard hero={data} name={name} />}
          </Box>
        </>
      }
    >
      {myGames !== null && <YourRank heroId={heroId} name={name} games={myGames} />}
      {(pilots || bars.length > 0) && (
        <Box
          display="flex"
          flexDirection={{ base: "column", lg: "row" }}
          gap={{ base: "20px", md: "32px" }}
          alignItems={{ base: "stretch", lg: "flex-start" }}
        >
          {data && pilots && (
            <Box w={{ base: "100%", lg: bars.length > 0 ? "640px" : "100%" }} flexShrink={0} minW={0}>
              <TopPilots hero={{ ...data, pilots }} name={name} viewer={viewer} />
            </Box>
          )}
          {bars.length > 0 && (
            <Box flexGrow={1} minW={0}>
              <Matchups key={`${heroId}:${window}`} bars={bars} name={name} />
            </Box>
          )}
        </Box>
      )}
      {kinds && kindSum > 0 && <AcrossTheTable counts={kinds} name={name} window={window} />}
    </HeroesFrame>
  );
};
