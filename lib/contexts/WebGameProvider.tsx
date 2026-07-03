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
  CardTransfer,
  DiceRoll,
  GameState,
  PlayerState,
  PositionState,
  TokenClaim,
  TransferZone,
  WebsocketMessage,
} from "../gamesocket/message";
import {
  ConnectionStatus,
  initializeWebsocket,
} from "../gamesocket/socket";
import { useRouter } from "next/router";
import {
  PoolType,
  addCardToDeckBottom,
  addCardToDeckTop,
  addCardToDiscard,
  addCardToHand,
} from "@/components/DeckPool/PoolFns";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { useLocalServerStorage } from "../hooks";
import {
  PositionBlob,
  migrateBlob,
} from "@/components/Positions/position.type";

interface WebGameProviderValue {
  gameState: WebsocketMessage | undefined;
  gamePositions: WebsocketMessage | undefined;
  setPlayerState: () => ({ pool }: { pool: PoolType }) => void;
  setPlayerPosition: MutableRefObject<(props: PositionBlob) => void>;
  connectionStatus: ConnectionStatus;
  // Append a human-readable line to the local player's synced action feed.
  logAction: (text: string) => void;
  // The newest dice roll to render (local or adopted from a remote player).
  // The DiceOverlay watches this and animates it once per unique id.
  latestRoll: DiceRoll | undefined;
  // Broadcast a dice roll: displays it locally and sends it to the room.
  publishRoll: (roll: DiceRoll) => void;
  // Escrow a card for another player (docs/card-transfer-plan.md). The caller
  // has already removed the card from `pool`; both changes broadcast together
  // so the card is never in zero or two places.
  offerCardTransfer: (
    to: string,
    zone: TransferZone,
    card: DeckImportCardType,
    pool: PoolType,
  ) => void;
  // Ask to pick a card token off another player's table area
  // (docs/card-pickup-plan.md). Resolves via the owner's client.
  claimTableCard: (tokenId: string, owner: string) => void;
}

