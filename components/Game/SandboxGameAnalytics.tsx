import { useRef } from "react";
import { useRouter } from "next/router";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameState } from "@/lib/gamesocket/message";
import { useGameSession } from "@/lib/gameAnalytics";

/**
 * `game_started` / `game_ended` (#1511) for a sandbox room on /game. The game
 * starts at the first room state; whoever found nobody else in it is the host.
 */
export const SandboxGameAnalytics = () => {
  const { gameState } = useWebGame();
  const self = useRouter().query.name?.toString();
  const players = (gameState?.content as GameState | undefined)?.players;
  const names = players ? Object.keys(players) : [];
  const isHost = useRef<boolean>();
  if (players && isHost.current === undefined)
    isHost.current = names.every((n) => n === self);
  useGameSession({
    mode: "sandbox",
    active: !!players,
    players: names.length,
    isHost: !!isHost.current,
  });
  return null;
};
