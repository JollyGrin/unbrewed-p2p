import { BoardCanvas } from "@/components/BoardCanvas";
import {
  HandContainer,
  HeaderContainer,
  ModalContainer,
} from "@/components/Game";
import { GameLayout } from "@/components/Game/game.layout";
import { WebGameProvider } from "@/lib/contexts/WebGameProvider";
import { Box, Flex, useDisclosure } from "@chakra-ui/react";
import styled from "@emotion/styled";
import { useEffect, useState } from "react";

export type ModalType = "hand" | "discard" | "deck" | "commit" | false;
const GamePage = () => {
  const disclosure = useDisclosure();
  const [modalType, setModalType] = useState<ModalType>(false);

  useEffect(() => {
    if (modalType) {
      disclosure.onOpen();
    } else {
      disclosure.onClose();
    }
  }, [modalType]);

  return (
    <>
      <WebGameProvider>
        <GameLayout>
          <ModalContainer
            {...disclosure}
            modalType={modalType}
            setModalType={setModalType}
          />
          <HeaderContainer />
          <BoardContainer />
          <HandContainer setModal={setModalType} />
        </GameLayout>
      </WebGameProvider>
    </>
  );
};

export default GamePage;

const BoardContainer = () => {
  return (
    <Box h={"100%"}>
      <BoardCanvas
        src="jpark.svg"
        move={(e: any) => {
          // console.log("move", e);
        }}
      />
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
