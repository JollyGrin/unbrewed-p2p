/**
 * The `/stats?u=` player dashboard (issue #937, Player.dc.html): a dark header
 * band (identity, rank, worn badges, level, "Next up", six tiles) over the
 * parchment sections in ./PlayerSections.
 *
 * Only `/stats` renders this. `/account` keeps `ProfileView` — the two share
 * data helpers (lib/account/stats), not components.
 *
 * Data: the player payload (`/players?u=`), their paged games, and — only to
 * know whether this player holds their main hero's crown — `/heroes?h=`. That
 * last call is skipped against an api that predates the contract (no
 * `xpPerWin` on the player), so today's prod never sees a 404 for it.
 */
import { useState } from "react";
import { Box, Image } from "@chakra-ui/react";
import NextLink from "next/link";

import { StatsCaveat } from "@/components/Account/StatsCaveat";
import { wornBadges } from "@/lib/account/badges";
import { hasPlayed, levelProgress } from "@/lib/account/stats";
import type { GameHistoryView } from "@/lib/account/useGameHistory";
import { useHeroStats } from "@/lib/stats/hooks";
import { mainHero, nextUpCopy, playerTiles } from "@/lib/stats/playerDashboard";
import type { StatsPlayer } from "@/lib/stats/types";

import { DarkBand } from "./DarkBand";
import { ProgressBar } from "./ProgressBar";
import {
  BadgeCase,
  PlayerGames,
  PlayerMatchGrid,
  RecentForm,
  Roster,
  TableTime,
  WhoTheyPlay,
} from "./PlayerSections";
import { StatTile } from "./StatTile";
import { BAND_MUTED, captionStyle, GOLD, INK_DEEP, PAGE_BG } from "./tokens";

/** "JollyGrin" → "JG"; "emyrk" → "EM". */
export const playerInitials = (username: string): string => {
  const capitals = username.replace(/[^A-Z]/g, "");
  if (capitals.length >= 2) return capitals.slice(0, 2);
  return username.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
};

const Avatar = ({ username, avatarUrl }: { username: string; avatarUrl: string | null }) => {
  const [failed, setFailed] = useState(false);
  const size = { base: "88px", md: "132px" };
  if (avatarUrl && !failed) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        w={size}
        h={size}
        minW={size}
        borderRadius="50%"
        objectFit="cover"
        data-testid="player-avatar"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <Box
      aria-hidden
      data-testid="player-avatar"
      w={size}
      h={size}
      minW={size}
      borderRadius="50%"
      bg={GOLD}
      color={INK_DEEP}
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontFamily="LeagueGothic"
      fontSize={{ base: "48px", md: "72px" }}
      lineHeight={1}
    >
      {playerInitials(username)}
    </Box>
  );
};

const NextUpCard = ({ player }: { player: StatsPlayer }) => {
  const copy = nextUpCopy(player.leaderboard, player.xpPerWin);
  if (!copy) return null;
  return (
    <Box
      data-testid="next-up"
      w={{ base: "100%", lg: "340px" }}
      flexShrink={0}
      boxSizing="border-box"
      p="20px"
      borderRadius="14px"
      bg="rgba(224,168,46,0.14)"
      border={`1px solid ${GOLD}`}
      display="flex"
      flexDirection="column"
      gap="8px"
    >
      <Box {...captionStyle} letterSpacing="0.08em" color={GOLD}>
        Next up
      </Box>
      <Box fontSize="20px" fontWeight={700} lineHeight={1.25}>
        {copy.headline}
      </Box>
      {copy.detail ? (
        <Box fontSize="14px" color="rgba(250,235,215,0.78)" lineHeight={1.45}>
          {copy.detail}
        </Box>
      ) : null}
    </Box>
  );
};

