/**
 * The people half of the leaderboard dashboard (Main.dc.html): the podium
 * that sits in the dark band (ranks 1–3) and the chase-pack table (4+).
 * Both follow the api's order verbatim — the rank printed beside a player is
 * the api's, never a re-sort here.
 */
import { useState } from "react";
import NextLink from "next/link";
import { Box } from "@chakra-ui/react";

import { profileHref } from "@/lib/account/publicProfile";
import {
  CHASE_PACK_PREVIEW,
  chaseCaption,
  chaseRows,
  podium,
  winsFor,
} from "@/lib/stats/leaderboardDashboard";
import { heroDisplayName, heroInitials } from "@/lib/stats/roster";
import type { StatsLeaderboardRow, StatsWindow } from "@/lib/stats/types";

import { DashCard } from "../DashCard";
import { FormChips } from "../FormChips";
import { HeroToken } from "../HeroToken";
import { ProgressBar } from "../ProgressBar";
import { captionStyle, INK, INK_MUTED, INK_SOFT, RULE } from "../tokens";

const PODIUM_STYLE = {
  1: { h: "380px", bg: "rgba(224,168,46,0.16)", edge: "#E0A82E", ink: "#E0A82E" },
  2: { h: "330px", bg: "rgba(250,235,215,0.07)", edge: "rgba(250,235,215,0.18)", ink: "#D9CFE0" },
  3: { h: "300px", bg: "rgba(250,235,215,0.07)", edge: "rgba(250,235,215,0.18)", ink: "#D7A77A" },
} as const;

const YouTag = ({ onDark = false }: { onDark?: boolean }) => (
  <Box
    as="span"
    fontFamily="ArchivoNarrow"
    fontSize="11px"
    fontWeight={700}
    letterSpacing="0.08em"
    bg={onDark ? "#FAEBD7" : INK}
    color={onDark ? "#2C1831" : "#FAEBD7"}
    px="6px"
    py="2px"
    borderRadius="4px"
    flexShrink={0}
  >
    YOU
  </Box>
);

/**
 * The player's main hero token; with no main hero (an older api, or nobody
 * has one yet) their avatar, else their initials in the same disc.
 */
const PlayerDisc = ({ row, size, ring }: { row: StatsLeaderboardRow; size: 40 | 64; ring?: { color: string; width: number } }) => {
  if (row.mainHeroId) {
    return <HeroToken heroId={row.mainHeroId} heroName={row.mainHeroName} size={size} ring={ring} decorative />;
  }
  const frame = {
    w: `${size}px`,
    h: `${size}px`,
    minW: `${size}px`,
    borderRadius: "50%",
    boxSizing: "border-box" as const,
    border: ring ? `${ring.width}px solid ${ring.color}` : undefined,
    "aria-hidden": true,
  };
  if (row.avatarUrl) {
    // Plain <img>: static export, no optimiser; decorative — the name is beside it.
    return <Box as="img" {...frame} src={row.avatarUrl} alt="" objectFit="cover" />;
  }
  return (
    <Box
      {...frame}
      bg="#48284F"
      color="#FAEBD7"
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontFamily="LeagueGothic"
      fontSize={`${size / 2}px`}
      lineHeight={1}
    >
      {heroInitials(row.username)}
    </Box>
  );
};

