//@ts-nocheck
import { BoardCanvas } from "@/components/BoardCanvas";
import Pool from "@/components/DeckPool/Pool";
import { Carousel, cardItemMapper, deckItemMapper } from "@/components/Game/game.carousel";
import { GameLayout } from "@/components/Game/game.layout";
import { ModalTemplate } from "@/components/Game/game.modal-template";
import { StatTag } from "@/components/Game/game.styles";
import { WebGameProvider, useWebGame } from "@/lib/contexts/WebGameProvider";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import {
  Box,
  Flex,
  Grid,
  Skeleton,
  Tag,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";

const GamePage = () => {
  const router = useRouter();
  const slug = router.query;
  const { starredDeck } = useLocalDeckStorage();
  const [pool, setPool] = useState<Pool>();
  console.log({ pool })

  const disclosure = useDisclosure();


  useEffect(() => {
    if (!starredDeck || pool) return

    const _pool = starredDeck && new Pool(starredDeck)
    _pool.makeDeck()
    _pool.draw()
    setPool(_pool)

    console.log({ pool })

  }, [starredDeck])



  return (
    <>
      <WebGameProvider>
        <GameLayout>
          <ModalTemplate {...disclosure} />
          <HeaderContainer {...disclosure} />
          <BoardContainer />
          <HandContainer pool={pool} {...disclosure} />
        </GameLayout>
      </WebGameProvider>
    </>
  );
};

export default GamePage;

const HeaderContainer = ({
  onOpen,
  isOpen,
  onClose,
}: {
  showStats: boolean;
  setShowStats: (e: boolean) => void;
}) => {

  const { gameState, setPlayerState } = useWebGame();

  useEffect(() => {
    if (!gameState) return;
    console.log("gameState changed", JSON.parse(gameState));
  }, [gameState]);


  return (
    <Flex
      bg="purple"
      p={3}
      w="100%"
      justifyContent="space-between"
      alignItems="center"
      gap={"10px"}
    >
      <Flex gap={2} maxHeight={"2.5rem"}>
        <StatTag>
          <div className="number">16</div>
          Thrall ⚔️
        </StatTag>
        <StatTag opacity={0.8}>
          <div className="number">x4</div>
          Totem ⚔️
        </StatTag>

        <StatTag>
          <div className="number">12</div>
          Robin Hood 🏹
        </StatTag>
      </Flex>
    </Flex>
  );
};

const BoardContainer = () => {
  return (
    <Box h={"100%"}>
      <BoardCanvas
        src="jpark.svg"
        move={(e) => {
          console.log("move", e);
        }}
      />
    </Box>
  );
};

const HandContainer = ({ pool }: { pool: Pool }) => {
  const onOpen = () => { }
  console.log('aaaaa', pool)
  const { starredDeck } = useLocalDeckStorage();
  // @Dean: These are the two hooks you need to use to read and write to the game state.
  // If this works, we can make a different state for the cursor to reduce payloads shared. 
  // This state payload is the entire game state, so it's a lot of data.

  // const { gameState, setPlayerState } = useWebGame();

  // To update your state. If you uncomment this, you get into and infinite loop.
  // setPlayerState()({
  //   stuff: "ok",
  // })

  // To read the new game state from the server
  // useEffect(() => {
  //   console.log("gameState changed", gameState);
  // }, [gameState]);


  return (
    <Box bg="purple" w="100%" alignItems="end">
      {
        pool?.hand ? <Carousel items={cardItemMapper(pool.hand, { my: 3 })} /> : <Skeleton h='230px' />
      }

      <Grid gridTemplateColumns={'repeat(auto-fill, minmax(100px, 1fr))'} gap={2}>
        <ModalButton onClick={() => pool.draw()}>
          Draw + 1
        </ModalButton>
        <ModalButton onClick={() => onOpen()}>Deck</ModalButton>
        <ModalButton onClick={() => onOpen()}>Discard</ModalButton>
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
