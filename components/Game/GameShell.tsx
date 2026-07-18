import { BoardCanvas } from "@/components/BoardCanvas";
import { HandContainer, HeaderContainer, ModalContainer } from "@/components/Game";
import { GameLayout } from "@/components/Game/game.layout";
import { CommandMenu } from "@/components/Game/CommandMenu/command-menu";
import { ActionLog } from "@/components/Game/ActionLog/action-log";
import { ReportBugButton } from "@/components/Game/ReportBugButton";
import { TokenLibraryModal } from "@/components/Positions/token-library.modal";
import { TokenEditPanel } from "@/components/Positions/token-edit.panel";
import { CardTokenPanel } from "@/components/Positions/card-token.panel";
import { CardPickupPanel } from "@/components/Positions/card-pickup.panel";
import { CardPeek, PeekAnchor } from "@/components/Positions/card-peek";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import {
  BoardActions,
  BoardToken,
  DEFAULT_CARD_TOKEN_WIDTH,
  DEFAULT_PLAYER_COLOR,
  OwnedToken,
  PlayCardToTable,
  PositionBlob,
  cardTokenHeight,
  migrateBlob,
  newTokenId,
} from "@/components/Positions/position.type";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameState } from "@/lib/gamesocket/message";
import {
  addCardToDeckBottom,
  addCardToDeckTop,
  addCardToDiscard,
  addCardToHand,
  adjustHp,
} from "@/components/DeckPool/PoolFns";
import { iconToSvg, useGameIcons } from "@/lib/icons/gameIcons";
import { Box, Button, useDisclosure } from "@chakra-ui/react";
import { PlusSquareIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { throttle } from "lodash";

// dice-box-threejs touches window/document on load, so render it client-only.
const DiceOverlay = dynamic(() => import("@/components/Game/Dice/DiceOverlay"), {
  ssr: false,
});
import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDeckOpenWarning } from "@/components/Game/useDeckOpenWarning";
import { DeckOpenWarningDialog } from "@/components/Game/deck-open-warning.modal";

export type ModalType = "hand" | "discard" | "deck" | "commit" | false;

/**
 * The full game board shell: header HUD, board canvas, hand, dice, action log,
 * command menu, and the modal/token panels. It reads everything it needs from
 * `useWebGame()`, so it works identically under the live `WebGameProvider`
 * (online + /connect sandbox) and the `OfflineGameProvider` (solo, no socket).
 * `BoardContainer` reads `self` from `query.name` (`offline` for offline play).
 */
export const GameShell = () => {
  const { query } = useRouter();
  const disclosure = useDisclosure();
  const tokenLibraryDisclosure = useDisclosure();
  const [modalType, setModalType] = useState<ModalType>(false);
  const { requestModal, pendingWarning, confirmOpen, cancelOpen } =
    useDeckOpenWarning(setModalType);

  // Hand → board bridge: BoardContainer fills it, HandContainer calls it.
  const playToTableRef = useRef<PlayCardToTable>(() => {});
  // Board-owned macros (reveal hand / return revealed) that touch both pool and
  // tokens: BoardContainer fills this, the hand controls call it.
  const boardActionsRef = useRef<BoardActions>({
    revealHand: () => {},
    returnRevealedHand: () => {},
  });

  useEffect(() => {
    if (modalType) {
      disclosure.onOpen();
    } else {
      disclosure.onClose();
    }
  }, [modalType, disclosure]);

  return (
    <GameLayout>
      <ModalWrapper
        {...disclosure}
        modalType={modalType}
        setModalType={setModalType}
      />
      <DeckOpenWarningDialog
        isOpen={pendingWarning}
        onCancel={cancelOpen}
        onConfirm={confirmOpen}
      />
      <HeaderContainer openPositionModal={tokenLibraryDisclosure.onOpen} />
      <BoardContainer
        self={query?.name as string}
        tokenLibrary={tokenLibraryDisclosure}
        playToTableRef={playToTableRef}
        boardActionsRef={boardActionsRef}
      />
      <HandWrapper
        setModalType={requestModal}
        {...{ playToTableRef, boardActionsRef }}
      />
      <DiceOverlay />
      <ReportBugButton />
      <ActionLog />
      <CommandMenu
        openModal={requestModal}
        openTokenLibrary={tokenLibraryDisclosure.onOpen}
      />
    </GameLayout>
  );
};

