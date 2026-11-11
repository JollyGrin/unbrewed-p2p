import { useEffect } from "react";
import { useRouter } from "next/router";
import { Flex, Spinner } from "@chakra-ui/react";
import { WebGameProvider } from "@/lib/contexts/WebGameProvider";
import { GameShell } from "@/components/Game/GameShell";
import { SandboxGameAnalytics } from "@/components/Game/SandboxGameAnalytics";
import { PageSeo } from "@/components/Helmet/Head";
import { GameErrorBoundary } from "@/components/ErrorBoundary/GameErrorBoundary";

// Re-exported from its new home so the existing `@/pages/game` importers
// (hand.container, command-menu, useDeckOpenWarning, game.modal-template) keep
// resolving after the board shell moved into components/Game/GameShell.
export type { ModalType } from "@/components/Game/GameShell";

const queryValue = (value: string | string[] | undefined): string => {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ?? "";
};

const GamePage = () => {
  const router = useRouter();
  const name = queryValue(router.query.name);
  const gid = queryValue(router.query.gid);
  // A bare /game (bookmark, history, truncated link) has no seat to join.
  // Send the player to /connect instead of letting WebGameProvider's
  // developer assertion surface as the crash panel (#1607).
  const missingQuery = router.isReady && (!name || !gid);
  // Hold the spinner until the query is known, so the prerendered HTML and the
  // first client render match. On a bare /game Next marks the router ready on
  // that first render, so mounting the board first would be a hydration
  // mismatch (and the provider's assertion would throw).
  const showSpinner = !router.isReady || missingQuery;

  useEffect(() => {
    if (!missingQuery) return;
    // /connect pre-fills its lobby field from ?lobby= (invite links use it).
    router.replace(
      gid ? `/connect?lobby=${encodeURIComponent(gid)}` : "/connect",
    );
  }, [missingQuery, gid, router]);

  return (
    <>
      <PageSeo path="/game" title="Game — Unbrewed" noindex />
      {showSpinner ? (
        <Flex
          h="100vh"
          align="center"
          justify="center"
          data-testid="game-loading"
        >
          <Spinner size="lg" />
        </Flex>
      ) : (
        <GameErrorBoundary boundary="sandbox">
          <WebGameProvider>
            <GameShell />
            <SandboxGameAnalytics />
          </WebGameProvider>
        </GameErrorBoundary>
      )}
    </>
  );
};

export default GamePage;
