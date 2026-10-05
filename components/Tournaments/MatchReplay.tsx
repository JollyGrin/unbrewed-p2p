/**
 * A match game's replay on the match page (#1218), in the existing
 * ReplayScrubber. Same load order as ReplayShareLanding: frames frozen into the
 * bundle play as-is, else the engine expands the action log.
 */
import { Box, Flex, Spinner, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { ReplayScrubber } from "@/components/Pro/ReplayScrubber";
import type { ReplayBundle, ReplayExpansion } from "@/lib/pro/protocol";
import { fetchReplayExpansion } from "@/lib/pro/replayApi";
import { expansionFromFrames, readFrames } from "@/lib/pro/replayFrames";
import { assertBundle } from "@/lib/pro/replayShare";
import { replayCosmetics } from "@/lib/pro/seatCosmetics";
import { getGameReplay } from "@/lib/tournaments/api";
import { replaySeatNames } from "@/lib/tournaments/matchPage";
import type { Game, MatchDetail } from "@/lib/tournaments/types";

import { Btn, Card } from "./ui";

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; bundle: ReplayBundle; expansion: ReplayExpansion }
  | { kind: "error"; message: string };

export const MatchReplay = ({
  slug,
  matchId,
  game,
  detail,
  onExit,
}: {
  slug: string;
  matchId: string;
  game: Game;
  /** Passed when the viewer played neither side: both seats then read as the players, not You/Opponent. */
  detail?: MatchDetail;
  onExit: () => void;
}) => {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getGameReplay(slug, matchId, game.gameIndex);
      if (!alive) return;
      if (!r.ok || !r.value) return setPhase({ kind: "error", message: "This replay isn't available yet." });
      let bundle: ReplayBundle;
      try {
        bundle = assertBundle(r.value);
      } catch {
        return setPhase({ kind: "error", message: "This replay looks corrupted." });
      }
      const frames = readFrames(r.value as ReplayBundle);
      if (frames) return setPhase({ kind: "ready", bundle, expansion: expansionFromFrames(frames) });
      const expanded = await fetchReplayExpansion(bundle);
      if (!alive) return;
      setPhase(
        expanded.ok
          ? { kind: "ready", bundle, expansion: expanded.expansion }
          : { kind: "error", message: expanded.message },
      );
    })();
    return () => {
      alive = false;
    };
  }, [slug, matchId, game.gameIndex]);

  // Stable identity: the match page re-renders every second and the scrubber memoises its view on this.
  const seatNames = useMemo(
    () => (detail && phase.kind === "ready" ? (replaySeatNames(detail, game, phase.bundle.meta) ?? undefined) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, game.gameIndex, detail?.match.id, detail?.players.a?.username, detail?.players.b?.username, !!detail],
  );
  if (phase.kind === "ready") {
    return (
      <Box position="fixed" inset={0} zIndex={50} bg="#1a0e1d">
        <ReplayScrubber expansion={phase.expansion} cosmetics={replayCosmetics(phase.bundle)} onExit={onExit} exitLabel="Back to the match" seatNames={seatNames} />
      </Box>
    );
  }
  return (
    <Flex position="fixed" inset={0} zIndex={50} bg="rgba(20,8,24,0.6)" align="center" justify="center" p="16px">
      <Card p="20px" maxW="24rem" textAlign="center">
        {phase.kind === "loading" ? (
          <Flex gap="10px" align="center" justify="center"><Spinner size="sm" /> <Text>Loading the replay…</Text></Flex>
        ) : (
          <Text>{phase.message}</Text>
        )}
        <Btn mt="14px" variant="ghost" onClick={onExit}>Close</Btn>
      </Card>
    </Flex>
  );
};
