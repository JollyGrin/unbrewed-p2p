import { useRef } from "react";
import { useRouter } from "next/router";
import { WebGameProvider, useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameShell } from "@/components/Game/GameShell";
import { PageSeo } from "@/components/Helmet/Head";
import { GameState } from "@/lib/gamesocket/message";
import { useGameSession } from "@/lib/gameAnalytics";

// Re-exported from its new home so the existing `@/pages/game` importers
// (hand.container, command-menu, useDeckOpenWarning, game.modal-template) keep
// resolving after the board shell moved into components/Game/GameShell.
export type { ModalType } from "@/components/Game/GameShell";

/**
 * `game_started` / `game_ended` (#1511) for this sandbox room. The game starts
 * at the first room state; whoever found nobody else in it is the host.
 */
const SandboxGameAnalytics = () => {
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

const GamePage = () => {
  return (
    <>
      <PageSeo path="/game" title="Game — Unbrewed" noindex />
      <WebGameProvider>
        <GameShell />
        <SandboxGameAnalytics />
      </WebGameProvider>
    </>
  );
};

export default GamePage;
