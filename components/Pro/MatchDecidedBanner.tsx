/**
 * "The organizer decided this match" (p2p #1256, D4): a viewer sitting in a
 * tournament game room (waiting room or game) is told, without touching the
 * socket protocol, once the organizer has decided the match from the match
 * page. The room is known from the remembered tournament room; the match is
 * polled. Nothing is shown for any other way a match ends.
 */
import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useAccount } from "@/lib/account/useAccount";
import { tournamentMatchHref, type TournamentRoom } from "@/lib/pro/tournamentTicket";
import { tournamentPath } from "@/lib/tournaments/share";
import { getMatch } from "@/lib/tournaments/api";
import { startPoll } from "@/lib/tournaments/poll";

export const DECIDED_POLL_MS = 15_000;

type Notice = "decided" | "removed" | null;

/**
 * Item L2-6/7 (p2p #1258): once the organizer decided the match, or changed the
 * bracket so the viewer is no longer one of its two entries, say so.
 * `strip` renders in normal flow (the in-game view offsets the table by its
 * height via --match-banner-h); otherwise it replaces `children` (the waiting
 * room's "seat held, keep this tab open" copy, which it contradicts).
 */
export const MatchDecidedBanner = ({ at, strip = false, children }: { at: TournamentRoom | null; strip?: boolean; children?: ReactNode }) => {
  const [notice, setNotice] = useState<Notice>(null);
  const { status, account } = useAccount();
  const myUserId = status === "signed-in" && account ? account.id : null;
  const slug = at?.slug;
  const matchId = at?.matchId;

  useEffect(() => {
    setNotice(null);
    if (!slug || !matchId) return;
    return startPoll(DECIDED_POLL_MS, async () => {
      const r = await getMatch(slug, matchId);
      if (!r.ok) return r.reason === "not_found" ? "stop" : "fail";
      const { match, players, tournament } = r.value;
      if (match.decidedBy === "organizer" && (match.status === "decided" || !!match.winner)) {
        setNotice("decided");
        return "stop";
      }
      if (match.cancelled || tournament?.status === "cancelled") return "stop";
      const sides = [players?.a, players?.b].filter(Boolean) as { userId: string }[];
      if (myUserId && sides.length > 0 && !sides.some((p) => p.userId === myUserId)) {
        setNotice("removed");
        return "stop";
      }
      return "ok";
    });
  }, [slug, matchId, myUserId]);

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

  if (!at || !notice) return strip ? null : <>{children}</>;
  const removed = notice === "removed";
  return (
    <Flex
      ref={ref}
      role="status"
      data-testid={removed ? "match-removed-banner" : "match-decided-banner"}
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
          : "The organizer decided this match. This game won't count."}
      </Box>
      <Button as={Link} href={removed ? tournamentPath(at.slug) : tournamentMatchHref(at)} size="sm" bg="brand.surfaceDim" color="brand.accent" _hover={{ textDecoration: "none", opacity: 0.85 }}>
        {removed ? "Back to the tournament" : "Back to the match"}
      </Button>
    </Flex>
  );
};
