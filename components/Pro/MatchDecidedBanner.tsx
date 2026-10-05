/**
 * "The organizer decided this match" (p2p #1256, D4): a viewer sitting in a
 * tournament game room (waiting room or game) is told, without touching the
 * socket protocol, once the organizer has decided the match from the match
 * page. The room is known from the remembered tournament room; the match is
 * polled. Nothing is shown for any other way a match ends.
 */
import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { tournamentMatchHref, type TournamentRoom } from "@/lib/pro/tournamentTicket";
import { getMatch } from "@/lib/tournaments/api";

export const DECIDED_POLL_MS = 15_000;

export const MatchDecidedBanner = ({ at }: { at: TournamentRoom | null }) => {
  const [decided, setDecided] = useState(false);
  const slug = at?.slug;
  const matchId = at?.matchId;

  useEffect(() => {
    setDecided(false);
    if (!slug || !matchId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await getMatch(slug, matchId);
      if (!alive) return;
      if (r.ok && r.value.match.decidedBy === "organizer" && (r.value.match.status === "decided" || !!r.value.match.winner)) {
        setDecided(true);
        return;
      }
      timer = setTimeout(tick, DECIDED_POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [slug, matchId]);

  if (!at || !decided) return null;
  return (
    <Flex
      role="status"
      data-testid="match-decided-banner"
      position="fixed"
      top={0}
      left={0}
      right={0}
      zIndex={400}
      justify="center"
      align="center"
      gap="0.75rem"
      flexWrap="wrap"
      px="1rem"
      py="0.6rem"
      bg="brand.accent"
      color="brand.surfaceDim"
      fontFamily="SpaceGrotesk"
      textAlign="center"
    >
      <Box as={Text} fontWeight={700}>The organizer decided this match. This game won&apos;t count.</Box>
      <Button as={Link} href={tournamentMatchHref(at)} size="sm" bg="brand.surfaceDim" color="brand.accent" _hover={{ textDecoration: "none", opacity: 0.85 }}>
        Back to the match
      </Button>
    </Flex>
  );
};
