/**
 * "The organizer decided this match" (p2p #1256, D4): a viewer sitting in a
 * tournament game room (waiting room or game) is told, without touching the
 * socket protocol, once the organizer has decided the match from the match
 * page. The room is known from the remembered tournament room; the match is
 * polled. Nothing is shown for any other way a match ends.
 *
 * The creator's waiting room (p2p #1279, UX B4) also passes its `roomId`: the
 * same poll then reads this room's seat hold, so the copy counts it down and
 * says so once it ran out (the engine closes the room without a frame).
 */
import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";

import { useAccount } from "@/lib/account/useAccount";
import { tournamentMatchHref, type TournamentRoom } from "@/lib/pro/tournamentTicket";
import { tournamentPath } from "@/lib/tournaments/links";
import { getMatch } from "@/lib/tournaments/api";
import { NOT_FOUND_LIMIT, startPoll } from "@/lib/tournaments/poll";
import { serverNow } from "@/lib/tournaments/serverClock";
import type { MapRef, MatchDetail } from "@/lib/tournaments/types";

export const DECIDED_POLL_MS = 15_000;

export type MatchNotice = "decided" | "removed" | "expired" | "cancelled";
type Notice = MatchNotice | null;

export const HOLD_RAN_OUT = "Your 15-minute hold ran out and this room closed. Go back to the match page and press Play again.";

/**
 * This room's seat hold, read off the match (B4): `endsAt` is when it runs out
 * (the live room's, else this room's pending ready check), `gone` = the hold is
 * over or the match's live room is another one. `seenLive` = an earlier poll saw
 * this room as the live one, so its absence now means it closed.
 */
export const roomHold = (
  d: Pick<MatchDetail, "match" | "readyChecks" | "liveRoom">,
  roomId: string,
  now: number,
  seenLive = false,
): { endsAt: number | null; live: boolean; gone: boolean } => {
  const live = d.liveRoom ?? null;
  const liveMine = !!live && live.roomId === roomId;
  const mine = (d.readyChecks ?? [])
    .filter((c) => c.roomId === roomId)
    .sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0];
  const pendingEnds = mine?.outcome === "pending" ? Date.parse(mine.expiresAt) : NaN;
  const endsAt = liveMine ? Date.parse(live.expiresAt) : Number.isFinite(pendingEnds) ? pendingEnds : null;
  const inPlay = d.match.status === "in_play" || d.match.inPlay;
  const gone =
    (!!endsAt && endsAt <= now) ||
    (!liveMine && mine?.outcome === "unanswered") ||
    (!!live?.roomId && !liveMine) ||
    (seenLive && !live && !inPlay);
  return { endsAt: Number.isFinite(endsAt) ? endsAt : null, live: liveMine, gone };
};

