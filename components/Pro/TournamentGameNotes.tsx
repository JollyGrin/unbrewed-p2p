/**
 * Tournament-only pieces of a running game (p2p #1279, UX S10): the waiting
 * room's hold, the opponent's disconnect clock in a tagged duel ("they forfeit
 * in 14:59 … Stay in the room."), why the game ended when it wasn't a plain
 * knockout, and the way back to the match page from the end and lost-game
 * screens. The shared game screens take these as slots; untagged rooms never
 * mount any of this.
 */
import { Box, Button, Flex, Link, Tag, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { holdLeftText, MatchDecidedBanner } from "@/components/Pro/MatchDecidedBanner";
import { fmtCountdown } from "@/components/Pro/ProHud";
import { catalogEntry } from "@/lib/pro/mapCatalog";
import { TAP_TARGET } from "@/lib/pro/mobileLayout";
import type { PlayerView } from "@/lib/pro/protocol";
import { tournamentMatchHref, type TournamentRoom } from "@/lib/pro/tournamentTicket";
import { getMatch } from "@/lib/tournaments/api";
import { startPoll, useTicker } from "@/lib/tournaments/poll";

export const opponentAwayText = (name: string, secsLeft: number): string =>
  secsLeft > 0
    ? `${name} disconnected. They forfeit in ${fmtCountdown(secsLeft)} if they don't come back. Stay in the room.`
    : `${name} didn't come back in time. They forfeit any moment now. Stay in the room.`;

/** The opponent's auto-forfeit countdown, off the engine's deadline (never a local counter). */
export const OpponentAwayNote = ({ name, deadline }: { name: string; deadline: number }) => {
  const now = useTicker(1000, Date.now, true, deadline);
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <Box
      role="status"
      data-testid="opponent-away-note"
      position="fixed"
      top="calc(var(--match-banner-h, 0px) + 0.5rem)"
      left="50%"
      transform="translateX(-50%)"
      zIndex={390}
      maxW="min(34rem, calc(100vw - 2rem))"
      px="0.9rem"
      py="0.5rem"
      borderRadius="8px"
      bg="brand.surfaceDim"
      border="1px solid"
      borderColor="brand.accent"
      color="brand.parchment"
      fontFamily="SpaceGrotesk"
      fontSize="0.9rem"
      textAlign="center"
    >
      <Text>{opponentAwayText(name, secs)}</Text>
    </Box>
  );
};

/** Why a tournament game ended, under VICTORY / DEFEAT; null = a plain finish. */
export const gameEndNote = (reason: string | null | undefined, iWon: boolean, opponent = "Your opponent"): string | null => {
  switch (reason) {
    case "disconnect":
      return iWon
        ? `${opponent} left and didn't come back in time. You win by forfeit.`
        : "You were disconnected too long, so the game went to your opponent by forfeit.";
    case "abandoned":
    case "swept":
    case "stalled":
      return "This game ended with no result. The match page shows what happens next.";
    default:
      return null;
  }
};

const END_REASON_RETRY_MS = 5_000;

/**
 * The api's `endReason` for this room's game once it is over (api A5). Asks
 * twice at most (the api learns of the finish a moment after the engine);
 * null while unknown, on an older api, or for an ordinary finish.
 */
export const useTaggedGameEndReason = (at: TournamentRoom | null, roomId: string | null, over: boolean): string | null => {
  const [reason, setReason] = useState<string | null>(null);
  const slug = at?.slug;
  const matchId = at?.matchId;
  useEffect(() => {
    setReason(null);
    if (!over || !slug || !matchId || !roomId) return;
    let alive = true;
    let tries = 2;
    const stop = startPoll(END_REASON_RETRY_MS, async () => {
      const r = await getMatch(slug, matchId).catch(() => null);
      if (!alive) return "stop";
      const game = r?.ok ? r.value.match.games.find((g) => g.roomId === roomId) : undefined;
      if (game?.finishedAt) {
        setReason(game.endReason ?? null);
        return "stop";
      }
      // A miss (or a failed ask) is no reason to back off: the api is a moment behind.
      return --tries > 0 ? "ok" : "stop";
    });
    return () => {
      alive = false;
      stop();
    };
  }, [slug, matchId, roomId, over]);
  return reason;
};

