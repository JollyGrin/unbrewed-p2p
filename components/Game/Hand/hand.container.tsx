import Pool from "@/components/DeckPool/Pool";
import { PoolType, draw, makeDeck, newPool, shuffleDeck } from "@/components/DeckPool/PoolFns";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import { Box, Flex, Grid, Skeleton } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { SetStateAction, useEffect, useMemo, useState } from "react";
import { Carousel, cardItemMapper } from "../game.carousel";
import styled from "@emotion/styled";
import { GameState } from "@/lib/gamesocket/message";

export const HandContainer = () => {
  const router = useRouter();
  const slug = router.query;
  const player = Array.isArray(slug?.name) ? slug.name[0] : slug?.name

  const { starredDeck } = useLocalDeckStorage()
  const { gameState, setPlayerState } = useWebGame();
  const setGameState = (poolInput: PoolType): void => setPlayerState()({ pool: poolInput })
  console.log({ gameState })

  useEffect(() => {
    if (!player) return;

    const playerState = gameState?.content?.players[player]
    console.log(playerState)
  }, [gameState])


  return (
    <Box bg="purple" w="100%" alignItems="end">
      {starredDeck?.deck_data
        ? <Carousel items={cardItemMapper(starredDeck.deck_data.cards, { my: 3 }, true)} />
        : <Skeleton m={3} w='150px' h='200px' />
      }
      <Grid gridTemplateColumns={'repeat(auto-fill, minmax(100px, 1fr))'} gap={2}>
        <ModalButton>Draw + 1</ModalButton>
        <ModalButton >Deck</ModalButton>
        <ModalButton >Discard</ModalButton>
      </Grid>
    </Box>
  );
};

const ModalButton = styled(Flex)`
  background-color: antiquewhite;
  justify-content: center;
  align-items: center;
  height: 5svh;
  font-family: Space Grotesk;
  font-weight: 700;
  width: 100%;
  max-width: 250px;
  cursor: pointer;

  :hover {
    background-color: burlywood;
  }
`;
