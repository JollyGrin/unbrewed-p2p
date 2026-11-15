import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import {
  JOIN_REPLAY_GRACE_MS,
  useWebGame,
} from "@/lib/contexts/WebGameProvider";
import { armSoundEngine, playSound } from "@/lib/sound";
import { getSoundPrefs } from "@/lib/sound/settings";
import { createTableTracker } from "./tableTracker";

/**
 * After a reconnect, changes that piled up meanwhile arrive silently. The
 * relay's join replay is what delivers them, and the provider waits up to
 * JOIN_REPLAY_GRACE_MS for it, so the quiet has to outlast that wait: a
 * replay landing right at the end of the grace is still a catch-up.
 */
export const RECONNECT_QUIET_MS = JOIN_REPLAY_GRACE_MS + 1000;

/**
 * Gives the table its sounds. Renders nothing: it arms the audio engine for
 * the player's first gesture and feeds the game state to the tracker, which
 * works out what changed and what that sounds like. Mounted once in
 * GameShell, so it runs the same online, on /connect and on /offline.
 */
export const TableSounds = () => {
  const { gameState, gamePositions, latestRoll, connectionStatus } =
    useWebGame();
  const rawName = useRouter().query?.name;
  const self = Array.isArray(rawName) ? rawName[0] : rawName;

  const [tracker] = useState(() =>
    createTableTracker({
      play: playSound,
      hearOthers: () => getSoundPrefs().others,
    }),
  );

  useEffect(() => armSoundEngine(), []);
  useEffect(() => () => tracker.dispose(), [tracker]);

  useEffect(() => {
    if (connectionStatus !== "open") {
      tracker.setQuiet(true);
      return;
    }
    const timer = setTimeout(() => tracker.setQuiet(false), RECONNECT_QUIET_MS);
    return () => clearTimeout(timer);
  }, [connectionStatus, tracker]);

  useEffect(() => {
    const players = (
      gameState?.content as { players?: Record<string, unknown> } | undefined
    )?.players;
    tracker.onPlayers(players, self);
  }, [gameState, self, tracker]);

  useEffect(() => {
    tracker.onPositions(
      gamePositions?.content as Record<string, unknown> | undefined,
      self,
    );
  }, [gamePositions, self, tracker]);

  useEffect(() => {
    tracker.onRoll(latestRoll, self);
    // `self` is read when a roll arrives; a seat switch is not a new roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestRoll, tracker]);

  return null;
};