/** "Level 18 · mains The Mandalorian", dropping whichever half wasn't sent. */
const subLine = (row: StatsLeaderboardRow, mainsWord: boolean): string =>
  [
    row.level !== null ? `Level ${row.level}` : null,
    row.mainHeroId ? `${mainsWord ? "mains " : ""}${heroDisplayName(row.mainHeroId, row.mainHeroName)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const PodiumFigure = ({ value, label }: { value: string | number; label: string }) => (
  <div>
    <Box fontFamily="LeagueGothic" fontSize={{ base: "28px", md: "34px" }} lineHeight={1}>
      {value}
    </Box>
    <Box fontFamily="ArchivoNarrow" fontSize="11px" letterSpacing="0.06em" textTransform="uppercase" color="rgba(250,235,215,0.7)">
      {label}
    </Box>
  </div>
);

export const Podium = ({
  players,
  window,
  me,
}: {
  players: readonly StatsLeaderboardRow[];
  window: StatsWindow;
  me: string | null;
}) => (
  <Box
    as="ol"
    aria-label="Top three"
    listStyleType="none"
    m={0}
    p={0}
    flexGrow={1}
    minW={0}
    display="grid"
    gridTemplateColumns={{ base: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))" }}
    gap={{ base: "12px", md: "16px" }}
    alignItems="end"
    data-testid="podium"
  >
    {podium(players).map(({ row, place, desktopOrder }) => {
      const style = PODIUM_STYLE[place];
      const isMe = me !== null && row.username.toLowerCase() === me;
      const sub = subLine(row, true);
      return (
        <Box as="li" key={row.username} order={{ base: place, md: desktopOrder }} minW={0}>
          <Box
            as={NextLink}
            href={profileHref(row.username)}
            data-testid="podium-card"
            aria-label={`#${place} ${row.username}`}
            textDecoration="none"
            color="#FAEBD7"
            display="flex"
            flexDirection="column"
            gap={{ base: "10px", md: "14px" }}
            boxSizing="border-box"
            h={{ base: "auto", md: style.h }}
            p={{ base: "16px", md: "22px" }}
            borderRadius="14px"
            bg={style.bg}
            border={`1px solid ${style.edge}`}
            _hover={{ borderColor: style.ink, textDecoration: "none" }}
          >
            <Box display="flex" alignItems="flex-start" justifyContent="space-between">
              <Box fontFamily="LeagueGothic" fontSize={{ base: "56px", md: "84px" }} lineHeight={0.8} color={style.ink}>
                {place}
              </Box>
              <PlayerDisc row={row} size={64} ring={{ color: style.ink, width: 3 }} />
            </Box>
            <Box mt="auto" display="flex" flexDirection="column" gap="4px" minW={0}>
              <Box display="flex" gap="8px" alignItems="center" minW={0}>
                <Box fontSize="22px" fontWeight={700} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                  {row.username}
                </Box>
                {isMe && <YouTag onDark />}
              </Box>
              {sub && (
                <Box fontFamily="ArchivoNarrow" fontSize="13px" letterSpacing="0.06em" textTransform="uppercase" color="rgba(250,235,215,0.72)">
                  {sub}
                </Box>
              )}
            </Box>
            <Box display="flex" gap="20px" borderTop="1px solid rgba(250,235,215,0.16)" pt="12px">
              <PodiumFigure value={row.xp.toLocaleString("en-US")} label="XP" />
              <PodiumFigure value={winsFor(row, window).toLocaleString("en-US")} label="Wins" />
              {row.currentStreak !== null && <PodiumFigure value={row.currentStreak} label="Streak" />}
            </Box>
          </Box>
        </Box>
      );
    })}
  </Box>
);

/** Grid columns: rank, player, meter, form, games — phones keep rank, player, form. */
const COLUMNS = { base: "32px minmax(0, 1fr) 112px", md: "40px minmax(0, 1fr) 190px 120px 64px" };
const WIDE_ONLY = { base: "none", md: "block" };

