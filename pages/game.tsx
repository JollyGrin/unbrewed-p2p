import { BoardCanvas } from "@/components/BoardCanvas";
import {
  HandContainer,
  HeaderContainer,
  ModalContainer,
} from "@/components/Game";
import { GameLayout } from "@/components/Game/game.layout";
import { PositionModal } from "@/components/Positions/position.modal";
import { PositionType } from "@/components/Positions/position.type";
import { WebGameProvider, useWebGame } from "@/lib/contexts/WebGameProvider";
import { Box, Flex, useDisclosure } from "@chakra-ui/react";
import styled from "@emotion/styled";
import { useEffect, useState } from "react";

export type ModalType = "hand" | "discard" | "deck" | "commit" | false;

const GamePage = () => {
  const disclosure = useDisclosure();
  const positionDisclosure = useDisclosure();
  const [modalType, setModalType] = useState<ModalType>(false);

  const [testmove, setTestmove] = useState<PositionType[]>([
    { id: "hero", x: 25 + 100, y: 100, tokenSize: "lg" },
    { id: "sidekick", x: 75 + 100, y: 25, tokenSize: "md" },
    { id: "enemey", x: 125 + 100, y: 25, tokenSize: "sm", color: "blue" },
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
    if (e === "ArrowRight") {
      setTestmove([
        testmove[0],
        testmove[1],
        { id: "enemy", x: testmove[2].x + 25, y: testmove[2].y, r: 10 },
        { id: "enemy2", x: testmove[2].x + 30, y: testmove[2].y, r: 10 },
      ]);
    }
  };

  return (
    <>
      <WebGameProvider>
        <GameLayout>
          <PositionModal {...positionDisclosure} />
          <ModalContainer
            {...disclosure}
            modalType={modalType}
            setModalType={setModalType}
          />
          <HeaderContainer openPositionModal={positionDisclosure.onOpen} />
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
  console.log({ gamePositions, setPlayerPosition });

  const setGamePosition = (props: PositionType[]) => {
    //@ts-ignore
    setPlayerPosition.current(props);
  };

  return (
    <Box h={"100%"}>
      <BoardCanvas
        src="jpark.svg"
        move={(e: any) => {
          // console.log("move", e);

          console.log("lllll", { gamePositions });
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
