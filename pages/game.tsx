import { WebGameProvider } from "@/lib/contexts/WebGameProvider";
import { GameShell } from "@/components/Game/GameShell";
import { PageSeo } from "@/components/Helmet/Head";

// Re-exported from its new home so the existing `@/pages/game` importers
// (hand.container, command-menu, useDeckOpenWarning, game.modal-template) keep
// resolving after the board shell moved into components/Game/GameShell.
export type { ModalType } from "@/components/Game/GameShell";

const GamePage = () => {
  return (
    <>
      <PageSeo path="/game" title="Game — Unbrewed" noindex />
      <WebGameProvider>
        <GameShell />
      </WebGameProvider>
    </>
  );
};

export default GamePage;
