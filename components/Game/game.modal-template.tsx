import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Flex,
} from "@chakra-ui/react";
import React, { useEffect } from "react";
import {
  CommitModalContent,
  DeckModalContent,
  PlayerCommit,
} from "./game.modal-body";
import { ModalType } from "@/pages/game";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import {
  PoolType,
  cancelCommit,
  discardCommit,
  revealCommit,
} from "../DeckPool/PoolFns";
import { useRouter } from "next/router";
import {
  DeckImportCardType,
  DeckImportType,
} from "../DeckPool/deck-import.type";
import { flow } from "lodash";

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
  const isCommit = modalType === "commit";
  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;
  const { gameState, setPlayerState } = useWebGame();
  const playerState = player ? gameState?.content?.players[player] : undefined;
  const setGameState = (poolInput: PoolType): void => {
    setPlayerState()({ pool: poolInput });
  };

  const onClose = () => setModalType(false);
  const gCancelCommit = flow(cancelCommit, setGameState);
  const onCommitCancelClose = () => {
    if (!playerState?.pool) return;
    gCancelCommit(playerState.pool);
    onClose();
  };

  const gFlip = flow(
    () => playerState?.pool && revealCommit(playerState?.pool),
    setGameState
  );
  const gDiscardCommit = flow(
    () => playerState?.pool && discardCommit(playerState?.pool),
    setGameState
  );

  useEffect(() => {
    const playerCommit = playerState?.pool?.commit;
    if (modalType === "commit" && !playerCommit?.main) {
      setModalType(false);
    }
    if (playerCommit?.main) {
      setModalType("commit");
    }
  }, [gameState]);

  const emptyCommit = {
    main: null,
    reveal: false,
    boost: null,
  };
  const playerKeys =
    gameState?.content?.players && Object.keys(gameState?.content?.players);
  const commits: PlayerCommit[] =
    !playerKeys || playerKeys?.length <= 0
      ? []
      : playerKeys.map(
          (playerKey): PlayerCommit => ({
            player: playerKey,
            commit:
              gameState.content?.players[playerKey].pool?.commit ?? emptyCommit,
          })
        );

  return (
    <>
      <Modal isOpen={isOpen} onClose={() => !isCommit && onClose()}>
        <OverlayOne />
        <ModalContent maxW={"1100px"} w={"100%"}>
          <ModalHeader>{modalType}</ModalHeader>
          {!isCommit && <ModalCloseButton />}
          <ModalBody>
            {playerState?.pool && modalType && !isCommit && (
              <DeckModalContent
                cards={playerState.pool[modalType] as DeckImportCardType[]}
              />
            )}
            {playerState?.pool && isCommit && commits.length > 0 && (
              <CommitModalContent
                onClose={onCommitCancelClose}
                commits={commits}
                onFlip={gFlip}
                onDiscard={gDiscardCommit}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

const OverlayOne = () => (
  <ModalOverlay
    bg="blackAlpha.300"
    backdropFilter="blur(10px) hue-rotate(10deg)"
  />
);
