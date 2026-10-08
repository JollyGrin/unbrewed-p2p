/**
 * A match game's replay on the match page (#1218), in the existing
 * ReplayScrubber. Same load order as ReplayShareLanding: frames frozen into the
 * bundle play as-is, else the engine expands the action log. The overlay is a
 * modal dialog (#1279, UX P14): Esc closes it, Tab stays inside it, and focus
 * goes back to what opened it.
 */
import { Box, Flex, Spinner, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Esc closes; Tab and Shift+Tab wrap inside `ref`; focus returns to the opener on close. */
export const useOverlayKeys = (ref: RefObject<HTMLElement>, onExit: () => void) => {
  const exit = useRef(onExit);
  exit.current = onExit;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root) return;
      if (e.key === "Escape") {
        e.preventDefault();
        exit.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [ref]);
};

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
  const overlay = useRef<HTMLDivElement>(null);
  useOverlayKeys(overlay, onExit);
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
  return (
    // One dialog element for every phase, so focus and the trap survive loading → ready.
    <Box ref={overlay} role="dialog" aria-modal="true" aria-label="Replay" tabIndex={-1} outline="none" data-testid="replay-overlay">
      {phase.kind === "ready" ? (
        <Box position="fixed" inset={0} zIndex={50} bg="#1a0e1d">
          <ReplayScrubber expansion={phase.expansion} cosmetics={replayCosmetics(phase.bundle)} onExit={onExit} exitLabel="Back to the match" seatNames={seatNames} />
        </Box>
      ) : (
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
      )}
    </Box>
  );
};
