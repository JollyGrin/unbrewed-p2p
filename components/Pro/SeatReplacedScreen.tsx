/**
 * "This seat is open in another tab" (p2p #1250 ↔ engine #761): another tab or
 * device took this seat over and the engine closed this socket with
 * `seat_replaced`. Nothing reconnects by itself (two tabs would kick each other
 * forever): "Use this tab instead" takes the seat back deliberately — with the
 * stored token, or a fresh ticket when this browser has none.
 */
import { Button, Flex, Link, Text } from "@chakra-ui/react";
import { useState } from "react";

import { getToken } from "@/lib/pro/recentRooms";
import { tournamentMatchHref, type TournamentRoom } from "@/lib/pro/tournamentTicket";
import { freshGrant, grantHref, playErrorMessage } from "@/lib/tournaments/usePlayMatch";

const BTN_GOLD = {
  bg: "brand.accent",
  color: "brand.surfaceDim",
  fontWeight: 700,
  _hover: { bg: "brand.accentDeep" },
};

export const SeatReplacedScreen = ({
  roomId,
  at,
  onTakeBack,
  navigate = (href: string) => window.location.assign(href),
}: {
  roomId: string | null;
  /** The match this room belongs to; null = a casual room. */
  at: TournamentRoom | null;
  /** Reconnect this tab with the stored token. */
  onTakeBack: () => void;
  /** Test seam: where a fresh ticket's link goes. */
  navigate?: (href: string) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const takeBack = async () => {
    if (!at || (roomId && getToken(roomId))) return onTakeBack();
    setBusy(true);
    setNote(null);
    const r = await freshGrant(at.slug, at.matchId);
    setBusy(false);
    if (!r.ok) return setNote(playErrorMessage(r));
    const href = grantHref(r.value, at.slug, at.matchId);
    if (!href) return setNote("The room is still opening. Try again in a moment.");
    navigate(href);
  };
  return (
    <Flex direction="column" alignItems="center" gap="1rem" pt="4rem" px="1rem" textAlign="center" data-testid="seat-replaced">
      <Text fontFamily="LeagueGothic" fontSize="2rem" letterSpacing="0.05em" color="brand.accent" maxW="34rem">
        This seat is open in another tab
      </Text>
      <Text opacity={0.85} maxW="30rem">
        Your game carries on there. Use this tab instead to move it here — the other tab will stop.
      </Text>
      {note && (
        <Text opacity={0.85} role="alert">
          {note}
        </Text>
      )}
      <Flex gap="0.75rem" flexWrap="wrap" justifyContent="center">
        <Button {...BTN_GOLD} isLoading={busy} onClick={() => void takeBack()}>
          Use this tab instead
        </Button>
        {at && (
          <Button as={Link} href={tournamentMatchHref(at)} variant="outline" color="brand.parchment" _hover={{ textDecoration: "none", opacity: 0.85 }}>
            Back to the match
          </Button>
        )}
      </Flex>
    </Flex>
  );
};
