/**
 * A tournament game that couldn't start (#1218): the engine's ticket codes
 * (TICKET_EXPIRED, MATCHUP_LOCKED, …, protocol v37) as readable copy, with a
 * retry that asks the api for a fresh ticket and reloads /pro/game with it, and
 * a way back to the match page. The retry goes through `freshGrant`: a JOIN may
 * reuse `GET …/ticket`, but a CREATE is always a recorded `POST …/ready`.
 */
import { Button, Flex, Link, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { getMatch } from "@/lib/tournaments/api";

import { proErrorMessage, TOURNAMENT_SEAT_RELEASED } from "@/lib/pro/proErrors";
import { forgetPendingPick, ticketRetryable, tournamentMatchHref, type TournamentRoom } from "@/lib/pro/tournamentTicket";
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
  pendingLaunch = false,
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
  /**
   * The page was reloaded mid-launch (E1): no room exists yet (the api hands the
   * pending create's ticket back), and the launch note stays until it ends.
   */
  pendingLaunch?: boolean;
  /** Test seam: where a fresh ticket's link goes. */
  navigate?: (href: string) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  // C3 (#1236): once the match is decided no ticket helps — say so, and only link back.
  const [finished, setFinished] = useState(false);
  // Any ticket error ends the remembered launch (a retry's new ticket starts a
  // fresh one); only the reload card keeps it, until the match is decided.
  useEffect(() => {
    if (!pendingLaunch || finished) forgetPendingPick();
  }, [pendingLaunch, finished]);
  const atKey = at ? `${at.slug}/${at.matchId}` : null;
  useEffect(() => {
    if (!at) return;
    let alive = true;
    void getMatch(at.slug, at.matchId)
      .then((r) => {
        if (alive && r.ok && r.value.match.status === "decided") setFinished(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atKey]);
  // A game already in play is the answer, not a footnote: it becomes the headline.
  const [headline, setHeadline] = useState<string | null>(null);
  const retryable = !!at && !finished && (forceRetry || (!!code && ticketRetryable(code)));

  const retry = async () => {
    if (!at) return;
    setBusy(true);
    setRetryNote(null);
    const r = await freshGrant(at.slug, at.matchId);
    setBusy(false);
    if (!r.ok) {
      const msg = playErrorMessage(r);
      if (r.reason === "conflict" && r.code === "match_in_play") return setHeadline(msg);
      return setRetryNote(msg);
    }
    const href = grantHref(r.value, at.slug, at.matchId);
    if (!href) return setRetryNote("Your opponent's room is still opening. Try again in a moment.");
    navigate(href);
  };

  return (
    <Flex direction="column" alignItems="center" gap="1rem" pt="4rem" px="1rem" textAlign="center" data-testid="ticket-error" data-code={code ?? ""}>
      <Text fontFamily="LeagueGothic" fontSize="2rem" letterSpacing="0.05em" color="red.300" maxW="34rem">
        {finished
          ? "This match is finished."
          : headline ?? message ?? (code ? (code === "BAD_TOKEN" ? TOURNAMENT_SEAT_RELEASED : proErrorMessage(code)) : "This match game couldn't start.")}
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
        {!finished && (
          <Button as={Link} href="/pro/game" variant="ghost" color="brand.parchment" onClick={() => forgetPendingPick()} _hover={{ textDecoration: "none", opacity: 0.85 }}>
            Play casual instead
          </Button>
        )}
        <Button as={Link} href={at ? tournamentMatchHref(at) : "/tournaments"} variant="outline" color="brand.parchment" _hover={{ textDecoration: "none", opacity: 0.85 }}>
          {at ? "Back to the match" : "My tournaments"}
        </Button>
      </Flex>
    </Flex>
  );
};
