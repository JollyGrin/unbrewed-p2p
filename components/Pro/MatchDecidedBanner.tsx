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
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await getMatch(slug, matchId);
      if (!alive) return;
      if (r.ok) {
        const { match, players } = r.value;
        if (match.decidedBy === "organizer" && (match.status === "decided" || !!match.winner)) {
          setNotice("decided");
          return;
        }
        const sides = [players?.a, players?.b].filter(Boolean) as { userId: string }[];
        if (myUserId && sides.length > 0 && !sides.some((p) => p.userId === myUserId)) {
          setNotice("removed");
          return;
        }
      }
      timer = setTimeout(tick, DECIDED_POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
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