export const ChasePack = ({
  players,
  window,
  me,
  updated,
}: {
  players: readonly StatsLeaderboardRow[];
  window: StatsWindow;
  me: string | null;
  /** "4m ago", or "" when the stamp is missing. */
  updated: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const chasers = chaseRows(players, window).slice(3);
  if (chasers.length === 0) return null;
  const shown = expanded ? chasers : chasers.slice(0, CHASE_PACK_PREVIEW);
  const hasForm = chasers.some((c) => c.row.recentForm !== null);

  return (
    <DashCard
      title="The chase pack"
      gap="8px"
      action={
        updated ? (
          <Box fontSize="13px" color={INK_MUTED}>
            Updated {updated}
          </Box>
        ) : undefined
      }
    >
      <Box
        display="grid"
        gridTemplateColumns={COLUMNS}
        gap="12px"
        p="12px 12px 8px"
        {...captionStyle}
        color={INK_MUTED}
        borderBottom={RULE}
        aria-hidden
      >
        <div>#</div>
        <div>Player</div>
        <Box display={WIDE_ONLY}>{window === "month" ? "Wins to next rank" : "XP to next rank"}</Box>
        <div>{hasForm ? "Last 5" : ""}</div>
        <Box display={WIDE_ONLY} textAlign="right">
          Games
        </Box>
      </Box>
      <Box as="ol" listStyleType="none" m={0} p={0} display="flex" flexDirection="column" aria-label="Ranks 4 and below">
        {shown.map((chase) => {
          const { row } = chase;
          const isMe = me !== null && row.username.toLowerCase() === me;
          const caption = chaseCaption(chase, window);
          const sub = subLine(row, false);
          return (
            <li key={row.username}>
              <Box
                as={NextLink}
                href={profileHref(row.username)}
                data-testid="chase-row"
                data-self={isMe ? "true" : undefined}
                textDecoration="none"
                color={INK}
                display="grid"
                gridTemplateColumns={COLUMNS}
                gap="12px"
                alignItems="center"
                minH="60px"
                px={{ base: "8px", md: "12px" }}
                borderRadius="8px"
                bg={isMe ? "rgba(72,40,79,0.1)" : "transparent"}
                _hover={{ bg: isMe ? "rgba(72,40,79,0.14)" : "rgba(72,40,79,0.05)", textDecoration: "none" }}
              >
                <Box fontFamily="LeagueGothic" fontSize={{ base: "24px", md: "30px" }}>
                  {row.rank}
                </Box>
                <Box display="flex" alignItems="center" gap={{ base: "8px", md: "12px" }} minW={0}>
                  {/* Phones drop the disc so the name keeps its room. */}
                  <Box display={{ base: "none", md: "block" }} flexShrink={0}>
                    <PlayerDisc row={row} size={40} />
                  </Box>
                  <Box display="flex" flexDirection="column" minW={0}>
                    <Box display="flex" gap="8px" alignItems="center" minW={0}>
                      <Box as="span" fontWeight={700} fontSize="16px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        {row.username}
                      </Box>
                      {isMe && <YouTag />}
                    </Box>
                    {sub && (
                      <Box fontSize="12px" color={INK_MUTED} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        {sub}
                      </Box>
                    )}
                  </Box>
                </Box>
                <Box display={{ base: "none", md: "flex" }} flexDirection="column" gap="5px" minW={0}>
                  <ProgressBar value={chase.progress} label={`${row.username}: ${caption}`} />
                  <Box fontSize="12px" color={INK_SOFT} whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                    {caption}
                  </Box>
                </Box>
                <Box minW={0}>{row.recentForm && row.recentForm.length > 0 ? <FormChips results={row.recentForm} /> : null}</Box>
                <Box display={WIDE_ONLY} textAlign="right" fontWeight={500} sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {(window === "month" ? row.monthGames ?? row.gamesPlayed : row.gamesPlayed).toLocaleString("en-US")}
                </Box>
              </Box>
            </li>
          );
        })}
      </Box>
      {chasers.length > CHASE_PACK_PREVIEW && (
        <Box
          as="button"
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          alignSelf="flex-start"
          minH="44px"
          px="12px"
          bg="transparent"
          border={0}
          color={INK}
          fontWeight={700}
          fontSize="14px"
          textDecoration="underline"
          _hover={{ color: "#2C1831" }}
        >
          {expanded ? "Show fewer" : `Show all ${players.length.toLocaleString("en-US")} players`}
        </Box>
      )}
    </DashCard>
  );
};
