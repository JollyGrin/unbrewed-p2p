import Pool from "@/components/DeckPool/Pool";
import { PoolType, draw, makeDeck, newPool, shuffleDeck } from "@/components/DeckPool/PoolFns";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import { Box, Flex, Grid, Skeleton } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Carousel, cardItemMapper } from "../game.carousel";
import styled from "@emotion/styled";
import { flow } from "lodash";

export const HandContainer = () => {
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName

  const { starredDeck } = useLocalDeckStorage()
  const { gameState, setPlayerState } = useWebGame();
  const playerState = player ? gameState?.content?.players[player] : undefined
  const setGameState = (poolInput: PoolType): void => setPlayerState()({ pool: poolInput })
  console.log({ gameState })


  useEffect(() => {
    if (!starredDeck || playerState?.pool) return;
    const initDeck = flow(makeDeck, shuffleDeck, draw)

    let pool = newPool(starredDeck);
    pool = initDeck(pool)
    setGameState(pool)
  }, [])

  const gDraw = flow(draw, setGameState)

  return (
    <Tray>
      {playerState?.pool?.hand
        ? <Carousel items={cardItemMapper(playerState?.pool?.hand, { my: 3 }, true)} />
        : <Skeleton m={3} w='150px' h='200px' />
      }
      <Grid gridTemplateColumns={'repeat(auto-fill, minmax(100px, 1fr))'} gap={2}>
        <ModalButton onClick={() => playerState?.pool && gDraw(playerState?.pool)}>Draw + 1</ModalButton>
        <ModalButton >Deck</ModalButton>
        <ModalButton >Discard</ModalButton>
      </Grid>
    </Tray>
  );
};

const Tray = styled(Box)`
  background-color: purple;
  width: 100%;
  align-items: end;
`
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
