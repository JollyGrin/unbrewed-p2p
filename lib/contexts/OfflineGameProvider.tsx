import {
  FC,
  PropsWithChildren,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionLogEntry,
  DiceRoll,
  GameState,
  PlayerState,
  PositionState,
  WebsocketMessage,
} from "../gamesocket/message";
import { PositionBlob } from "@/components/Positions/position.type";
import { WebGameContext } from "./WebGameProvider";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  initPool,
  initPositionBlob,
  readStarredDeck,
} from "@/lib/sandbox/initGame";

// Keep the local feed bounded exactly like the online provider does.
const ACTION_LOG_LIMIT = 25;

// The lone player's key. `?name=offline` is set on the URL so BoardContainer,
// HandContainer, HeaderContainer, and ActionLog all resolve `self` to this.
const SELF = "offline";

/**
 * A drop-in replacement for {@link WebGameProvider} that satisfies the exact
 * same {@link WebGameContext} from local `useState`/`useRef` — no websocket, no
 * server. With a single player the online provider's reconcile logic (map
 * election, dice dedup, card-transfer escrow, token claims) is all a no-op, so
 * every consumer of `useWebGame()` — BoardCanvas, HandContainer, ModalContainer,
 * ActionLog, DiceOverlay, CommandMenu, the header — works unchanged.
 *
 * The pool itself is NOT seeded here: HandContainer auto-builds it from the
 * starred deck (build → shuffle → draw) exactly as it does for a fresh /game
 * session, so offline gets a real, playable deck rather than an empty pool.
 */
export const OfflineGameProvider: FC<PropsWithChildren> = ({ children }) => {
  const [players, setPlayers] = useState<Record<string, PlayerState>>({
    [SELF]: { pool: undefined },
  });
  const [positions, setPositions] = useState<PositionState>({});
  const [latestRoll, setLatestRoll] = useState<DiceRoll | undefined>();
  const actionSeqRef = useRef(0);

  const gameState: WebsocketMessage = useMemo(
    () => ({
      msgtype: "offline",
      error: "",
      content: {
        gid: "offline",
        last_updated: "",
        players,
      } as GameState,
    }),
    [players],
  );

  const gamePositions: WebsocketMessage = useMemo(
    () => ({
      msgtype: "offline",
      error: "",
      content: positions,
    }),
    [positions],
  );

  // Matches WebGameProvider's `() => (state) => ...` shape. Merges into the
  // player blob so a pool update never clobbers the action feed (and vice
  // versa) — the online provider gets the same effect by re-stamping the log
  // onto every send.
  const setPlayerState = useCallback(
    () => (state: PlayerState) => {
      setPlayers((prev) => ({
        ...prev,
        [SELF]: { ...prev[SELF], ...state },
      }));
    },
    [],
  );

  // Position channel. Held in a ref like the online provider so BoardContainer
  // can call `setPlayerPosition.current(blob)`.
  const setPlayerPosition = useRef<(props: PositionBlob) => void>(() => {});
  setPlayerPosition.current = (blob: PositionBlob) =>
    setPositions((prev) => ({ ...prev, [SELF]: blob }));

  const logAction = useCallback((text: string) => {
    actionSeqRef.current += 1;
    const entry: ActionLogEntry = {
      seq: actionSeqRef.current,
      at: Date.now(),
      text,
    };
    setPlayers((prev) => {
      const current = prev[SELF]?.actionLog ?? [];
      return {
        ...prev,
        [SELF]: {
          ...prev[SELF],
          actionLog: [...current, entry].slice(-ACTION_LOG_LIMIT),
        },
      };
    });
  }, []);

  // DiceOverlay watches `latestRoll` and animates each unique id once, so
  // setting it directly is all a solo roll needs.
  const publishRoll = useCallback((roll: DiceRoll) => {
    setLatestRoll(roll);
  }, []);

  // Wipe and re-seed from `deck`. Shared by "New game" (the starred deck) and
  // "Change my deck" (the newly picked one) — offline they differ only in the
  // log line, since there is nobody else to clear or to ask for consent.
  const reseed = useCallback(
    (deck: DeckImportType | undefined, text: string) => {
      actionSeqRef.current = 1;
      setPlayers({
        [SELF]: {
          pool: deck ? initPool(deck) : undefined,
          actionLog: [{ seq: 1, at: Date.now(), text }],
        },
      });
      setPositions({ [SELF]: initPositionBlob(deck, SELF) });
      setLatestRoll(undefined);
    },
    [],
  );

  // Solo table: nobody to ask, so "New game" commits immediately — the same
  // shortcut the online provider takes when no other seat has a pool.
  const [reset, setReset] = useState<{ epoch: number; appliedAt?: number }>({
    epoch: 0,
  });
  const requestGameReset = useCallback(() => {
    setReset((prev) => ({ epoch: prev.epoch + 1, appliedAt: Date.now() }));
    reseed(readStarredDeck(), `New game started by ${SELF}`);
  }, [reseed]);

  const switchDeck = useCallback(
    (deck: DeckImportType) =>
      reseed(deck, `Switched to ${deck.deck_data?.hero?.name ?? deck.name}`),
    [reseed],
  );

  return (
    <WebGameContext.Provider
      value={{
        gameState,
        gamePositions,
        setPlayerState,
        setPlayerPosition,
        connectionStatus: "open",
        logAction,
        latestRoll,
        publishRoll,
        // No opponents offline, so these are never reachable: the hand's
        // give-to-player menu is built from the (empty) opponents list, and
        // foreign card tokens (the only pickup trigger) never exist. Kept as
        // no-ops purely to satisfy the context shape.
        offerCardTransfer: () => {},
        claimTableCard: () => {},
        // Reset: no consent step and no protocol, so only the commit path is
        // real. There is never a request to cancel, force or answer.
        resetStatus: reset,
        requestGameReset,
        cancelGameReset: () => {},
        forceGameReset: requestGameReset,
        respondGameReset: () => {},
        switchDeck,
      }}
    >
      {children}
    </WebGameContext.Provider>
  );
};
