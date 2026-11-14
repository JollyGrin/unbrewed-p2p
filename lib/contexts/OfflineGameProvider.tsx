import { ACTION_LOG_LIMIT } from "@/lib/sandbox/gameLog";
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
  TransferZone,
  WebsocketMessage,
} from "../gamesocket/message";
import {
  PositionBlob,
  migrateBlob,
} from "@/components/Positions/position.type";
import { HotseatControls, WebGameContext } from "./WebGameProvider";
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import {
  PoolType,
  addCardToDeckBottom,
  addCardToDeckTop,
  addCardToDiscard,
  addCardToHand,
} from "@/components/DeckPool/PoolFns";
import {
  initPool,
  initPositionBlob,
  readStarredDeck,
} from "@/lib/sandbox/initGame";

// Keep the local feed bounded exactly like the online provider does.

// The first (and, without hotseat, the lone) player's key. `?name=offline` is
// set on the URL so BoardContainer, HandContainer, HeaderContainer, and
// ActionLog all resolve `self` to this.
const SELF = "offline";

// The key of the seat `hotseat.addSeat` creates (issue #1562).
const OPPONENT = "opponent";

const heroName = (deck: DeckImportType) =>
  deck.deck_data?.hero?.name ?? deck.name;

// The zones a card can be handed into — the same PoolFns the online
// provider's recipient reconcile applies (docs/card-transfer-plan.md).
const ZONE_FNS: Record<
  TransferZone,
  (pool: PoolType, card: DeckImportCardType) => PoolType
> = {
  hand: addCardToHand,
  discard: addCardToDiscard,
  deckTop: addCardToDeckTop,
  deckBottom: addCardToDeckBottom,
};

// PoolFns mutate in place; copy the arrays they touch so a state update never
// edits the object a previous render is still holding.
const copyZones = (pool: PoolType): PoolType => ({
  ...pool,
  hand: [...pool.hand],
  discard: [...pool.discard],
  deck: pool.deck ? [...pool.deck] : pool.deck,
});

/**
 * A drop-in replacement for {@link WebGameProvider} that satisfies the exact
 * same {@link WebGameContext} from local `useState`/`useRef` — no websocket, no
 * server. Every consumer of `useWebGame()` — BoardCanvas, HandContainer,
 * ModalContainer, ActionLog, DiceOverlay, CommandMenu, the header — works
 * unchanged.
 *
 * The first seat's pool is NOT seeded here: HandContainer auto-builds it from
 * the starred deck (build → shuffle → draw) exactly as it does for a fresh
 * /game session, so offline gets a real, playable deck rather than an empty
 * pool.
 *
 * Hotseat (issue #1562): `hotseat.addSeat(deck)` adds a second local seat,
 * `opponent`, seeded eagerly from its own deck, and `hotseat.setActive` picks
 * which seat the writers (`setPlayerState`, `setPlayerPosition`, `logAction`)
 * act for. Both seats live on this one device, so card handoff needs no
 * escrow: a transfer or a table pickup moves the card in a single update.
 * With one seat (no `addSeat` call) everything behaves exactly as before.
 */
