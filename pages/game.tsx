import { BoardCanvas } from "@/components/BoardCanvas";
import {
  HandContainer,
  HeaderContainer,
  ModalContainer,
} from "@/components/Game";
import { GameLayout } from "@/components/Game/game.layout";
import { CommandMenu } from "@/components/Game/CommandMenu/command-menu";
import { ActionLog } from "@/components/Game/ActionLog/action-log";
import { TokenLibraryModal } from "@/components/Positions/token-library.modal";
import { TokenEditPanel } from "@/components/Positions/token-edit.panel";
import {
  BoardToken,
  DEFAULT_PLAYER_COLOR,
  OwnedToken,
  PositionBlob,
  migrateBlob,
  newTokenId,
} from "@/components/Positions/position.type";
import { WebGameProvider, useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameState } from "@/lib/gamesocket/message";
import { adjustHp } from "@/components/DeckPool/PoolFns";
import { iconToSvg, useGameIcons } from "@/lib/icons/gameIcons";
import { PageSeo } from "@/components/Helmet/Head";
import { Box, Button, useDisclosure } from "@chakra-ui/react";
import { PlusSquareIcon } from "@chakra-ui/icons";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

// dice-box-threejs touches window/document on load, so render it client-only.
const DiceOverlay = dynamic(
  () => import("@/components/Game/Dice/DiceOverlay"),
  { ssr: false },
);
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ModalType = "hand" | "discard" | "deck" | "commit" | false;

const GamePage = () => {
  const { query } = useRouter();
  const disclosure = useDisclosure();
  const tokenLibraryDisclosure = useDisclosure();
  const [modalType, setModalType] = useState<ModalType>(false);

  useEffect(() => {
    if (modalType) {
      disclosure.onOpen();
    } else {
      disclosure.onClose();
    }
  }, [modalType, disclosure]);

  return (
    <>
      <PageSeo path="/game" title="Game — Unbrewed" noindex />
      <WebGameProvider>
        <GameLayout>
          <ModalWrapper
            {...disclosure}
            modalType={modalType}
            setModalType={setModalType}
          />
          <HeaderContainer openPositionModal={tokenLibraryDisclosure.onOpen} />
          <BoardContainer
            self={query?.name as string}
            tokenLibrary={tokenLibraryDisclosure}
          />
          <HandWrapper {...{ setModalType }} />
          <DiceOverlay />
          <ActionLog />
          <CommandMenu
            openModal={setModalType}
            openTokenLibrary={tokenLibraryDisclosure.onOpen}
          />
        </GameLayout>
      </WebGameProvider>
    </>
  );
};

/**
 * Quick hack to reuse hand-container for offline
 * */
const HandWrapper = ({
  setModalType,
}: {
  setModalType: Dispatch<SetStateAction<ModalType>>;
}) => {
  const { gameState, setPlayerState, logAction } = useWebGame();
  return (
    <HandContainer
      setModal={setModalType}
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

export default GamePage;

const BoardContainer = ({
  self,
  tokenLibrary,
}: {
  self: string;
  tokenLibrary: { isOpen: boolean; onOpen: () => void; onClose: () => void };
}) => {
  const { query } = useRouter();
  const mapUrl = query.mapUrl as string | undefined;

  const { gamePositions, setPlayerPosition, setPlayerState, gameState } =
    useWebGame();
  const icons = useGameIcons();

  const players = (gameState?.content as GameState | undefined)?.players;

  const blobs = useMemo(
    () =>
      (gamePositions?.content ?? {}) as Record<string, unknown>,
    [gamePositions],
  );

  const myBlob = useMemo(() => migrateBlob(blobs[self]), [blobs, self]);
  const myTokens = myBlob.tokens;
  const myColor = myBlob.color ?? DEFAULT_PLAYER_COLOR;

  const allTokens: OwnedToken[] = useMemo(
    () =>
      Object.entries(blobs).flatMap(([owner, raw]) => {
        const blob = migrateBlob(raw);
        return blob.tokens.map((t) => ({
          ...t,
          owner,
          color: blob.color,
          counterDisplay: t.counter
            ? t.counter.link
              ? players?.[owner]?.pool?.[t.counter.link]?.hp ?? null
              : t.counter.value ?? 0
            : undefined,
        }));
      }),
    [blobs, players],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const centerRef = useRef<() => { x: number; y: number }>(() => ({
    x: 600,
    y: 500,
  }));

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
    (t: OwnedToken) =>
      sendTokens(
        myTokens.map((m) => (m.id === t.id ? { ...m, x: t.x, y: t.y } : m)),
      ),
    [myTokens, sendTokens],
  );

  const addToken = useCallback(
    (partial: Omit<BoardToken, "id" | "x" | "y">) => {
      const { x, y } = centerRef.current();
      const token: BoardToken = { id: newTokenId(self), x, y, ...partial };
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

  return (
    <Box h={"100%"} minH={0} overflow="hidden" position="relative">
      <BoardCanvas
        src={mapUrl ?? "basraport.webp"}
        tokens={allTokens}
        move={moveToken}
        self={self}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCounterAdjust={adjustCounter}
        iconSvg={iconSvg}
        centerRef={centerRef}
      />
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
      {selected?.imageUrl && (
        <TokenEditPanel
          token={selected}
          onChange={(patch) => patchToken(selected.id, patch)}
          onDelete={() => deleteToken(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
      <TokenLibraryModal
        isOpen={tokenLibrary.isOpen}
        onClose={tokenLibrary.onClose}
        color={myColor}
        onColorChange={setMyColor}
        tokens={myTokens}
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
