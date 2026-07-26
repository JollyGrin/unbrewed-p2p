import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import { Button, Flex, Text } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameState } from "@/lib/gamesocket/message";
import { requiredVoters } from "@/lib/sandbox/gameReset";
import { colors, fonts } from "@/styles/style";
import { ChangeDeckModal } from "./change-deck.modal";
import { NewGameModal, ResetPromptDialog } from "./new-game.modal";

type GameMenus = {
  /** Open the room-wide "New game" dialog (issue #493, tier 2). */
  openNewGame: () => void;
  /** Open the per-player deck switcher (tier 1). */
  openChangeDeck: () => void;
};

const GameMenusContext = createContext<GameMenus | undefined>(undefined);

/**
 * Surfaces read this to decide whether to offer the game-lifecycle actions —
 * absent (no provider) means "omit them", the same rule dice and board actions
 * already follow in `buildDeckCommands`.
 */
export const useGameMenus = (): GameMenus | undefined =>
  useContext(GameMenusContext);

/**
 * Owns the game-lifecycle dialogs (new game, its incoming prompt, deck
 * switcher) and hands every surface — the PlayerBox control row and the ⌘
 * Actions palette — the same two entry points, so the two never fork.
 */
export const GameMenusProvider = ({ children }: PropsWithChildren) => {
  const { query } = useRouter();
  const self = (Array.isArray(query?.name) ? query.name[0] : query?.name) ?? "";
  const { gameState, resetStatus } = useWebGame();

  const [newGameOpen, setNewGameOpen] = useState(false);
  const [changeDeckOpen, setChangeDeckOpen] = useState(false);

  const players = (gameState?.content as GameState | undefined)?.players;
  // Solo when nobody else has a pool — then there is nobody to ask, and the
  // provider commits the reset immediately.
  const isSolo = useMemo(
    () => requiredVoters(players ?? {}, self).length === 0,
    [players, self],
  );

  const menus = useMemo<GameMenus>(
    () => ({
      openNewGame: () => setNewGameOpen(true),
      openChangeDeck: () => setChangeDeckOpen(true),
    }),
    [],
  );

  const openChangeDeckFromNewGame = useCallback(() => {
    setNewGameOpen(false);
    setChangeDeckOpen(true);
  }, []);

  // The request resolving (committed or declined) closes the dialog for the
  // proposer; the toast below is what tells them which way it went.
  const hadPending = useRef(false);
  useEffect(() => {
    if (resetStatus.pending) hadPending.current = true;
    else if (hadPending.current) {
      hadPending.current = false;
      setNewGameOpen(false);
    }
  }, [resetStatus.pending]);

  // Post-wipe toast, with the deck switcher one click away so the loser of the
  // last game can pick a different hero without opening a second dialog. Keyed
  // on `appliedAt` (a real wipe), not `epoch` — a fresh joiner adopts the
  // epoch without ever having had a board.
  const seenAppliedAt = useRef<number | undefined>(resetStatus.appliedAt);
  useEffect(() => {
    const appliedAt = resetStatus.appliedAt;
    if (!appliedAt || appliedAt === seenAppliedAt.current) return;
    seenAppliedAt.current = appliedAt;
    toast(
      (t) => (
        <Flex align="center" gap="0.75rem">
          <Text fontFamily={fonts.SpaceGrotesk}>New game — table cleared</Text>
          <Button
            size="xs"
            bg={colors.brand.accent}
            color={colors.brand.surfaceDim}
            _hover={{ bg: colors.brand.accentDeep }}
            onClick={() => {
              toast.dismiss(t.id);
              setChangeDeckOpen(true);
            }}
          >
            Change deck
          </Button>
        </Flex>
      ),
      { duration: 8000 },
    );
  }, [resetStatus.appliedAt]);

  return (
    <GameMenusContext.Provider value={menus}>
      {children}
      <NewGameModal
        isOpen={newGameOpen}
        onClose={() => setNewGameOpen(false)}
        onChangeDeck={openChangeDeckFromNewGame}
        isSolo={isSolo}
      />
      <ResetPromptDialog />
      <ChangeDeckModal
        isOpen={changeDeckOpen}
        onClose={() => setChangeDeckOpen(false)}
      />
    </GameMenusContext.Provider>
  );
};
