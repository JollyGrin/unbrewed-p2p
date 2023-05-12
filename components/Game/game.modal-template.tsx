import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
} from "@chakra-ui/react";
import React from "react";
import { DeckModalContent } from "./game.modal-body";
import { ModalType } from "@/pages/game";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { PoolType } from "../DeckPool/PoolFns";
import { useRouter } from "next/router";

type ModalTemplateType = {
  isOpen: boolean;
  modalType: ModalType;
  setModalType: (type: ModalType) => void;
};
export const ModalContainer: React.FC<ModalTemplateType> = ({
  isOpen,
  modalType,
  setModalType,
}) => {
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;
  const { gameState, setPlayerState } = useWebGame();
  const playerState = player ? gameState?.content?.players[player] : undefined;
  const setGameState = (poolInput: PoolType): void => {
    setPlayerState()({ pool: poolInput });
  };
  const onClose = () => setModalType(false);

  const OverlayOne = () => (
    <ModalOverlay
      bg="blackAlpha.300"
      backdropFilter="blur(10px) hue-rotate(10deg)"
    />
  );

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose}>
        <OverlayOne />
        <ModalContent maxW={"1100px"} w={"100%"}>
          <ModalHeader>{modalType}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {playerState?.pool && modalType && (
              <DeckModalContent cards={playerState?.pool[modalType]} />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};
