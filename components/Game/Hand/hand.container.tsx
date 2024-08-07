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
import { Box, Flex, Grid } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { HandCardItems } from "../game.carousel";
import styled from "@emotion/styled";
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
    <Tray>
      <Grid
        gridTemplateColumns={"repeat(auto-fill, minmax(100px, 1fr))"}
        gap={2}
      >
        <ModalButton
          onClick={() => playerState?.pool && gDraw(playerState?.pool)}
        >
          Draw + 1
        </ModalButton>
        <ModalButton onClick={() => setModal("deck")}>
          Deck ({playerState?.pool?.deck?.length})
        </ModalButton>
        <ModalButton onClick={() => setModal("discard")}>Discard</ModalButton>
        {playerState?.pool?.commit?.boost && (
          <ModalButton
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
          </ModalButton>
        )}
      </Grid>
      <HandCardItems
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
    </Tray>
  );
};

const Tray = styled(Box)`
  background-color: purple;
  width: 100%;
  align-items: end;
`;
const ModalButton = styled(Flex)`
  user-select: none;
  cursor: pointer;

  background-color: antiquewhite;
  justify-content: center;
  align-items: center;
  font-family: Space Grotesk;
  font-weight: 700;

  width: 100%;
  max-width: 250px;

  :hover {
    background-color: burlywood;
  }
`;
