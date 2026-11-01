/**
 * Game events for the modes with no engine (issue #1511): `sandbox` (/game),
 * `sandbox-table` (/table) and `irl` (/irl, /offline). The engine owns `pro`
 * and emits its own game events, so a client one would double-count: `pro`
 * is not a {@link ClientGameMode} and /pro/* is refused at runtime too.
 * Triggers are listed in docs/analytics.md, section 3.
 */
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { isLabsDeckId } from "@/lib/labs";
import { knownAddSource } from "@/lib/deckAnalytics";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";

export type ClientGameMode = "sandbox" | "sandbox-table" | "irl";

/** Engine parity: `finished` is the engine's game over; no client mode has one yet. */
export type GameEndReason = "finished" | "left" | "closed";

const isProPath = () =>
  typeof window !== "undefined" &&
  (window.location.pathname === "/pro" ||
    window.location.pathname.startsWith("/pro/"));

/**
 * The deck's source (#1512): the `addSource` the bag stored when it was added,
 * else a Labs import by its id; undefined otherwise (leave it out).
 */
export const deckSourceOf = (
  deck: Pick<DeckImportType, "id" | "addSource"> | undefined,
): string | undefined =>
  knownAddSource(deck as DeckImportType | undefined) ??
  (deck && isLabsDeckId(deck.id) ? "unmatched-labs" : undefined);

/**
 * One `game_started` the first time `active` is true, then exactly one
 * `game_ended`: `left` when the component unmounts (an in-app navigation),
 * `closed` on `pagehide` (sent as a beacon). A page restored from the
 * back/forward cache starts a new game. `active` latches: a later false (a
 * dropped socket, a deck swap) does not end the game.
 */
export const useGameSession = ({
  mode,
  active,
  players,
  isHost,
}: {
  mode: ClientGameMode;
  active: boolean;
  players: number;
  isHost: boolean;
}) => {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (active) setLive(true);
  }, [active]);

  // Read at send time; `game_ended` reports the most players seen.
  const latest = useRef({ players, isHost, peak: players });
  latest.current = {
    players,
    isHost,
    peak: Math.max(latest.current.peak, players),
  };

  useEffect(() => {
    if (!live || isProPath()) return;
    let open = false;
    let startedAt = 0;
    const start = () => {
      open = true;
      startedAt = Date.now();
      latest.current.peak = latest.current.players;
      track("game_started", {
        mode,
        players: latest.current.players,
        is_host: latest.current.isHost,
      });
    };
    const end = (reason: GameEndReason, beacon = false) => {
      if (!open) return;
      open = false;
      track(
        "game_ended",
        {
          mode,
          duration_s: Math.round((Date.now() - startedAt) / 1000),
          players: latest.current.peak,
          is_host: latest.current.isHost,
          end_reason: reason,
        },
        beacon ? { beacon: true } : undefined,
      );
    };
    const onHide = () => end("closed", true);
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && !open) start();
    };
    start();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      end("left");
    };
  }, [live, mode]);
};

/**
 * IRL mode (/irl) and the solo offline table (/offline), both mode `irl`:
 * one `irl_session_started` once the page knows whether a deck loaded
 * (`hasDeck`, or `settled` for "no deck / couldn't load"), then a single-seat
 * game session while the deck is on the table. Single device: always host.
 */
export const useIrlSession = ({
  offline,
  hasDeck,
  settled,
}: {
  offline: boolean;
  hasDeck: boolean;
  settled: boolean;
}) => {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !(hasDeck || settled) || isProPath()) return;
    sent.current = true;
    track("irl_session_started", { offline, has_deck: hasDeck });
  }, [offline, hasDeck, settled]);
  useGameSession({ mode: "irl", active: hasDeck, players: 1, isHost: true });
};
