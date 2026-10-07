/**
 * A tournament game that couldn't start (#1218): the engine's ticket codes
 * (TICKET_EXPIRED, MATCHUP_LOCKED, …, protocol v37) as readable copy, with a
 * retry that asks the api for a fresh ticket and reloads /pro/game with it, and
 * a way back to the match page. The retry goes through `freshGrant`: a JOIN may
 * reuse `POST …/ticket`, but a CREATE is always a recorded `POST …/ready`. A
 * room the engine no longer has (ROOM_NOT_FOUND) is reported to the api first
 * (`POST …/room-gone`, #1268), so the retry can't loop back into it. A room
 * too young to clear (api `too_soon`) waits out the age gate and retries ONCE
 * (p2p #1269); leaving the screen cancels the wait.
 */
import { Button, Flex, Link, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

import { getMatch } from "@/lib/tournaments/api";
import { serverNow } from "@/lib/tournaments/serverClock";

import { proErrorMessage, TOURNAMENT_SEAT_RELEASED } from "@/lib/pro/proErrors";
import { assignTicketHref, forgetPendingPick, ticketRetryable, tournamentMatchHref, type TournamentRoom } from "@/lib/pro/tournamentTicket";
import {
  freshGrant,
  grantAvoiding,
  grantHref,
  playErrorMessage,
  releasingText,
  reportDeadRoom,
  roomReleaseWaitMs,
  ROOM_STILL_GONE,
  settledReport,
  type DeadRoomGrant,
} from "@/lib/tournaments/usePlayMatch";

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
  roomId = null,
  retry: forceRetry = false,
  pendingLaunch = false,
  navigate = assignTicketHref,
}: {
  /** The engine's ERROR code; absent for a problem found before sending. */
  code?: string;
  /** Overrides the code's copy. */
  message?: string;
  /**
   * The room the refused join/reconnect named. With ROOM_NOT_FOUND the retry
   * reports it dead to the api before asking for a fresh ticket (#1268).
   */
  roomId?: string | null;
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
  // The api's answer to `room-gone` for this dead room: asked once, then reused.
  // Only a real answer is kept: a network blip asks again next press (p2p #1269).
  const deadReport = useRef<"reported" | "legacy" | null>(null);
  // `too_soon` waits out the api's age gate once per screen; unmount cancels it.
  const waitedOnce = useRef(false);
  const [releaseAt, setReleaseAt] = useState<number | null>(null);
  const cancelWait = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelWait.current?.(), []);
  const [, tick] = useState(0);
  useEffect(() => {
    if (releaseAt === null) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [releaseAt]);
  /** Resolves true after `ms`, or false once cancelled (the screen went away). */
  const sleep = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const t = window.setTimeout(() => {
        cancelWait.current = null;
        resolve(true);
      }, ms);
      cancelWait.current = () => {
        window.clearTimeout(t);
        cancelWait.current = null;
        resolve(false);
      };
    });
  const deadRoom = code === "ROOM_NOT_FOUND" ? roomId : null;
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
    let r: DeadRoomGrant;
    if (deadRoom) {
      let report = deadReport.current ?? (await reportDeadRoom(at.slug, at.matchId, deadRoom));
      if (report === "too_soon" && !waitedOnce.current) {
        // The room (or our ticket) is under 30s old: wait it out and ask ONCE more.
        waitedOnce.current = true;
        const d = await getMatch(at.slug, at.matchId).catch(() => null);
        const wait = roomReleaseWaitMs(d?.ok ? d.value : null, deadRoom, serverNow());
        setReleaseAt(Date.now() + wait);
        const waited = await sleep(wait);
        if (!waited) return; // left the screen
        setReleaseAt(null);
        report = await reportDeadRoom(at.slug, at.matchId, deadRoom);
      }
      if (settledReport(report)) deadReport.current = report;
      r = report === "legacy" ? await freshGrant(at.slug, at.matchId) : await grantAvoiding(at.slug, at.matchId, deadRoom);
    } else r = await freshGrant(at.slug, at.matchId);
    setBusy(false);
    if (!r.ok && r.reason === "room_still_gone") return setRetryNote(ROOM_STILL_GONE);
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
      {releaseAt !== null && (
        <Text opacity={0.85} role="status" data-testid="room-releasing">
          {releasingText(Math.max(1, Math.ceil((releaseAt - Date.now()) / 1000)))}
        </Text>
      )}
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
          <Button as={Link} href="/pro/game" variant="ghost" color="brand.parchment" onClick={() => { cancelWait.current?.(); forgetPendingPick(); }} _hover={{ textDecoration: "none", opacity: 0.85 }}>
            Play casual instead
          </Button>
        )}
        <Button as={Link} href={at ? tournamentMatchHref(at) : "/tournaments"} onClick={() => cancelWait.current?.()} variant="outline" color="brand.parchment" _hover={{ textDecoration: "none", opacity: 0.85 }}>
          {at ? "Back to the match" : "My tournaments"}
        </Button>
      </Flex>
    </Flex>
  );
};
