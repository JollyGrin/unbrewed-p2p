import {
  PoolType,
  commitCard,
  discardCard,
  draw,
  makeDeck,
  newPool,
  shuffleDeck,
} from "@/components/DeckPool/PoolFns";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import { Box, Flex, Grid, Skeleton } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Carousel, HandCardItems, cardItemMapper } from "../game.carousel";
import styled from "@emotion/styled";
import { flow } from "lodash";
import { CarouselTray } from "../game.styles";
import { ModalType } from "@/pages/game";

export const HandContainer = ({
  setModal,
}: {
  setModal: (type: ModalType) => void;
}) => {
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;

  const { starredDeck } = useLocalDeckStorage();
  const { gameState, setPlayerState } = useWebGame();
  const playerState = player ? gameState?.content?.players[player] : undefined;
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
  const gDiscard = flow(discardCard, setGameState);
  const gCommit = flow(
    (cardIndex: number) =>
      playerState?.pool && commitCard(playerState?.pool, cardIndex),
    setGameState,
    () => setModal("commit")
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
        <ModalButton onClick={() => setModal("deck")}>Deck</ModalButton>
        <ModalButton onClick={() => setModal("discard")}>Discard</ModalButton>
      </Grid>
      <HandCardItems
        cards={playerState?.pool?.hand}
        functions={{
          discardFn: (discardIndex: number) =>
            playerState?.pool && gDiscard(playerState?.pool, discardIndex),
          commitFn: (cardIndex: number) => gCommit(cardIndex),
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