/**
 * Quick hack to reuse hand-container for offline
 * */
const HandWrapper = ({
  setModalType,
  playToTableRef,
  boardActionsRef,
}: {
  setModalType: (type: ModalType) => void;
  playToTableRef: MutableRefObject<PlayCardToTable>;
  boardActionsRef: MutableRefObject<BoardActions>;
}) => {
  const { gameState, setPlayerState, logAction, offerCardTransfer } =
    useWebGame();
  return (
    <HandContainer
      setModal={setModalType}
      playToTable={(card, opts) => playToTableRef.current(card, opts)}
      revealHand={() => boardActionsRef.current.revealHand()}
      returnRevealedHand={() => boardActionsRef.current.returnRevealedHand()}
      offerCardTransfer={offerCardTransfer}
      {...{ gameState, setPlayerState, logAction }}
    />
  );
};

const ModalWrapper = (props: {
  isOpen: boolean;
  modalType: ModalType;
  setModalType: (type: ModalType) => void;
}) => {
  const { gameState, setPlayerState, logAction } = useWebGame();
  return (
    <ModalContainer
      {...props}
      gameState={gameState}
      setPlayerState={setPlayerState}
      logAction={logAction}
    />
  );
};

const BoardContainer = ({
  self,
  tokenLibrary,
  playToTableRef,
  boardActionsRef,
}: {
  self: string;
  tokenLibrary: { isOpen: boolean; onOpen: () => void; onClose: () => void };
  playToTableRef: MutableRefObject<PlayCardToTable>;
  boardActionsRef: MutableRefObject<BoardActions>;
}) => {
  const { query } = useRouter();
  const mapUrl = query.mapUrl as string | undefined;

  const {
    gamePositions,
    setPlayerPosition,
    setPlayerState,
    gameState,
    logAction,
    claimTableCard,
  } = useWebGame();
  const icons = useGameIcons();

  const players = (gameState?.content as GameState | undefined)?.players;

  const blobs = useMemo(
    () => (gamePositions?.content ?? {}) as Record<string, unknown>,
    [gamePositions],
  );

  const myBlob = useMemo(() => migrateBlob(blobs[self]), [blobs, self]);
  const myTokens = myBlob.tokens;
  const myColor = myBlob.color ?? DEFAULT_PLAYER_COLOR;

  // Outstanding pickup requests, from every player's synced claims — drawn
  // as a pulsing ring and used to disable double-claims in the pickup panel.
  const claimByTokenId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [name, ps] of Object.entries(players ?? {})) {
      for (const c of ps?.tokenClaims ?? []) map[c.tokenId] = name;
    }
    return map;
  }, [players]);

  const allTokens: OwnedToken[] = useMemo(
    () =>
      Object.entries(blobs).flatMap(([owner, raw]) => {
        const blob = migrateBlob(raw);
        return blob.tokens.map((t) => ({
          ...t,
          owner,
          color: blob.color,
          claimedBy: claimByTokenId[t.id],
          counterDisplay: t.counter
            ? t.counter.link
              ? players?.[owner]?.pool?.[t.counter.link]?.hp ?? null
              : t.counter.value ?? 0
            : undefined,
        }));
      }),
    [blobs, players, claimByTokenId],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Foreign card token whose pickup panel is open (id only — the live token
  // is re-derived so the panel tracks claim state and closes on grant).
  const [pickupId, setPickupId] = useState<string | null>(null);
  const centerRef = useRef<() => { x: number; y: number }>(() => ({
    x: 600,
    y: 500,
  }));
  const screenToBoardRef = useRef<
    (sx: number, sy: number) => { x: number; y: number }
  >(() => ({ x: 600, y: 500 }));

  // Owner's hover-preview of a face-down card token.
  const [peek, setPeek] = useState<{
    card: DeckImportCardType;
    anchor: PeekAnchor;
  } | null>(null);
  const handleCardPeek = useCallback(
    (t: OwnedToken | null, rect?: DOMRect) => {
      if (!t?.card || !rect) return setPeek(null);
      setPeek({ card: t.card, anchor: rect });
    },
    [],
  );

  const sendBlob = useCallback(
    (blob: PositionBlob) => setPlayerPosition.current(blob),
    [setPlayerPosition],
  );
  const sendTokens = useCallback(
    (tokens: BoardToken[]) => sendBlob({ color: myBlob.color, tokens }),
    [sendBlob, myBlob.color],
  );

  const setMyColor = useCallback(
    (hex: string) => sendBlob({ color: hex, tokens: myTokens }),
    [sendBlob, myTokens],
  );

  const moveToken = useCallback(
    (t: OwnedToken) => {
      // rounded coords: subpixel floats bloat the wire and never matter
      const x = Math.round(t.x);
      const y = Math.round(t.y);
      const prev = myTokens.find((m) => m.id === t.id);
      if (!prev || (prev.x === x && prev.y === y)) return;
      sendTokens(myTokens.map((m) => (m.id === t.id ? { ...m, x, y } : m)));
    },
    [myTokens, sendTokens],
  );

  // The board drags at frame rate (60–120Hz) but the dragged token echoes
  // locally, so the wire only needs ~20Hz. Throttled once (identity stable
  // across renders — a per-render throttle would never actually throttle);
  // the ref keeps it pointed at the latest closure. Trailing + drag-end
  // flush guarantee the final position lands.
  const moveTokenRef = useRef(moveToken);
  moveTokenRef.current = moveToken;
  const moveTokenThrottled = useMemo(
    () =>
      throttle((t: OwnedToken) => moveTokenRef.current(t), 50, {
        leading: true,
        trailing: true,
      }),
    [],
  );

  const addToken = useCallback(
    (partial: Omit<BoardToken, "id" | "x" | "y">) => {
      const { x, y } = centerRef.current();
      const token: BoardToken = {
        id: newTokenId(self),
        x: Math.round(x),
        y: Math.round(y),
        ...partial,
      };
      sendTokens([...myTokens, token]);
      if (token.imageUrl) setSelectedId(token.id);
    },
    [myTokens, self, sendTokens],
  );

  const patchToken = useCallback(
    (id: string, patch: Partial<BoardToken>) =>
      sendTokens(myTokens.map((m) => (m.id === id ? { ...m, ...patch } : m))),
    [myTokens, sendTokens],
  );

  const deleteToken = useCallback(
    (id: string) => {
      sendTokens(myTokens.filter((m) => m.id !== id));
      setSelectedId(null);
    },
    [myTokens, sendTokens],
  );

  // Badge click: linked counters adjust the same HP the HUD shows; detached
  // ones just bump their own value.
  const adjustCounter = useCallback(
    (t: OwnedToken, delta: number) => {
      if (t.owner !== self) return;
      const link = t.counter?.link;
      if (link) {
        const pool = players?.[self]?.pool;
        if (!pool) return;
        setPlayerState()({ pool: adjustHp(pool, link, delta) });
        return;
      }
      patchToken(t.id, {
        counter: { value: (t.counter?.value ?? 0) + delta },
      });
    },
    [self, players, setPlayerState, patchToken],
  );

  // Spawn a card played from the hand as a board token, centered on the drop
  // point (drag) or the viewport center (menu action). The hand has already
  // spliced the card out of the pool by the time this runs.
  const playCardToTable = useCallback<PlayCardToTable>(
    (card, opts) => {
      const pos = opts?.screenPos
        ? screenToBoardRef.current(opts.screenPos.x, opts.screenPos.y)
        : centerRef.current();
      const w = opts?.size ?? DEFAULT_CARD_TOKEN_WIDTH;
      const h = cardTokenHeight(w);
      const token: BoardToken = {
        id: newTokenId(self),
        x: Math.round(pos.x - w / 2),
        y: Math.round(pos.y - h / 2),
        size: w,
        h,
        card,
        ...(opts?.faceDown ? { faceDown: true } : {}),
      };
      sendTokens([...myTokens, token]);
    },
    [myTokens, self, sendTokens],
  );
  useEffect(() => {
    playToTableRef.current = playCardToTable;
  }, [playToTableRef, playCardToTable]);

  // Card-token exits: every path off the table puts the card back into a
  // pool zone (playerstate channel) and removes the token (playerposition
  // channel) — a card is never deleted outright.
  const returnTableCard = useCallback(
    (t: BoardToken, addTo: typeof addCardToHand, logText: string) => {
      const pool = players?.[self]?.pool;
      if (!t.card || !pool) return;
      setPlayerState()({ pool: addTo(pool, t.card) });
      sendTokens(myTokens.filter((m) => m.id !== t.id));
      setSelectedId(null);
      setPeek(null);
      logAction(logText);
    },
    [players, self, setPlayerState, sendTokens, myTokens, logAction],
  );

  const flipTableCard = useCallback(
    (t: BoardToken) => {
      setPeek(null);
      patchToken(t.id, { faceDown: !t.faceDown });
      logAction(
        t.faceDown
          ? "Revealed a card on the table"
          : "Flipped a table card face-down",
      );
    },
    [patchToken, logAction],
  );

  // Reveal hand (issue #426, item 3): lay every hand card face-up on the table
  // in a centered row. Both channels move at once — the cards leave the pool
  // (playerstate) and become tagged tokens (playerposition) — so this can only
  // live on the board, which owns both. The log names every card so opponents
  // see the reveal even though tokens are the visible surface.
  const revealHand = useCallback(() => {
    const pool = players?.[self]?.pool;
    if (!pool?.hand?.length) return;
    const cards = pool.hand.splice(0, pool.hand.length);
    const { x, y } = centerRef.current();
    const w = 130;
    const h = cardTokenHeight(w);
    const gap = Math.round(w * 0.5);
    const startX = x - ((cards.length - 1) * gap) / 2;
    const revealed: BoardToken[] = cards.map((card, i) => ({
      id: newTokenId(self),
      x: Math.round(startX + i * gap - w / 2),
      y: Math.round(y - h / 2),
      size: w,
      h,
      card,
      faceDown: false,
      fromReveal: true,
    }));
    setPlayerState()({ pool });
    sendTokens([...myTokens, ...revealed]);
    logAction(
      `Revealed their hand (${cards.length}): ${cards
        .map((c) => c.title)
        .join(", ")}`,
    );
  }, [players, self, setPlayerState, sendTokens, myTokens, logAction]);

  // Undo of revealHand: reclaim exactly the tagged tokens (leaving any manually
  // played or boost cards on the table) back into the hand.
  const returnRevealedHand = useCallback(() => {
    const pool = players?.[self]?.pool;
    if (!pool) return;
    const revealed = myTokens.filter((t) => t.fromReveal && t.card);
    if (!revealed.length) return;
    revealed.forEach((t) => t.card && pool.hand.push(t.card));
    setPlayerState()({ pool });
    sendTokens(myTokens.filter((t) => !(t.fromReveal && t.card)));
    logAction(`Returned ${revealed.length} revealed cards to hand`);
  }, [players, self, setPlayerState, sendTokens, myTokens, logAction]);

  useEffect(() => {
    boardActionsRef.current = { revealHand, returnRevealedHand };
  }, [boardActionsRef, revealHand, returnRevealedHand]);

  // Spawn a starter disc for players with no tokens yet. Wait a beat after
  // joining so a rejoining player's saved tokens can arrive first.
  useEffect(() => {
    if (!self || gameState === undefined) return;
    if (blobs[self]) return;
    const timer = setTimeout(() => {
      sendBlob({
        color: DEFAULT_PLAYER_COLOR,
        tokens: [{ id: newTokenId(self), x: 150, y: 100 }],
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [blobs, self, gameState, sendBlob]);

  const iconSvg = useCallback(
    (
      name: string,
      opts: { color?: string; size: number; cutout?: boolean; maskId?: string },
    ) => (icons ? iconToSvg(icons, name, opts) : null),
    [icons],
  );

  const selected = useMemo(
    () => myTokens.find((t) => t.id === selectedId) ?? null,
    [myTokens, selectedId],
  );

  // Live view of the foreign card under the pickup panel; the token
  // disappearing (owner granted a claim) closes the panel by itself.
  const pickupToken = useMemo(
    () => allTokens.find((t) => t.id === pickupId && t.owner !== self) ?? null,
    [allTokens, pickupId, self],
  );

  const openPickup = useCallback((t: OwnedToken) => {
    setSelectedId(null);
    setPickupId(t.id);
  }, []);

  // Stable identity — this lands in the canvas effect's deps, and an inline
  // arrow would re-run the whole d3 render/re-wire on every render (e.g. the
  // peek showing), replacing token markup mid-click and eating the click.
  const selectToken = useCallback((id: string | null) => {
    setPickupId(null);
    setSelectedId(id);
  }, []);

  const requestPickup = useCallback(() => {
    if (!pickupToken) return;
    claimTableCard(pickupToken.id, pickupToken.owner);
    logAction(`Asked to pick up ${pickupToken.owner}'s card`);
  }, [pickupToken, claimTableCard, logAction]);

  return (
    <Box h={"100%"} minH={0} overflow="hidden" position="relative">
      <BoardCanvas
        src={mapUrl ?? "basraport.webp"}
        tokens={allTokens}
        move={moveTokenThrottled}
        self={self}
        selectedId={selectedId}
        onSelect={selectToken}
        onCounterAdjust={adjustCounter}
        onCardPeek={handleCardPeek}
        onForeignCardClick={openPickup}
        iconSvg={iconSvg}
        centerRef={centerRef}
        screenToBoardRef={screenToBoardRef}
      />
      {peek && <CardPeek card={peek.card} anchor={peek.anchor} />}
      {/* Sits in the pill stack above the ⌘ Actions trigger (bottom-right). */}
      <Button
        position="fixed"
        bottom="3.4rem"
        right="1rem"
        zIndex={250}
        size="sm"
        leftIcon={<PlusSquareIcon />}
        bg="brand.parchment"
        color="brand.surfaceDim"
        fontFamily="SpaceGrotesk"
        fontSize="0.85rem"
        borderRadius="10rem"
        border="1px solid rgba(72, 40, 79, 0.25)"
        boxShadow="0 4px 12px rgba(20, 8, 24, 0.35)"
        onClick={tokenLibrary.onOpen}
      >
        Tokens
      </Button>
      {pickupToken?.card ? (
        <CardPickupPanel
          token={pickupToken}
          claimedBy={pickupToken.claimedBy}
          self={self}
          onPickup={requestPickup}
          onClose={() => setPickupId(null)}
        />
      ) : selected?.card ? (
        <CardTokenPanel
          token={selected}
          onFlip={() => flipTableCard(selected)}
          onToHand={() =>
            returnTableCard(selected, addCardToHand, "Returned a card to hand")
          }
          onToDiscard={() =>
            returnTableCard(
              selected,
              addCardToDiscard,
              "Discarded a card from the table",
            )
          }
          onToDeckTop={() =>
            returnTableCard(
              selected,
              addCardToDeckTop,
              "Placed a table card on top of deck",
            )
          }
          onToDeckBottom={() =>
            returnTableCard(
              selected,
              addCardToDeckBottom,
              "Placed a table card on bottom of deck",
            )
          }
          onResize={(size, h) => patchToken(selected.id, { size, h })}
          onClose={() => setSelectedId(null)}
        />
      ) : selected?.imageUrl ? (
        <TokenEditPanel
          token={selected}
          onChange={(patch) => patchToken(selected.id, patch)}
          onDelete={() => deleteToken(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
      <TokenLibraryModal
        isOpen={tokenLibrary.isOpen}
        onClose={tokenLibrary.onClose}
        color={myColor}
        onColorChange={setMyColor}
        // Card tokens are managed from their on-board panel — keeping them
        // out of the library avoids a delete that would destroy the card.
        tokens={myTokens.filter((t) => !t.card)}
        linkedHp={{
          hero: players?.[self]?.pool?.hero?.hp,
          sidekick: players?.[self]?.pool?.sidekick?.hp,
        }}
        onAdd={addToken}
        onPatch={patchToken}
        onDelete={deleteToken}
      />
    </Box>
  );
};
