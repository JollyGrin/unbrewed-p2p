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
import useDelayedTrue from "@/lib/hooks/useDelay";
import { Box, useDisclosure } from "@chakra-ui/react";
import { useRouter } from "next/router";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";

export type ModalType = "hand" | "discard" | "deck" | "commit" | false;

const GamePage = () => {
  const { query } = useRouter();
  const disclosure = useDisclosure();
  const positionDisclosure = useDisclosure();
  const [modalType, setModalType] = useState<ModalType>(false);

  const isReady = useDelayedTrue(1000);

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
  }, [modalType, disclosure]);

  const handleKeyPress = (e: string) => {
    if (e === "ArrowRight") {
      console.info("replace me");
    }
  };

  return (
    <>
      <WebGameProvider>
        <GameLayout>
          <PositionModal {...positionDisclosure} />
          <ModalWrapper
            {...disclosure}
            modalType={modalType}
            setModalType={setModalType}
          />
          <HeaderContainer openPositionModal={positionDisclosure.onOpen} />
          {isReady && <BoardContainer self={query?.name as string} />}
          <HandWrapper {...{ setModalType }} />
        </GameLayout>
        <KeyboardListener onKeyPress={handleKeyPress} />
      </WebGameProvider>
    </>
  );
};

/**
 * Quick hack to reuse hand-container for offline
 * */
const HandWrapper = ({
  setModalType,
}: {
  setModalType: Dispatch<SetStateAction<ModalType>>;
}) => {
  const { gameState, setPlayerState } = useWebGame();
  return (
    <HandContainer setModal={setModalType} {...{ gameState, setPlayerState }} />
  );
};

const ModalWrapper = (props: {
  isOpen: boolean;
  modalType: ModalType;
  setModalType: (type: ModalType) => void;
}) => {
  const { gameState, setPlayerState } = useWebGame();
  return (
    <ModalContainer
      {...props}
      gameState={gameState}
      setPlayerState={setPlayerState}
    />
  );
};

export default GamePage;

const BoardContainer = ({ self }: { self: string }) => {
  const { query } = useRouter();
  const mapUrl = query.mapUrl as string | undefined;

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
    //@ts-expect-error: the name is a key of the positions, but typescript is dumb and im lazy
    const selected: PositionType = gamePositions?.content?.[self as string];
    setPlayerPosition.current({ ...selected, ...props });
  };
  const setGamePosition = useCallback(_setGamePosition, [
    setPlayerPosition,
    gamePositions,
    self,
  ]);

  useEffect(() => {
    if (!self) return;
    if (!window) return;
    if (gameState === undefined) return;
    if (positions?.length !== 0) return;
    const defData = {
      id: self as string,
      x: 50 + 100,
      y: 100,
    };
    setGamePosition(defData);
  }, [positions, self, gameState, setGamePosition]);

  return (
    <Box h={"100%"}>
      <BoardCanvas
        src={mapUrl ?? "basraport.webp"}
        move={(e: PositionType) => {
          if (e.id.includes("_")) {
            const rootId = e.id.split("_")[0];
            const selectedPosition = positions.find((pos) => pos.id === rootId);
            if (!selectedPosition) return;
            const selectedSidekicks = selectedPosition?.sidekicks;
            const newSidekicks = selectedSidekicks?.map((kick) =>
              kick.id === e.id ? e : kick,
            );

            setGamePosition({
              ...selectedPosition,
              sidekicks: newSidekicks,
            });
            return;
          }
          setGamePosition({
            ...e,
            sidekicks: positions.find((pos) => pos.id === e.id)?.sidekicks,
          });
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
