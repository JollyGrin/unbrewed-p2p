import {
  useEffect,
  useState,
  createContext,
  PropsWithChildren,
  FC,
  useContext,
  useMemo,
  useRef,
  useCallback,
  MutableRefObject,
} from "react";
import {
  ActionLogEntry,
  DiceRoll,
  GameState,
  PlayerState,
  WebsocketMessage,
} from "../gamesocket/message";
import {
  ConnectionStatus,
  initializeWebsocket,
} from "../gamesocket/socket";
import { useRouter } from "next/router";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { useLocalServerStorage } from "../hooks";
import { PositionType } from "@/components/Positions/position.type";

interface WebGameProviderValue {
  gameState: WebsocketMessage | undefined;
  gamePositions: WebsocketMessage | undefined;
  setPlayerState: () => ({ pool }: { pool: PoolType }) => void;
  setPlayerPosition: MutableRefObject<(props: PositionType) => void>;
  connectionStatus: ConnectionStatus;
  // Append a human-readable line to the local player's synced action feed.
  logAction: (text: string) => void;
  // The newest dice roll to render (local or adopted from a remote player).
  // The DiceOverlay watches this and animates it once per unique id.
  latestRoll: DiceRoll | undefined;
  // Broadcast a dice roll: displays it locally and sends it to the room.
  publishRoll: (roll: DiceRoll) => void;
}

// How many recent actions each player keeps on their blob.
const ACTION_LOG_LIMIT = 25;

export const WebGameContext = createContext<WebGameProviderValue | undefined>(
  undefined
);

