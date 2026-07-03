import {
  PoolType,
  boostCard,
  cancelBoost,
  commitCard,
  deckCard,
  deckCardBottom,
  discardCard,
  draw,
  makeDeck,
  newPool,
  removeHandCard,
  shuffleDeck,
} from "@/components/DeckPool/PoolFns";
import { PlayCardToTable } from "@/components/Positions/position.type";
import { TransferZone } from "@/lib/gamesocket/message";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import { Flex } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { HandFan } from "../game.carousel";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { flow } from "lodash";
import { ModalType } from "@/pages/game";
import { CloseIcon } from "@chakra-ui/icons";
import { WebsocketMessage } from "@/lib/gamesocket/message";

type GameData = {
  gameState: WebsocketMessage | undefined;
  setPlayerState: () => (props: { pool: PoolType }) => void;
  logAction: (text: string) => void;
};

export const HandContainer = ({
  setModal,
  gameState,
  setPlayerState,
  logAction,
  playToTable,
  offerCardTransfer,
}: {
  setModal: (type: ModalType) => void;
  gameState: GameData["gameState"];
  setPlayerState: GameData["setPlayerState"];
  logAction: GameData["logAction"];
  /** Spawns the card as a board token — absent offline (no board). */
  playToTable?: PlayCardToTable;
  /** Escrows a card for another player — absent offline (no opponents). */
  offerCardTransfer?: (
    to: string,
    zone: TransferZone,
    card: DeckImportCardType,
    pool: PoolType,
  ) => void;
}) => {
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;

  const { starredDeck } = useLocalDeckStorage();
  const players = gameState?.content?.players as Record<
    string,
    { pool?: PoolType }
  >;
  const playerState = player ? players?.[player] : undefined;
  const setGameState = (poolInput: PoolType): void => {
    setPlayerState()({ pool: poolInput });
  };

  useEffect(() => {
    if (!starredDeck || playerState?.pool) return;
    // The timer must cancel when a gameState update lands: on rejoin the
    // server replays the existing pool ~instantly, and letting a stale
    // timer fire would re-init the deck over it (hand/deck reset, and any
    // cards out on the table would be duplicated back into the deck).
    const timer = setTimeout(() => {
      const initDeck = flow(newPool, makeDeck, shuffleDeck, draw);
      const pool = initDeck(starredDeck);
      setGameState(pool);
    }, 500);
    return () => clearTimeout(timer);
  }, [gameState]);

  const gDraw = flow(draw, setGameState, () => logAction("Drew a card"));
  const gDeckCard = flow(
    (cardIndex: number) => deckCard(playerState?.pool as PoolType, cardIndex),
    setGameState,
    () => logAction("Placed a card on top of deck"),
  );
  const gDeckCardBottom = flow(
    (cardIndex: number) =>
      deckCardBottom(playerState?.pool as PoolType, cardIndex),
    setGameState,
    () => logAction("Placed a card on bottom of deck"),
  );
  const gDiscard = flow(discardCard, setGameState, () =>
    logAction("Discarded a card"),
  );
  const gBoost = flow(
    (cardIndex: number) =>
      playerState?.pool && boostCard(playerState.pool, cardIndex),
    setGameState,
  );
  const gCancelBoost = flow(cancelBoost, setGameState);
  /**
   * @deprecated Commit-modal flow — superseded by playing cards to the table
   * (drag or "Place on table", face-down by default). No UI reaches this
   * since the fan's "+" button was hidden; kept until table cards fully
   * replace the modal and the commit machinery can be deleted.
   */
  const gCommit = flow(
    (cardIndex: number) =>
      playerState?.pool && commitCard(playerState?.pool, cardIndex),
    setGameState,
    () => setModal("commit"),
    () => logAction("Committed a card"),
  );

  // Escrow a hand card for another player (docs/card-transfer-plan.md): one
  // broadcast removes it from our pool and posts the transfer.
  const opponents = offerCardTransfer
    ? Object.keys(players ?? {}).filter((n) => n !== player)
    : [];
  const gGiveCard = (cardIndex: number, to: string) => {
    const pool = playerState?.pool;
    const card = pool?.hand?.[cardIndex];
    if (!pool || !card || !offerCardTransfer) return;
    offerCardTransfer(to, "hand", card, removeHandCard(pool, cardIndex));
    logAction(`Gave a card to ${to}`);
  };

  // Two-channel move: splice the card out of the pool (playerstate), then
  // hand it to the board to spawn as a card token (playerposition).
  const gPlayToTable: Parameters<typeof HandFan>[0]["functions"]["playFn"] =
    playToTable
      ? (cardIndex, opts) => {
          const pool = playerState?.pool;
          const card = pool?.hand?.[cardIndex];
          if (!pool || !card) return;
          // face-down unless explicitly played face-up — like committing,
          // playing a card shouldn't reveal it until the owner flips it
          const faceDown = opts?.faceDown ?? true;
          setGameState(removeHandCard(pool, cardIndex));
          playToTable(card, { ...opts, faceDown });
          logAction(
            faceDown
              ? "Placed a card face-down on the table"
              : "Placed a card face-up on the table",
          );
        }
      : undefined;

  return (
    <>
      <ActionCluster>
        <PileButton
          onClick={() => playerState?.pool && gDraw(playerState?.pool)}
        >
          Draw +1
        </PileButton>
        <PileButton onClick={() => setModal("deck")}>
          Deck ({playerState?.pool?.deck?.length ?? 0})
        </PileButton>
        <PileButton onClick={() => setModal("discard")}>
          Discard ({playerState?.pool?.discard?.length ?? 0})
        </PileButton>
        {playerState?.pool?.commit?.boost && (
          <PileButton
            onClick={() => gCancelBoost(playerState?.pool as PoolType)}
          >
            Boost: {playerState?.pool?.commit?.boost?.boost}
            <CloseIcon
              fontSize="1rem"
              ml="6px"
              bg="brand.primary"
              color="black"
              p="0.25rem"
              borderRadius="100%"
            />
          </PileButton>
        )}
      </ActionCluster>
      <HandFan
        cards={playerState?.pool?.hand}
        functions={{
          discardFn: (discardIndex: number) =>
            gDiscard(playerState?.pool as PoolType, discardIndex),
          commitFn: (cardIndex: number) => gCommit(cardIndex),
          boostFn: (cardIndex: number) => gBoost(cardIndex),
          deckCardFn: (cardIndex: number) => gDeckCard(cardIndex),
          deckCardBottomFn: (cardIndex: number) => gDeckCardBottom(cardIndex),
          playFn: gPlayToTable,
          giveFn: gGiveCard,
        }}
        opponents={opponents}
      />
    </>
  );
};

/** floating pile controls, bottom-left over the board */
const ActionCluster = styled(Flex)`
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  flex-direction: column;
  gap: 0.4rem;
  z-index: 250;
`;

const PileButton = styled(Flex)`
  user-select: none;
  cursor: pointer;

  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  justify-content: center;
  align-items: center;
  font-family: ${fonts.SpaceGrotesk};
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.35rem 0.9rem;
  border-radius: 10rem;
  border: 1px solid rgba(72, 40, 79, 0.25);
  box-shadow: 0 2px 6px rgba(20, 8, 24, 0.35);
  transition: all 0.15s ease-in-out;

  :hover {
    background-color: ${colors.brand.highlight};
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(20, 8, 24, 0.4);
  }

  :active {
    transform: translateY(0);
    box-shadow: 0 1px 3px rgba(20, 8, 24, 0.4);
  }
`;
