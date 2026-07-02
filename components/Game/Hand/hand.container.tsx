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
  shuffleDeck,
} from "@/components/DeckPool/PoolFns";
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
};

export const HandContainer = ({
  setModal,
  gameState,
  setPlayerState,
}: {
  setModal: (type: ModalType) => void;
  gameState: GameData["gameState"];
  setPlayerState: GameData["setPlayerState"];
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
    setTimeout(() => {
      const initDeck = flow(newPool, makeDeck, shuffleDeck, draw);
      const pool = initDeck(starredDeck);
      setGameState(pool);
    }, 500);
  }, [gameState]);

  const gDraw = flow(draw, setGameState);
  const gDeckCard = flow(
    (cardIndex: number) => deckCard(playerState?.pool as PoolType, cardIndex),
    setGameState,
  );
  const gDeckCardBottom = flow(
    (cardIndex: number) =>
      deckCardBottom(playerState?.pool as PoolType, cardIndex),
    setGameState,
  );
  const gDiscard = flow(discardCard, setGameState);
  const gBoost = flow(
    (cardIndex: number) =>
      playerState?.pool && boostCard(playerState.pool, cardIndex),
    setGameState,
  );
  const gCancelBoost = flow(cancelBoost, setGameState);
  const gCommit = flow(
    (cardIndex: number) =>
      playerState?.pool && commitCard(playerState?.pool, cardIndex),
    setGameState,
    () => setModal("commit"),
  );

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
        }}
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