const Header = ({ player, selfLink }: { player: StatsPlayer; selfLink: React.ReactNode }) => {
  const level = levelProgress(player.stats);
  const worn = wornBadges(player.badges.badges, player.badges.selected);
  const position = player.leaderboard;
  const tiles = hasPlayed(player.stats) ? playerTiles(player.stats) : [];

  return (
    <DarkBand variant="profile">
      <Box w="100%" maxW="1184px" mx="auto" display="flex" flexDirection="column" gap={{ base: "20px", md: "32px" }}>
        <Box
          as={NextLink}
          href="/leaderboard"
          color="rgba(250,235,215,0.8)"
          fontSize="14px"
          fontWeight={500}
          minH="44px"
          display="flex"
          alignItems="center"
          alignSelf="flex-start"
          textDecoration="underline"
          _hover={{ color: "#FAEBD7" }}
        >
          Back to the leaderboard
        </Box>

        <Box display="flex" flexDirection={{ base: "column", lg: "row" }} gap={{ base: "20px", lg: "40px" }} alignItems={{ base: "stretch", lg: "center" }}>
          <Box display="flex" gap={{ base: "16px", md: "40px" }} alignItems="center" flexGrow={1} minW={0}>
            <Avatar username={player.username} avatarUrl={player.avatarUrl} />
            <Box flexGrow={1} display="flex" flexDirection="column" gap="12px" minW={0}>
              <Box display="flex" flexWrap="wrap" gap="4px 16px" alignItems="baseline">
                <Box
                  as="h1"
                  m={0}
                  fontFamily="LeagueGothic"
                  fontWeight={400}
                  fontSize={{ base: "52px", md: "88px" }}
                  lineHeight={0.9}
                  overflowWrap="anywhere"
                >
                  {player.username}
                </Box>
                {position ? (
                  <Box {...captionStyle} fontSize="14px" letterSpacing="0.1em" color={GOLD} data-testid="player-rank">
                    Rank {position.rank} of {position.of}
                  </Box>
                ) : null}
                {selfLink}
              </Box>
              {worn.length > 0 ? (
                <Box display="flex" flexWrap="wrap" gap="8px" data-testid="worn-badges">
                  {worn.map((b) => (
                    <Box
                      key={b.id}
                      title={b.blurb}
                      fontSize="13px"
                      fontWeight={500}
                      p="6px 12px"
                      borderRadius="16px"
                      bg="rgba(250,235,215,0.1)"
                      border="1px solid rgba(250,235,215,0.22)"
                    >
                      {b.name}
                    </Box>
                  ))}
                </Box>
              ) : null}
              {level ? (
                <Box display="flex" flexDirection="column" gap="6px" maxW="520px" data-testid="player-level">
                  <Box display="flex" justifyContent="space-between" gap="8px" {...captionStyle} fontSize="13px" color="inherit">
                    <span>Level {level.level}</span>
                    <Box as="span" color="rgba(250,235,215,0.72)">
                      {level.toGo} XP to level {level.level + 1}
                    </Box>
                  </Box>
                  <ProgressBar value={level.percent / 100} label={`Level ${level.level}, ${level.percent}% to the next`} height={10} color={GOLD} onDark />
                </Box>
              ) : null}
            </Box>
          </Box>
          <NextUpCard player={player} />
        </Box>

        {tiles.length > 0 ? (
          <Box
            display="grid"
            gridTemplateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" }}
            gap="12px"
            data-testid="player-tiles"
          >
            {tiles.map((t) => (
              <StatTile key={t.key} label={t.label} value={t.value} sub={t.sub} />
            ))}
          </Box>
        ) : (
          <Box fontSize="14px" color={BAND_MUTED}>
            No finished Pro games on record yet.
          </Box>
        )}
      </Box>
    </DarkBand>
  );
};

/** Two cards side by side at 1280 (the first a fixed width), stacked below. */
const Pair = ({ first, width, children }: { first: React.ReactNode; width: string; children: React.ReactNode }) => (
  <Box display="flex" flexDirection={{ base: "column", xl: "row" }} gap={{ base: "16px", md: "32px" }} alignItems={{ base: "stretch", xl: "stretch" }}>
    {first ? (
      <Box flex={{ base: "1 1 auto", xl: `0 0 ${width}` }} minW={0} display="flex" flexDirection="column" sx={{ "& > section": { flexGrow: 1 } }}>
        {first}
      </Box>
    ) : null}
    <Box flex="1 1 0" minW={0} display="flex" flexDirection="column" sx={{ "& > section": { flexGrow: 1 } }}>
      {children}
    </Box>
  </Box>
);

export interface PlayerDashboardProps {
  player: StatsPlayer;
  history: GameHistoryView;
  /** "This is you" when the viewer is this player; null otherwise. */
  selfLink?: React.ReactNode;
}

export const PlayerDashboard = ({ player, history, selfLink = null }: PlayerDashboardProps) => {
  const main = mainHero(player.stats);
  // Contract-era api only (see the header): `xpPerWin` ships with §2d.
  const askCrown = main && player.xpPerWin ? main.heroId : null;
  const hero = useHeroStats(askCrown);
  const crown = hero.data?.crown;
  const crownWins =
    crown && crown.username.toLowerCase() === player.username.toLowerCase() ? crown.wins : null;

  const tableTime = player.calendar ? <TableTime player={player} /> : null;
  const matchGrid = player.byHeroOpponentHero ? <PlayerMatchGrid player={player} /> : null;
  const badges = player.badges.badges.length > 0 ? <BadgeCase player={player} /> : null;

  return (
    <Box bg={PAGE_BG} data-testid="player-dashboard">
      <Header player={player} selfLink={selfLink} />
      <Box
        w="100%"
        maxW="1280px"
        mx="auto"
        p={{ base: "16px 16px 40px", md: "40px 48px 56px" }}
        display="flex"
        flexDirection="column"
        gap={{ base: "16px", md: "32px" }}
      >
        <Pair first={tableTime} width="760px">
          <RecentForm player={player} />
        </Pair>
        <Roster player={player} crownWins={crownWins} />
        <Pair first={matchGrid} width="760px">
          <WhoTheyPlay player={player} />
        </Pair>
        <Pair first={badges} width="560px">
          <PlayerGames history={history} />
        </Pair>
        <StatsCaveat />
      </Box>
    </Box>
  );
};
