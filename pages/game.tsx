//@ts-nocheck
import { BoardCanvas } from "@/components/BoardCanvas";
import { Carousel } from "@/components/Game/game.carousel";
import { GameLayout } from "@/components/Game/game.layout";
import { ModalTemplate } from "@/components/Game/game.modal-template";
import { StatTag } from "@/components/Game/game.styles";
import { TriangleDownIcon, TriangleUpIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Flex,
  Grid,
  Tag,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { useState } from "react";

const GamePage = () => {
  const router = useRouter();
  const slug = router.query;
  const [showStats, setShowStats] = useState<boolean>(false);
  const stats = { showStats, setShowStats };

  const disclosure = useDisclosure();

  return (
    <GameLayout>
      <ModalTemplate {...disclosure} />
      <HeaderContainer {...disclosure} />
      <BoardContainer />
      <HandContainer {...disclosure} />
    </GameLayout>
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
      <BoardCanvas src="jpark.svg" move={() => {}} />
    </Box>
  );
};

const HandContainer = ({ onOpen, isOpen, onClose }) => {
  return (
    <Box bg="purple" w="100%" alignItems="end">
      <Carousel />
      <Flex gap="10px" justifyContent={"end"}>
        <ModalButton onClick={() => onOpen()}>Deck</ModalButton>
        <ModalButton onClick={() => onOpen()}>Discard</ModalButton>
      </Flex>
    </Box>
  );
};

const ModalButton = styled(Flex)`
  background-color: antiquewhite;
  justify-content: center;
  align-items: center;
  height: 3svh;
  font-family: Space Grotesk;
  font-weight: 700;
  width: 100%;
  max-width: 250px;
  cursor: pointer;

  :hover {
    background-color: burlywood;
  }
`;
