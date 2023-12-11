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
import { Box, useDisclosure } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

export type ModalType = "hand" | "discard" | "deck" | "commit" | false;

const GamePage = () => {
  const { query } = useRouter();
  const disclosure = useDisclosure();
  const positionDisclosure = useDisclosure();
  const [modalType, setModalType] = useState<ModalType>(false);

  const [testmove, setTestmove] = useState<PositionType[]>([
    { id: "hero", x: 25 + 100, y: 100, tokenSize: "lg" },
    { id: "sidekick", x: 75 + 100, y: 25, tokenSize: "md" },
    { id: "enemey", x: 125 + 100, y: 25, tokenSize: "sm", color: "blue" },
  ]);

  // NOTE: Next step is to link the boardstate to the websocket data
  // 1. link the modal picker to your init of tokens
  // 2. edit the operations to work with an array of PostionType[]
  // 3. update the permissions so that respective players can move their tokens
  // 4. link board to the game positions

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
          <BoardContainer self={query?.name as string} />
          <HandContainer setModal={setModalType} />
        </GameLayout>

        <KeyboardListener onKeyPress={handleKeyPress} />
      </WebGameProvider>
    </>
  );
};

export default GamePage;

const BoardContainer = ({ self }: { self?: string }) => {
  useEffect(() => {
    if (!window) return;
  });

  const { gamePositions, setPlayerPosition, gameState } = useWebGame();

  const positions = Object.keys(gamePositions?.content ?? {}).map((key) => {
    //@ts-expect-error: does not know that key is a keyof gamePositions
    const gamePosition = gamePositions?.content?.[key];
    return gamePosition as PositionType;
  });

  const _setGamePosition = (props: PositionType) => {
    //@ts-expect-error: figure out why it works without Array type
    setPlayerPosition.current(props);
  };
  const setGamePosition = useCallback(_setGamePosition, [setPlayerPosition]);

  useEffect(() => {
    if (!self) return;
    if (!window) return;
    if (gameState === undefined) return;
    if (positions?.length > 0) return;
    const defData = {
      id: self as string,
      x: 25 + 100,
      y: 100,
    };
    setGamePosition(defData);
  }, [positions, self, gameState, setGamePosition]);

  return (
    <Box h={"100%"}>
      <BoardCanvas
        src="jpark.svg"
        move={(e: PositionType) => {
          setGamePosition(e);
        }}
        data={positions}
        self={self}
      />
    </Box>
  );
};

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