export const WebGameProvider: FC<PropsWithChildren> = ({ children }) => {
  const router = useRouter();
  const slug = router.query;

  const { activeServer } = useLocalServerStorage();

  // gameState is updated from the websocket return.
  const [gameState, setGameState] = useState<string>();
  const [gamePositions, setGamePositions] = useState<string>();
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");

  // Raw senders, populated once the socket connects. Held in refs so the
  // map-sync effects below can reach them without re-subscribing on reconnect.
  const updatePlayerStateRef = useRef((_: PlayerState) => {});
  const setPlayerPosition = useRef((_: PositionType[]) => {});

  // Shared-map state. `mapUpdatedAt` is a logical clock: it tracks the highest
  // timestamp we've seen across the room, so a local change (seen + 1) always
  // beats anything we've observed. mapUrl === "" means "explicitly cleared".
  const mapSyncRef = useRef<{ url: string; updatedAt: number }>({
    url: "",
    updatedAt: 0,
  });

  // Local player's action feed. Like the map, it rides on every outgoing blob
  // so it persists across pool updates and reaches late joiners. seq is a
  // per-player monotonic counter.
  const actionLogRef = useRef<ActionLogEntry[]>([]);
  const actionSeqRef = useRef(0);

  // Dice roll sync. `lastRoll` is stamped onto every outgoing blob (like the
  // map) so it persists and reaches late joiners; `seenRollIds` dedupes so a
  // roll animates exactly once per client. `hasSeededRolls` marks the first
  // gamestate snapshot: existing rolls at join time are recorded as seen but
  // NOT animated, so a newcomer doesn't replay an old roll.
  const rollSyncRef = useRef<{ lastRoll?: DiceRoll }>({});
  const seenRollIdsRef = useRef<Set<string>>(new Set());
  const hasSeededRollsRef = useRef(false);
  const [latestRoll, setLatestRoll] = useState<DiceRoll | undefined>();

  const parsedGamePositions = useMemo(
    () =>
      typeof gamePositions === "string"
        ? (JSON.parse(gamePositions) as WebsocketMessage)
        : gamePositions,
    [gamePositions],
  );
  const parsedGameState = useMemo(
    () =>
      typeof gameState === "string"
        ? (JSON.parse(gameState) as WebsocketMessage)
        : gameState,
    [gameState],
  );

  // Keep the freshest parsed state reachable from effects that shouldn't
  // re-run every time it changes (e.g. reading the local player's pool when
  // broadcasting a map change).
  const latestGameStateRef = useRef<WebsocketMessage | undefined>();
  latestGameStateRef.current = parsedGameState;

  // Stamp every outgoing player blob with our current view of the shared map,
  // so the map survives normal pool updates and is present for late joiners.
  const stampMap = useCallback((state: PlayerState): PlayerState => {
    const { url, updatedAt } = mapSyncRef.current;
    if (updatedAt <= 0) return state;
    return { ...state, mapUrl: url, mapUpdatedAt: updatedAt };
  }, []);

  // Stamp the current action feed onto an outgoing blob, so it survives every
  // pool update the same way the map does.
  const stampLog = useCallback((state: PlayerState): PlayerState => {
    if (actionLogRef.current.length === 0) return state;
    return { ...state, actionLog: actionLogRef.current };
  }, []);

  // Stamp our latest dice roll onto an outgoing blob so it survives pool
  // updates and reaches late joiners (who record it as seen, not replay it).
  const stampRoll = useCallback((state: PlayerState): PlayerState => {
    const { lastRoll } = rollSyncRef.current;
    if (!lastRoll) return state;
    return { ...state, lastRoll };
  }, []);

  const readLocalPool = useCallback((): PoolType | undefined => {
    const name = slug?.name?.toString();
    if (!name) return undefined;
    const players = (latestGameStateRef.current?.content as GameState | undefined)
      ?.players;
    return players?.[name]?.pool;
  }, [slug?.name]);

  // This should only happen once
  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!slug?.name || !slug?.gid) {
      throw new Error(
        "WebGameProvider should be used inside of a page with a 'name' and 'gid' query param."
      );
    }

    const serverURL = new URL(activeServer);
    const { updateMyPlayerState, updateMyPlayerPosition, close } =
      initializeWebsocket({
        name: slug.name.toString(),
        gid: slug.gid.toString(),
        connectURL: serverURL,
        onGameState: (state: string) => {
          setGameState(state);
        },
        onGamePositions: (state: string) => {
          setGamePositions(state);
        },
        onStatus: setConnectionStatus,
      });

    updatePlayerStateRef.current = updateMyPlayerState;
    setPlayerPosition.current = updateMyPlayerPosition;

    return () => close();
  }, [router.isReady, slug.name, slug.gid, activeServer]);

  // Exposed player-state setter. Stable identity; always stamps the map, the
  // action feed, and the latest roll so none is lost on a normal pool update.
  const setPlayerState = useCallback(
    () => (state: PlayerState) => {
      updatePlayerStateRef.current(stampRoll(stampLog(stampMap(state))));
    },
    [stampMap, stampLog, stampRoll],
  );

  // Append a line to the local feed and broadcast it (carried alongside the
  // current pool so a lone log entry doesn't clobber deck state).
  const logAction = useCallback(
    (text: string) => {
      actionSeqRef.current += 1;
      const entry: ActionLogEntry = {
        seq: actionSeqRef.current,
        at: Date.now(),
        text,
      };
      actionLogRef.current = [...actionLogRef.current, entry].slice(
        -ACTION_LOG_LIMIT,
      );
      updatePlayerStateRef.current(
        stampRoll(stampLog(stampMap({ pool: readLocalPool() }))),
      );
    },
    [stampLog, stampMap, stampRoll, readLocalPool],
  );

  // Broadcast a dice roll: mark it seen so our own echo doesn't re-trigger,
  // show it locally, and send it to the room stamped onto the current pool.
  const publishRoll = useCallback(
    (roll: DiceRoll) => {
      rollSyncRef.current.lastRoll = roll;
      seenRollIdsRef.current.add(roll.id);
      setLatestRoll(roll);
      updatePlayerStateRef.current(
        stampRoll(stampLog(stampMap({ pool: readLocalPool() }))),
      );
    },
    [stampRoll, stampLog, stampMap, readLocalPool],
  );

  // Inbound: adopt the newest shared map from the broadcast game state and
  // reflect it into the URL (`mapUrl`), which is what the board renders from.
  useEffect(() => {
    const players = (parsedGameState?.content as GameState | undefined)?.players;
    if (!players) return;

    let winner: { url: string; updatedAt: number; name: string } | null = null;
    for (const [name, player] of Object.entries(players)) {
      const updatedAt = player?.mapUpdatedAt;
      const url = player?.mapUrl;
      if (typeof updatedAt !== "number" || typeof url !== "string") continue;
      if (
        !winner ||
        updatedAt > winner.updatedAt ||
        (updatedAt === winner.updatedAt && name > winner.name)
      ) {
        winner = { url, updatedAt, name };
      }
    }
    if (!winner) return;

    // Only move forward. Our own echoed change lands here as an equal value and
    // is ignored, so there is no feedback loop.
    if (winner.updatedAt <= mapSyncRef.current.updatedAt) return;

    mapSyncRef.current = { url: winner.url, updatedAt: winner.updatedAt };

    const currentUrl = (router.query.mapUrl as string | undefined) ?? "";
    if (currentUrl === winner.url) return;

    const query = { ...router.query };
    if (winner.url === "") {
      delete query.mapUrl;
    } else {
      query.mapUrl = winner.url;
    }
    router.replace({ query }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedGameState]);

  // Inbound: pick the newest dice roll across all players and animate it once.
  // On the first snapshot we only *seed* seen ids (no animation) so a late
  // joiner doesn't replay a roll that happened before they arrived.
  useEffect(() => {
    const players = (parsedGameState?.content as GameState | undefined)?.players;
    if (!players) return;

    let newest: DiceRoll | null = null;
    for (const player of Object.values(players)) {
      const roll = player?.lastRoll;
      if (!roll || typeof roll.id !== "string") continue;
      if (!newest || roll.at > newest.at) newest = roll;
    }

    // First gamestate after (re)connect: record every existing roll as seen but
    // don't animate any of them.
    if (!hasSeededRollsRef.current) {
      hasSeededRollsRef.current = true;
      for (const player of Object.values(players)) {
        const id = player?.lastRoll?.id;
        if (typeof id === "string") seenRollIdsRef.current.add(id);
      }
      return;
    }

    if (!newest || seenRollIdsRef.current.has(newest.id)) return;
    seenRollIdsRef.current.add(newest.id);
    setLatestRoll(newest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedGameState]);

  // Outbound: any UI that changes `mapUrl` in the URL (the in-game map modal,
  // the saved-maps picker, or a shared link) flows through here and broadcasts
  // the change to the room. Driving off the URL means we don't have to wire
  // every individual button.
  useEffect(() => {
    if (!router.isReady) return;
    const url = (router.query.mapUrl as string | undefined) ?? "";
    // Already in sync — either unchanged or we just adopted a remote value.
    if (url === mapSyncRef.current.url) return;

    const updatedAt = mapSyncRef.current.updatedAt + 1;
    mapSyncRef.current = { url, updatedAt };
    updatePlayerStateRef.current({
      pool: readLocalPool(),
      mapUrl: url,
      mapUpdatedAt: updatedAt,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.mapUrl, router.isReady]);

  // Re-broadcast our map when the socket (re)connects, covering players who set
  // a map before joining or who never send a pool update.
  useEffect(() => {
    if (connectionStatus !== "open") return;
    if (mapSyncRef.current.updatedAt <= 0) return;
    updatePlayerStateRef.current({
      pool: readLocalPool(),
      mapUrl: mapSyncRef.current.url,
      mapUpdatedAt: mapSyncRef.current.updatedAt,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  return (
    <WebGameContext.Provider
      value={{
        gamePositions: parsedGamePositions,
        gameState: parsedGameState,
        connectionStatus,
        // Call setPlayerState to update the player state on the serverside.
        setPlayerState: setPlayerState,
        logAction,
        latestRoll,
        publishRoll,
        //@ts-expect-error: this type needs to remain an array. Update this when you add more tokens
        setPlayerPosition: setPlayerPosition,
      }}
    >
      {children}
    </WebGameContext.Provider>
  );
};

export const useWebGame = (): WebGameProviderValue => {
  const context = useContext(WebGameContext);

  if (!context) {
    throw new Error("useWebGame should be used inside of <WebGameProvider />");
  }

  return context;
};