/** "14 min 59 s left" — never a clock-shaped "14:59" next to deadlines (UX B2). */
export const holdLeftText = (ms: number): string => {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m} min ${s} s left` : `${s} s left`;
};

/**
 * Item L2-6/7 (p2p #1258): once the organizer decided the match, or changed the
 * bracket so the viewer is no longer one of its two entries, say so.
 * `strip` renders in normal flow (the in-game view offsets the table by its
 * height via --match-banner-h); otherwise it replaces `children` (the waiting
 * room's "seat held, keep this tab open" copy, which it contradicts).
 */
export const MatchDecidedBanner = ({
  at,
  strip = false,
  roomId = null,
  onNotice,
  children,
}: {
  at: TournamentRoom | null;
  strip?: boolean;
  /** The waiting room's own room (B4): watch its seat hold. */
  roomId?: string | null;
  /** Told once a notice shows: the page drops what the notice makes untrue (the board, the waiting copy). */
  onNotice?: (notice: MatchNotice) => void;
  /**
   * The waiting copy; a function gets the hold's time left in ms (null = not
   * known yet) and the match's assigned board (null = not known / player's pick).
   */
  children?: ReactNode | ((holdLeftMs: number | null, map: MapRef | null) => ReactNode);
}) => {
  const [notice, setNotice] = useState<Notice>(null);
  const [holdEndsAt, setHoldEndsAt] = useState<number | null>(null);
  const [map, setMap] = useState<MapRef | null>(null);
  const [now, setNow] = useState(() => serverNow());
  const { status, account } = useAccount();
  const myUserId = status === "signed-in" && account ? account.id : null;
  const slug = at?.slug;
  const matchId = at?.matchId;

  useEffect(() => {
    setNotice(null);
    setHoldEndsAt(null);
    setMap(null);
    if (!slug || !matchId) return;
    let current = true; // this room/match is still the one on screen
    let notFound = 0;
    let seenLive = false;
    const cancel = startPoll(DECIDED_POLL_MS, async () => {
      const r = await getMatch(slug, matchId);
      if (!current) return "stop";
      if (!r.ok) {
        if (r.reason !== "not_found") return "fail";
        notFound += 1;
        return notFound >= NOT_FOUND_LIMIT ? "stop" : "ok";
      }
      notFound = 0;
      const { match, players, tournament } = r.value;
      if (match.decidedBy === "organizer" && (match.status === "decided" || !!match.winner)) {
        setNotice("decided");
        return "stop";
      }
      // Cancelled mid-game (journeys polish, #1279): the game ends as usual, but
      // the room says it no longer counts.
      if (match.cancelled || tournament?.status === "cancelled") {
        setNotice("cancelled");
        return "stop";
      }
      const sides = [players?.a, players?.b].filter(Boolean) as { userId: string }[];
      if (myUserId && sides.length > 0 && !sides.some((p) => p.userId === myUserId)) {
        setNotice("removed");
        return "stop";
      }
      if (roomId) {
        setMap(match.matchup?.map ?? null);
        const hold = roomHold(r.value, roomId, serverNow(), seenLive);
        seenLive ||= hold.live;
        if (hold.gone) {
          setNotice("expired");
          return "stop";
        }
        setHoldEndsAt(hold.endsAt);
      }
      return "ok";
    });
    return () => {
      current = false;
      cancel();
    };
  }, [slug, matchId, myUserId, roomId]);

  // The hold's live countdown: when it reaches zero the room is gone, poll or not.
  useEffect(() => {
    if (holdEndsAt === null || notice) return;
    const step = () => {
      const t = serverNow();
      setNow(t);
      if (t >= holdEndsAt) setNotice("expired");
    };
    step();
    const id = window.setInterval(step, 1000);
    return () => window.clearInterval(id);
  }, [holdEndsAt, notice]);

  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  useEffect(() => {
    if (at && notice) onNoticeRef.current?.(notice);
  }, [at, notice]);

  const ref = useRef<HTMLDivElement>(null);
  const shown = !!at && !!notice;
  useEffect(() => {
    if (!strip || typeof document === "undefined") return;
    const root = document.documentElement;
    const el = ref.current;
    if (!shown || !el) {
      root.style.removeProperty("--match-banner-h");
      return;
    }
    const set = () => root.style.setProperty("--match-banner-h", `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--match-banner-h");
    };
  }, [strip, shown]);

  if (!at || !notice) {
    if (strip) return null;
    return <>{typeof children === "function" ? children(holdEndsAt === null ? null : Math.max(0, holdEndsAt - now), map) : children}</>;
  }
  return <NoticeBar ref={ref} notice={notice} at={at} strip={strip} />;
};

const NoticeBar = forwardRef<HTMLDivElement, { notice: MatchNotice; at: TournamentRoom; strip?: boolean }>(function NoticeBar({ notice, at, strip = false }, ref) {
  const removed = notice === "removed";
  const expired = notice === "expired";
  const cancelled = notice === "cancelled";
  // A cancelled tournament's match has nothing left to do: point at the tournament.
  const toTournament = cancelled;
  return (
    <Flex
      ref={ref}
      role="status"
      data-testid={removed ? "match-removed-banner" : expired ? "hold-expired-banner" : cancelled ? "tournament-cancelled-banner" : "match-decided-banner"}
      position="relative"
      zIndex={400}
      justify="center"
      align="center"
      gap="0.75rem"
      flexWrap="wrap"
      px="1rem"
      py="0.6rem"
      borderRadius={strip ? 0 : "8px"}
      w={strip ? "100%" : undefined}
      bg="brand.accent"
      color="brand.surfaceDim"
      fontFamily="SpaceGrotesk"
      textAlign="center"
    >
      <Box as={Text} fontWeight={700}>
        {removed
          ? "You are no longer in this match (the organizer changed the bracket)."
          : expired
            ? HOLD_RAN_OUT
            : cancelled
              ? "This tournament was cancelled. This game no longer counts."
              : "The organizer decided this match. This game won't count."}
      </Box>
      <Button as={Link} href={toTournament ? tournamentPath(at.slug) : tournamentMatchHref(at)} size="sm" bg="brand.surfaceDim" color="brand.accent" _hover={{ textDecoration: "none", opacity: 0.85 }}>
        {toTournament ? "Back to the tournament" : "Back to the match"}
      </Button>
    </Flex>
  );
});

/**
 * The whole screen once the room is no longer this player's to play in: they
 * were moved out of the match, or the waiting room's hold ran out. Only the
 * notice and its one way back: no board, no waiting copy under it.
 */
export const RoomClosedScreen = ({ notice, at }: { notice: MatchNotice; at: TournamentRoom }) => (
  <Flex direction="column" alignItems="center" pt="6rem" px="1rem" data-testid="room-closed">
    <NoticeBar notice={notice} at={at} />
  </Flex>
);

