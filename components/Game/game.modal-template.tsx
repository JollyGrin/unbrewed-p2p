import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
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
  drawDeck,
  drawDiscard,
  revealCommit,
  shuffleDeck,
} from "../DeckPool/PoolFns";
import { useRouter } from "next/router";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import { flow } from "lodash";
import { toast } from "react-hot-toast";
import { WebsocketMessage } from "@/lib/gamesocket/message";

type ModalTemplateType = {
  isOpen: boolean;
  modalType: ModalType;
  setModalType: (type: ModalType) => void;
  gameState: WebsocketMessage | undefined;
  setPlayerState: () => (props: { pool: PoolType }) => void;
};
export const ModalContainer: React.FC<ModalTemplateType> = ({
  isOpen,
  modalType,
  setModalType,
  gameState,
  setPlayerState,
}) => {
  const isCommit = modalType === "commit";
  const player = useRouter().query?.name as string;
  const players = gameState?.content?.players as Record<
    string,
    { pool?: PoolType }
  >;
  const playerState = player ? players?.[player] : undefined;
  const setGameState = (poolInput: PoolType): void => {
    setPlayerState()({ pool: poolInput });
  };

  const gShuffleDeck = flow(
    () => playerState?.pool && shuffleDeck(playerState?.pool),
    setGameState,
  );

  const onClose = () => {
    if (modalType === "deck") {
      gShuffleDeck();
      toast.success("Deck successfully shuffled after closing");
    }
    setModalType(false);
  };

  const gCancelCommit = flow(cancelCommit, setGameState);
  const onCommitCancelClose = () => {
    if (!playerState?.pool) return;
    gCancelCommit(playerState.pool);
    onClose();
  };

  const gFlip = flow(
    () => playerState?.pool && revealCommit(playerState?.pool),
    setGameState,
  );
  const gDiscardCommit = flow(
    () => playerState?.pool && discardCommit(playerState?.pool),
    setGameState,
  );
  const gDrawDiscard = (discardIndex: number) =>
    flow(
      () => playerState?.pool && drawDiscard(playerState?.pool, discardIndex),
      setGameState,
    );

  const gDrawDeck = (discardIndex: number) =>
    flow(
      () => playerState?.pool && drawDeck(playerState?.pool, discardIndex),
      setGameState,
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
            commit: players[playerKey].pool?.commit ?? emptyCommit,
          }),
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
                add={modalType === "discard" ? gDrawDiscard : gDrawDeck}
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