/**
 * The creator's waiting room in a tournament room. It is private and seats only
 * the match's other player, who joins from the match page: no invite link, no
 * public toggle (the engine refuses SET_VISIBILITY on it). The hold is live,
 * counted down from the match's ready check and replaced once it ran out.
 * "Keep this tab open" leads: the pre-game seat also goes ~60 s after the
 * socket drops.
 */
export const TournamentWaiting = ({ at, roomId, boardUnknown }: { at: TournamentRoom; roomId: string | null; boardUnknown: boolean }) => (
  <Flex direction="column" alignItems="center" gap="0.5rem" data-testid="tournament-waiting">
    <MatchDecidedBanner at={at} roomId={roomId}>
      {(holdLeftMs, matchMap) => (
        <>
          <Text fontWeight={700} fontSize="1.1rem" textAlign="center" data-testid="tournament-hold-headline">
            Keep this tab open
          </Text>
          <Tag px="0.75rem" py="0.4rem" fontFamily="SpaceGrotesk" letterSpacing="0.04em" bg="brand.accent" color="brand.surfaceDim" data-testid="tournament-hold">
            {holdLeftMs === null
              ? "🏆 Tournament match · your seat is held"
              : `🏆 Tournament match · seat held · ${holdLeftText(holdLeftMs)}`}
          </Tag>
          <Text opacity={0.8} textAlign="center" maxW="30rem">
            Your opponent joins from the match page. If you close this tab, your seat goes about a minute later.
          </Text>
          {/* After a reload the room's board is unknown here; the match's own
              assignment still names it. */}
          {boardUnknown && matchMap && (
            <Text opacity={0.8} textAlign="center" data-testid="tournament-board">
              Playing on {matchMap.kind === "catalog" ? catalogEntry(matchMap.id)?.title ?? matchMap.id : "the organizer's board"}.
            </Text>
          )}
        </>
      )}
    </MatchDecidedBanner>
    <Link href={tournamentMatchHref(at)} color="brand.accent">
      Back to the match page
    </Link>
  </Flex>
);

/**
 * Above the table in a tournament game: the match's decided/hold strip, and in
 * a duel the opponent's forfeit clock while they are away.
 */
export const TournamentGameStrip = ({ at, view, awayDeadline }: { at: TournamentRoom; view: PlayerView; awayDeadline: number | null }) => (
  <>
    <MatchDecidedBanner at={at} strip />
    {awayDeadline !== null && !view.winner && <OpponentAwayNote name={opponentNameOf(view)} deadline={awayDeadline} />}
  </>
);

export const opponentNameOf = (view: PlayerView): string => view.opponent?.displayName?.trim() || "Your opponent";

/**
 * A tournament game's end-screen action, in Rematch's place: the next game of
 * the match is a new ticket from the match page (the engine refuses a rematch).
 */
export const BackToMatchButton = ({ at }: { at: TournamentRoom }) => (
  <Button
    as={Link}
    href={tournamentMatchHref(at)}
    minH={TAP_TARGET}
    px="1.4rem"
    mt="0.3rem"
    mb="0.15rem"
    bg="brand.accent"
    color="brand.surfaceDim"
    fontWeight={700}
    data-testid="back-to-match"
    _hover={{ bg: "brand.accentDeep", textDecoration: "none" }}
    _active={{ bg: "brand.accentDeep" }}
  >
    Back to the match
  </Button>
);

const LOST_BTN_GOLD = {
  size: "md" as const,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
};

/** "We lost your game" in a tournament: the match isn't lost, the match page says what's next. */
export const LostGameMatchNote = ({ at }: { at: TournamentRoom }) => (
  <Box maxW="34rem">
    <Text fontSize="0.95rem" opacity={0.85} mb="0.6rem">
      Your tournament match isn&apos;t lost. The match page shows what happens next.
    </Text>
    <Button
      as={Link}
      href={tournamentMatchHref(at)}
      {...LOST_BTN_GOLD}
      _hover={{ ...LOST_BTN_GOLD._hover, textDecoration: "none" }}
      data-testid="lost-back-to-match"
    >
      Back to the match
    </Button>
  </Box>
);
