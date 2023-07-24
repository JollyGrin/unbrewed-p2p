import { BoardCanvas } from "@/components/BoardCanvas";
import {
  HandContainer,
  HeaderContainer,
  ModalContainer,
} from "@/components/Game";
import { GameLayout } from "@/components/Game/game.layout";
import { WebGameProvider, useWebGame } from "@/lib/contexts/WebGameProvider";
import { Box, Flex, useDisclosure } from "@chakra-ui/react";
import styled from "@emotion/styled";
import { useEffect, useState } from "react";

export type ModalType = "hand" | "discard" | "deck" | "commit" | false;
const GamePage = () => {
  const disclosure = useDisclosure();
  const [modalType, setModalType] = useState<ModalType>(false);

  const [testmove, setTestmove] = useState([
    { id: "hero", x: 25 + 100, y: 100, r: 10 },
    { id: "sidekick", x: 75 + 100, y: 25, r: 10 },
    { id: "enemey", x: 125 + 100, y: 25, r: 10 },
  ]);

  useEffect(() => {
    if (modalType) {
      disclosure.onOpen();
    } else {
      disclosure.onClose();
    }
  }, [modalType]);

  //@ts-ignore
  const handleKeyPress = (e) => {
    console.log(e, e === "ArrowRight");
    if (e === "ArrowRight") {
      setTestmove([
        testmove[0],
        testmove[1],
        { id: "enemy", x: testmove[2].x + 25, y: testmove[2].y, r: 10 },
      ]);
    }

    if (e === "ArrowLeft") {
      setTestmove([
        testmove[0],
        testmove[1],
        { id: "enemy", x: testmove[2].x - 25, y: testmove[2].y, r: 10 },
      ]);
    }

    if (e === "ArrowUp") {
      setTestmove([
        testmove[0],
        testmove[1],
        { id: "enemy", x: testmove[2].x, y: testmove[2].y - 25, r: 10 },
      ]);
    }

    if (e === "ArrowDown") {
      setTestmove([
        testmove[0],
        testmove[1],
        { id: "enemy", x: testmove[2].x, y: testmove[2].y + 25, r: 10 },
      ]);
    }

    // if (e === "Escape") {
    //   setModalType(false);
    // }
  };

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
          <BoardContainer boardState={testmove} />
          <HandContainer setModal={setModalType} />
        </GameLayout>

        <KeyboardListener onKeyPress={handleKeyPress} />
      </WebGameProvider>
    </>
  );
};

export default GamePage;

//@ts-ignore
const BoardContainer = ({ boardState }) => {
  useEffect(() => {
    if (!window) return;
  });

  const { gamePositions, setPlayerPosition } = useWebGame();
  console.log({ gamePositions });

  const setGamePosition = (props: string[]) => {
    console.log("sending to gameposition", props);
    setPlayerPosition()(props);
  };

  return (
    <Box h={"100%"}>
      <BoardCanvas
        src="jpark.svg"
        move={(e: any) => {
          console.log("move", e);
          setGamePosition(e);
        }}
        data={boardState}
        // data={[
        //   { id: "hero", x: 25 + 100, y: 100, r: 10 },
        //   { id: "sidekick", x: 75 + 100, y: 25, r: 10 },
        //   { id: "enemey", x: 125 + 100, y: 25, r: 10 },
        // ]}
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
//
//
type KeyboardListenerProps = {
  onKeyPress: (key: string) => void;
};

const KeyboardListener: React.FC<KeyboardListenerProps> = ({ onKeyPress }) => {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      onKeyPress(event.key);
    };

    window.addEventListener("keydown", handleKeyPress);

    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [onKeyPress]);

  return null;
};