export const OfflineGameProvider: FC<PropsWithChildren> = ({ children }) => {
  const [players, setPlayers] = useState<Record<string, PlayerState>>({
    [SELF]: { pool: undefined },
  });
  const [positions, setPositions] = useState<PositionState>({});
  const [latestRoll, setLatestRoll] = useState<DiceRoll | undefined>();
  const actionSeqRef = useRef(0);

  // Seats, in order; the first is always SELF. The active seat lives in a ref
  // as well as state so the writers keep a stable identity across switches.
  const [seats, setSeats] = useState<string[]>([SELF]);
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const [active, setActiveState] = useState(SELF);
  const activeRef = useRef(SELF);

  // The deck each seat was seeded from (`deckFor`). The first seat is seeded
  // by the hand's auto-init from the starred deck, so it only gets an entry
  // once the provider itself seeds it (reset / switch).
  const decksRef = useRef<Record<string, DeckImportType>>({});

  // Latest committed state, for the handoff paths that need to read before
  // they write (both are user clicks, long after the render that set these).
  const playersRef = useRef(players);
  playersRef.current = players;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

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
  // onto every send. Writes for the active seat, read at call time.
  const setPlayerState = useCallback(
    () => (state: PlayerState) => {
      const seat = activeRef.current;
      setPlayers((prev) => ({
        ...prev,
        [seat]: { ...prev[seat], ...state },
      }));
    },
    [],
  );

  // Position channel. Held in a ref like the online provider so BoardContainer
  // can call `setPlayerPosition.current(blob)`.
  const setPlayerPosition = useRef<(props: PositionBlob) => void>(() => {});
  setPlayerPosition.current = (blob: PositionBlob) => {
    const seat = activeRef.current;
    setPositions((prev) => ({ ...prev, [seat]: blob }));
  };

  // Next feed entry. One counter for every seat: each seat's entries are
  // keyed by seat name in the merged feed, so a shared counter is harmless.
  const nextEntry = useCallback((text: string): ActionLogEntry => {
    actionSeqRef.current += 1;
    return { seq: actionSeqRef.current, at: Date.now(), text };
  }, []);

  // Append to one seat's feed. ActionLog merges every seat's feed, so the
  // table still reads as one log.
  const appendLog = useCallback(
    (seat: string, entry: ActionLogEntry) => {
      setPlayers((prev) => {
        const current = prev[seat]?.actionLog ?? [];
        return {
          ...prev,
          [seat]: {
            ...prev[seat],
            actionLog: [...current, entry].slice(-ACTION_LOG_LIMIT),
          },
        };
      });
    },
    [],
  );

  const logAction = useCallback(
    (text: string) => appendLog(activeRef.current, nextEntry(text)),
    [appendLog, nextEntry],
  );

  // DiceOverlay watches `latestRoll` and animates each unique id once, so
  // setting it directly is all a solo roll needs.
  const publishRoll = useCallback((roll: DiceRoll) => {
    setLatestRoll(roll);
  }, []);

  // Wipe and re-seed every seat: the first from `firstDeck` (the starred deck
  // for "New game", the newly picked one for a solo "Change my deck"), every
  // added seat from the deck it was added with. The one log line goes on the
  // first seat. With one seat this is exactly the pre-hotseat reseed.
  const reseed = useCallback(
    (firstDeck: DeckImportType | undefined, text: string) => {
      actionSeqRef.current = 1;
      if (firstDeck) decksRef.current[SELF] = firstDeck;
      else delete decksRef.current[SELF];
      const nextPlayers: Record<string, PlayerState> = {};
      const nextPositions: PositionState = {};
      for (const seat of seatsRef.current) {
        const deck = seat === SELF ? firstDeck : decksRef.current[seat];
        nextPlayers[seat] =
          seat === SELF
            ? {
                pool: deck ? initPool(deck) : undefined,
                actionLog: [{ seq: 1, at: Date.now(), text }],
              }
            : { pool: deck ? initPool(deck) : undefined };
        nextPositions[seat] = initPositionBlob(deck, seat);
      }
      setPlayers(nextPlayers);
      setPositions(nextPositions);
      setLatestRoll(undefined);
    },
    [],
  );

  // Nobody to ask — every seat is on this device — so "New game" commits
  // immediately, the same shortcut the online provider takes when no other
  // seat has a pool.
  const [reset, setReset] = useState<{ epoch: number; appliedAt?: number }>({
    epoch: 0,
  });
  const requestGameReset = useCallback(() => {
    setReset((prev) => ({ epoch: prev.epoch + 1, appliedAt: Date.now() }));
    reseed(readStarredDeck(), `New game started by ${activeRef.current}`);
  }, [reseed]);

  // "Change my deck". Solo, this is the full reseed it has always been; with
  // an opponent seated it touches the active seat only, like the online
  // provider's per-player switch.
  const switchDeck = useCallback(
    (deck: DeckImportType) => {
      const text = `Switched to ${heroName(deck)}`;
      if (seatsRef.current.length === 1) {
        reseed(deck, text);
        return;
      }
      const seat = activeRef.current;
      decksRef.current[seat] = deck;
      const entry = nextEntry(text);
      const pool = initPool(deck);
      const blob = initPositionBlob(deck, seat);
      setPlayers((prev) => ({
        ...prev,
        [seat]: {
          ...prev[seat],
          pool,
          actionLog: [...(prev[seat]?.actionLog ?? []), entry].slice(
            -ACTION_LOG_LIMIT,
          ),
        },
      }));
      setPositions((prev) => ({ ...prev, [seat]: blob }));
    },
    [reseed, nextEntry],
  );

  // ---- Hotseat (issue #1562) ----

  const setActive = useCallback((name: string) => {
    if (!seatsRef.current.includes(name)) return;
    activeRef.current = name;
    setActiveState(name);
  }, []);

  // Seed the new seat's pool AND board here, eagerly: the hand's 500 ms and
  // the board's 1500 ms auto-init timers only fire for a seat with no pool /
  // no blob, so they never fire for this one. One opponent seat at most.
  const addSeat = useCallback(
    (deck: DeckImportType) => {
      if (seatsRef.current.includes(OPPONENT)) return;
      decksRef.current[OPPONENT] = deck;
      seatsRef.current = [...seatsRef.current, OPPONENT];
      setSeats(seatsRef.current);
      const pool = initPool(deck);
      const blob = initPositionBlob(deck, OPPONENT);
      setPlayers((prev) => ({ ...prev, [OPPONENT]: { pool } }));
      setPositions((prev) => ({ ...prev, [OPPONENT]: blob }));
      appendLog(SELF, nextEntry(`Added ${heroName(deck)} as opponent`));
    },
    [appendLog, nextEntry],
  );

  const removeSeat = useCallback((name: string) => {
    if (name === SELF || !seatsRef.current.includes(name)) return;
    delete decksRef.current[name];
    seatsRef.current = seatsRef.current.filter((seat) => seat !== name);
    setSeats(seatsRef.current);
    const drop = <T,>(prev: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(prev).filter(([seat]) => seat !== name),
      ) as Record<string, T>;
    setPlayers(drop);
    setPositions(drop);
    if (activeRef.current === name) {
      activeRef.current = SELF;
      setActiveState(SELF);
    }
  }, []);

  const deckFor = useCallback(
    (name: string): DeckImportType | undefined =>
      decksRef.current[name] ?? (name === SELF ? readStarredDeck() : undefined),
    [],
  );

  // Give a card to another seat. `pool` is the giver's pool AFTER removing
  // the card (HandContainer splices it out), so one update moves it: the
  // giver's pool and the card in the recipient's zone. Same log line as the
  // online recipient writes. A recipient with no pool yet gets nothing, so
  // the card goes back to the giver's hand rather than vanishing.
  const offerCardTransfer = useCallback(
    (to: string, zone: TransferZone, card: DeckImportCardType, pool: PoolType) => {
      const from = activeRef.current;
      if (to === from || !(to in playersRef.current)) return;
      const target = playersRef.current[to]?.pool;
      if (!target) {
        setPlayers((prev) => ({
          ...prev,
          [from]: { ...prev[from], pool: addCardToHand(copyZones(pool), card) },
        }));
        return;
      }
      const entry = nextEntry(`Received a card from ${from}`);
      setPlayers((prev) => {
        const recipient = prev[to];
        if (!recipient?.pool) return prev;
        return {
          ...prev,
          [from]: { ...prev[from], pool },
          [to]: {
            ...recipient,
            pool: ZONE_FNS[zone](copyZones(recipient.pool), card),
            actionLog: [...(recipient.actionLog ?? []), entry].slice(
              -ACTION_LOG_LIMIT,
            ),
          },
        };
      });
    },
    [nextEntry],
  );

  // Pick a card token up off another seat's table area: the card goes to the
  // active seat's hand and the token leaves the owner's board. No claim to
  // wait on — the owner is on this device too. Mirrors the online owner's
  // log line.
  const claimTableCard = useCallback(
    (tokenId: string, owner: string) => {
      const claimant = activeRef.current;
      if (owner === claimant) return;
      if (!playersRef.current[claimant]?.pool) return;
      const blob = migrateBlob(positionsRef.current[owner]);
      const token = blob.tokens.find((t) => t.id === tokenId);
      if (!token?.card) return;
      const card = token.card;
      const entry = nextEntry(`${claimant} picked up a card from the table`);
      setPlayers((prev) => {
        const mine = prev[claimant];
        if (!mine?.pool) return prev;
        return {
          ...prev,
          [claimant]: {
            ...mine,
            pool: addCardToHand(copyZones(mine.pool), card),
          },
          [owner]: {
            ...prev[owner],
            actionLog: [...(prev[owner]?.actionLog ?? []), entry].slice(
              -ACTION_LOG_LIMIT,
            ),
          },
        };
      });
      setPositions((prev) => ({
        ...prev,
        [owner]: {
          color: blob.color,
          tokens: blob.tokens.filter((t) => t.id !== tokenId),
        },
      }));
    },
    [nextEntry],
  );

  const hotseat: HotseatControls = useMemo(
    () => ({ seats, active, setActive, addSeat, removeSeat }),
    [seats, active, setActive, addSeat, removeSeat],
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
        offerCardTransfer,
        claimTableCard,
        // Reset: no consent step and no protocol, so only the commit path is
        // real. There is never a request to cancel, force or answer.
        resetStatus: reset,
        requestGameReset,
        cancelGameReset: () => {},
        forceGameReset: requestGameReset,
        respondGameReset: () => {},
        switchDeck,
        hotseat,
        deckFor,
      }}
    >
      {children}
    </WebGameContext.Provider>
  );
};