// Claims the owner never answers (offline) expire after this long.
const CLAIM_TTL_MS = 60_000;

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
  const setPlayerPosition = useRef((_: PositionBlob) => {});

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

  // Card handoff state, stamped onto every outgoing blob (see message.ts for
  // the model). Seeded once from our own echoed blob on the first snapshot so
  // in-flight escrows/claims survive a refresh (the relay replays on join).
  const pendingTransfersRef = useRef<CardTransfer[]>([]);
  const appliedTransfersRef = useRef<Set<string>>(new Set());
  const tokenClaimsRef = useRef<TokenClaim[]>([]);
  const transferSeqRef = useRef(0);
  const hasSeededHandoffRef = useRef(false);

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

  // Stamp the card-handoff fields onto an outgoing blob. Unlike the other
  // stamps these must NEVER be dropped from a send — a blob without them
  // whole-blob-replaces the escrow server-side, losing an in-flight card.
  const stampHandoff = useCallback((state: PlayerState): PlayerState => {
    const next = { ...state };
    if (pendingTransfersRef.current.length > 0)
      next.pendingTransfers = pendingTransfersRef.current;
    if (appliedTransfersRef.current.size > 0)
      next.appliedTransfers = [...appliedTransfersRef.current];
    if (tokenClaimsRef.current.length > 0)
      next.tokenClaims = tokenClaimsRef.current;
    return next;
  }, []);

  // The one way out: every playerstate send carries every stamp. The map
  // effects used to call the raw sender with partial blobs, which clobbered
  // the log/roll (and would clobber escrows) until the next stamped send.
  const broadcast = useCallback(
    (state: PlayerState) => {
      updatePlayerStateRef.current(
        stampHandoff(stampRoll(stampLog(stampMap(state)))),
      );
    },
    [stampHandoff, stampRoll, stampLog, stampMap],
  );

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
  // action feed, the latest roll, and the handoff fields so none is lost on a
  // normal pool update.
  const setPlayerState = useCallback(
    () => (state: PlayerState) => {
      broadcast(state);
    },
    [broadcast],
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
      broadcast({ pool: readLocalPool() });
    },
    [broadcast, readLocalPool],
  );

  // Broadcast a dice roll: mark it seen so our own echo doesn't re-trigger,
  // show it locally, and send it to the room stamped onto the current pool.
  const publishRoll = useCallback(
    (roll: DiceRoll) => {
      rollSyncRef.current.lastRoll = roll;
      seenRollIdsRef.current.add(roll.id);
      setLatestRoll(roll);
      broadcast({ pool: readLocalPool() });
    },
    [broadcast, readLocalPool],
  );

  // Escrow a card for another player. `pool` is the caller's pool AFTER
  // removing the card — one broadcast moves the card from pool to escrow.
  const offerCardTransfer = useCallback(
    (to: string, zone: TransferZone, card: DeckImportCardType, pool: PoolType) => {
      const self = slug?.name?.toString() ?? "";
      transferSeqRef.current += 1;
      pendingTransfersRef.current = [
        ...pendingTransfersRef.current,
        {
          id: `${self}#give${Date.now().toString(36)}-${transferSeqRef.current}`,
          from: self,
          to,
          card,
          zone,
          createdAt: Date.now(),
        },
      ];
      broadcast({ pool });
    },
    [broadcast, slug?.name],
  );

  // Ask the owner of a table card to hand it over. Idempotent per token.
  const claimTableCard = useCallback(
    (tokenId: string, owner: string) => {
      if (tokenClaimsRef.current.some((c) => c.tokenId === tokenId)) return;
      tokenClaimsRef.current = [
        ...tokenClaimsRef.current,
        { tokenId, owner, claimedAt: Date.now() },
      ];
      broadcast({ pool: readLocalPool() });
    },
    [broadcast, readLocalPool],
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

  // Card-handoff reconcile (docs/card-pickup-plan.md). Runs on every
  // snapshot; every branch dedups, so the steady state broadcasts nothing.
  useEffect(() => {
    const self = slug?.name?.toString();
    const players = (parsedGameState?.content as GameState | undefined)
      ?.players;
    if (!self || !players) return;

    // Seed once from our own replayed blob (join replay) so in-flight
    // escrows, acks, and claims survive a refresh.
    if (!hasSeededHandoffRef.current) {
      hasSeededHandoffRef.current = true;
      const mine = players[self];
      for (const id of mine?.appliedTransfers ?? [])
        appliedTransfersRef.current.add(id);
      const knownPending = new Set(pendingTransfersRef.current.map((t) => t.id));
      pendingTransfersRef.current = [
        ...pendingTransfersRef.current,
        ...(mine?.pendingTransfers ?? []).filter((t) => !knownPending.has(t.id)),
      ];
      const knownClaims = new Set(tokenClaimsRef.current.map((c) => c.tokenId));
      tokenClaimsRef.current = [
        ...tokenClaimsRef.current,
        ...(mine?.tokenClaims ?? []).filter((c) => !knownClaims.has(c.tokenId)),
      ];
    }

    const logs: string[] = [];
    let dirty = false;

    // 1. Recipient: apply transfers addressed to me. PoolFns mutate the pool
    // in place (the same object readLocalPool serves to the broadcast below).
    const zoneFns: Record<
      TransferZone,
      (pool: PoolType, card: DeckImportCardType) => PoolType
    > = {
      hand: addCardToHand,
      discard: addCardToDiscard,
      deckTop: addCardToDeckTop,
      deckBottom: addCardToDeckBottom,
    };
    for (const [name, ps] of Object.entries(players)) {
      if (name === self) continue;
      for (const t of ps?.pendingTransfers ?? []) {
        if (t.to !== self || appliedTransfersRef.current.has(t.id)) continue;
        const pool = readLocalPool();
        if (!pool) continue; // pool not built yet — retried on a later snapshot
        zoneFns[t.zone]?.(pool, t.card);
        appliedTransfersRef.current.add(t.id);
        logs.push(`Received a card from ${t.from}`);
        dirty = true;
      }
    }

    // 2. Sender: recipient acked → the card has arrived, drop the escrow.
    const stillPending = pendingTransfersRef.current.filter(
      (t) => !(players[t.to]?.appliedTransfers ?? []).includes(t.id),
    );
    if (stillPending.length !== pendingTransfersRef.current.length) {
      pendingTransfersRef.current = stillPending;
      dirty = true;
    }

    // 3. Recipient: prune acks nobody advertises anymore (bounds the list;
    // rides the next send, no broadcast needed just for this).
    const advertised = new Set(
      Object.values(players).flatMap((p) =>
        (p?.pendingTransfers ?? []).map((t) => t.id),
      ),
    );
    const keptApplied = [...appliedTransfersRef.current].filter((id) =>
      advertised.has(id),
    );
    if (keptApplied.length !== appliedTransfersRef.current.size) {
      appliedTransfersRef.current = new Set(keptApplied);
    }

    // 4. Owner: grant claims on my card tokens. Escrow FIRST (broadcast
    // below), token deletion after — the card is never in zero places, and
    // the deterministic `take-<tokenId>` id makes a re-run harmless.
    const posBlobs = (parsedGamePositions?.content ?? {}) as PositionState;
    const myBlob = migrateBlob(posBlobs[self]);
    const claimsByToken = new Map<
      string,
      { claimant: string; claimedAt: number }[]
    >();
    for (const [name, ps] of Object.entries(players)) {
      if (name === self) continue;
      for (const c of ps?.tokenClaims ?? []) {
        if (c.owner !== self) continue;
        const arr = claimsByToken.get(c.tokenId) ?? [];
        arr.push({ claimant: name, claimedAt: c.claimedAt });
        claimsByToken.set(c.tokenId, arr);
      }
    }
    const grantedTokenIds: string[] = [];
    for (const [tokenId, claimants] of claimsByToken) {
      const token = myBlob.tokens.find((t) => t.id === tokenId);
      if (!token?.card) continue; // already granted or never ours — claimant prunes
      const transferId = `take-${tokenId}`;
      if (!pendingTransfersRef.current.some((t) => t.id === transferId)) {
        const winner = [...claimants].sort(
          (a, b) =>
            a.claimedAt - b.claimedAt || a.claimant.localeCompare(b.claimant),
        )[0];
        pendingTransfersRef.current = [
          ...pendingTransfersRef.current,
          {
            id: transferId,
            from: self,
            to: winner.claimant,
            card: token.card,
            zone: "hand",
            createdAt: Date.now(),
          },
        ];
        logs.push(`${winner.claimant} picked up a card from the table`);
        dirty = true;
      }
      grantedTokenIds.push(tokenId);
    }

    // 5. Claimant: drop claims whose token vanished (the escrow transfer
    // delivers the card via step 1) or that expired unanswered. Only judge
    // absence once we actually have the owner's position blob.
    const now = Date.now();
    const keptClaims = tokenClaimsRef.current.filter((c) => {
      if (now - c.claimedAt >= CLAIM_TTL_MS) return false;
      if (!(c.owner in posBlobs)) return true;
      return migrateBlob(posBlobs[c.owner]).tokens.some(
        (t) => t.id === c.tokenId,
      );
    });
    if (keptClaims.length !== tokenClaimsRef.current.length) {
      tokenClaimsRef.current = keptClaims;
    }

    // Broadcast once per change-set: logAction carries all stamps + pool, so
    // it doubles as the state send. Escrow rides this BEFORE token deletion.
    if (logs.length > 0) {
      logs.forEach((text) => logAction(text));
    } else if (dirty) {
      broadcast({ pool: readLocalPool() });
    }

    // Now it is safe to take granted tokens off the table.
    if (grantedTokenIds.length > 0) {
      setPlayerPosition.current({
        color: myBlob.color,
        tokens: myBlob.tokens.filter((t) => !grantedTokenIds.includes(t.id)),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedGameState, parsedGamePositions]);

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
    broadcast({ pool: readLocalPool() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.mapUrl, router.isReady]);

  // Re-broadcast our map when the socket (re)connects, covering players who set
  // a map before joining or who never send a pool update.
  useEffect(() => {
    if (connectionStatus !== "open") return;
    if (mapSyncRef.current.updatedAt <= 0) return;
    broadcast({ pool: readLocalPool() });
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
        setPlayerPosition: setPlayerPosition,
        offerCardTransfer,
        claimTableCard,
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
