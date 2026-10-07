/**
 * Tournament-only lines in a running game (p2p #1279, UX S10): the opponent's
 * disconnect clock in a tagged duel ("they forfeit in 14:59 … Stay in the
 * room."), and why the game ended when it wasn't a plain knockout. Untagged
 * rooms never mount any of this.
 */
import { Box, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { fmtCountdown } from "@/components/Pro/ProHud";
import type { TournamentRoom } from "@/lib/pro/tournamentTicket";
import { getMatch } from "@/lib/tournaments/api";

export const opponentAwayText = (name: string, secsLeft: number): string =>
  secsLeft > 0
    ? `${name} disconnected. They forfeit in ${fmtCountdown(secsLeft)} if they don't come back. Stay in the room.`
    : `${name} didn't come back in time. They forfeit any moment now. Stay in the room.`;

/** The opponent's auto-forfeit countdown, off the engine's deadline (never a local counter). */
export const OpponentAwayNote = ({ name, deadline }: { name: string; deadline: number }) => {
  const left = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [secs, setSecs] = useState(left);
  useEffect(() => {
    setSecs(left());
    const id = window.setInterval(() => setSecs(left()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);
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
    let timer: number | undefined;
    const ask = async (tries: number) => {
      const r = await getMatch(slug, matchId).catch(() => null);
      if (!alive) return;
      const game = r?.ok ? r.value.match.games.find((g) => g.roomId === roomId) : undefined;
      if (game?.finishedAt) return setReason(game.endReason ?? null);
      if (tries > 1) timer = window.setTimeout(() => void ask(tries - 1), END_REASON_RETRY_MS);
    };
    void ask(2);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [slug, matchId, roomId, over]);
  return reason;
};
