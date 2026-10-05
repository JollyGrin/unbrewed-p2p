/**
 * A tournament game that couldn't start (#1218): the engine's ticket codes
 * (TICKET_EXPIRED, MATCHUP_LOCKED, …, protocol v37) as readable copy, with a
 * retry that asks the api for a fresh ticket and reloads /pro/game with it, and
 * a way back to the match page. The retry goes through `freshGrant`: a JOIN may
 * reuse `GET …/ticket`, but a CREATE is always a recorded `POST …/ready`.
 */
import { Button, Flex, Link, Text } from "@chakra-ui/react";
import { useState } from "react";

import { proErrorMessage } from "@/lib/pro/proErrors";
import { ticketRetryable, tournamentMatchHref, type TournamentRoom } from "@/lib/pro/tournamentTicket";
import { freshGrant, grantHref, playErrorMessage } from "@/lib/tournaments/usePlayMatch";

const BTN_GOLD = {
  bg: "brand.accent",
  color: "brand.surfaceDim",
  fontWeight: 700,
  _hover: { bg: "brand.accentDeep" },
};

export const TicketErrorScreen = ({
  code,
  message,
  at,
  retry: forceRetry = false,
  navigate = (href: string) => window.location.assign(href),
}: {
  /** The engine's ERROR code; absent for a problem found before sending. */
  code?: string;
  /** Overrides the code's copy. */
  message?: string;
  /** Offer the retry even with no code (a seat this browser can't resume). */
  retry?: boolean;
  /** The match this room belongs to; null = a tagged room we can't place (#1230). */
  at: TournamentRoom | null;
  /** Test seam: where a fresh ticket's link goes. */
  navigate?: (href: string) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const retryable = !!at && (forceRetry || (!!code && ticketRetryable(code)));

  const retry = async () => {
    if (!at) return;
    setBusy(true);
    setRetryNote(null);
    const r = await freshGrant(at.slug, at.matchId);
    setBusy(false);
    if (!r.ok) return setRetryNote(playErrorMessage(r));
    const href = grantHref(r.value, at.slug, at.matchId);
    if (!href) return setRetryNote("Your opponent's room is still opening. Try again in a moment.");
    navigate(href);
  };

  return (
    <Flex direction="column" alignItems="center" gap="1rem" pt="4rem" px="1rem" textAlign="center" data-testid="ticket-error" data-code={code ?? ""}>
      <Text fontFamily="LeagueGothic" fontSize="2rem" letterSpacing="0.05em" color="red.300" maxW="34rem">
        {message ?? (code ? proErrorMessage(code) : "This match game couldn't start.")}
      </Text>
      {retryNote && (
        <Text opacity={0.85} role="alert">
          {retryNote}
        </Text>
      )}
      <Flex gap="0.75rem" flexWrap="wrap" justifyContent="center">
        {retryable && (
          <Button {...BTN_GOLD} isLoading={busy} onClick={() => void retry()}>
            Get a fresh ticket and retry
          </Button>
        )}
        <Button as={Link} href={at ? tournamentMatchHref(at) : "/tournaments"} variant="outline" color="brand.parchment" _hover={{ textDecoration: "none", opacity: 0.85 }}>
          {at ? "Back to the match" : "My tournaments"}
        </Button>
      </Flex>
    </Flex>
  );
};
