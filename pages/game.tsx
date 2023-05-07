//@ts-nocheck
import { BoardCanvas } from "@/components/BoardCanvas";
import { Carousel, deckItemMapper } from "@/components/Game/game.carousel";
import { GameLayout } from "@/components/Game/game.layout";
import { ModalTemplate } from "@/components/Game/game.modal-template";
import { StatTag } from "@/components/Game/game.styles";
import { initializeWebsocket } from "@/lib/gamesocket/socket";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import { useGameState } from "@/lib/hooks/useSocket";
import { TriangleDownIcon, TriangleUpIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Input,
  Tag,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import styled from "@emotion/styled";
import { useRouter } from "next/router";
import { useRef, useState } from "react";

const GamePage = () => {
  const router = useRouter();
  const slug = router.query;
  console.log({ slug });
  const [showStats, setShowStats] = useState<boolean>(false);
  const stats = { showStats, setShowStats };

  const disclosure = useDisclosure();

  const isConnected = !!slug?.gid;

  return (
    <>
      {!isConnected && <ConnectPage />}
      {isConnected && (
        <GameLayout>
          <ModalTemplate {...disclosure} />
          <HeaderContainer {...disclosure} />
          <BoardContainer />
          <HandContainer {...disclosure} />
        </GameLayout>
      )}
    </>
  );
};

export default GamePage;

const ConnectPage = () => {
  // const { state, setState } = useGameState("foo", "bar");
  // const fn = () =>
  //   initializeWebsocket({
  //     name: "foo",
  //     gid: "bar",
  //     connectURL: new URL("http://localhost:1111"),
  //     onGameState: (state: GameStateMessage) => {
  //       console.log("new state", state);
  //     },
  //   });
  const router = useRouter();
  const nameRef = useRef();
  const gidRef = useRef();

  console.log({ nameRef, gidRef });

  return (
    <Flex
      h={"100svh"}
      bg="brand.800"
      justifyContent={"center"}
      alignItems={"center"}
    >
      <Flex
        flexDir={"column"}
        h="60%"
        w="95%"
        maxW="600px"
        bg="white"
        borderRadius={5}
        p={3}
      >
        <Text fontSize={"2.5rem"}>Connect</Text>
        <VStack m={"auto auto"}>
          <HStack>
            <Input ref={nameRef} placeholder="Your name" onChange={(e) => {}} />
            <Input ref={gidRef} placeholder="room name" />
          </HStack>
          <Button
            onClick={() => {
              const name = nameRef.current.value;
              const gid = gidRef.current.value;

              router.push("?name=" + name + "&gid=" + gid);
            }}
          >
            Submit
          </Button>
        </VStack>
      </Flex>
    </Flex>
  );
};

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
      <BoardCanvas
        src="jpark.svg"
        move={(e) => {
          console.log("move", e());
        }}
      />
    </Box>
  );
};

const HandContainer = ({ onOpen, isOpen, onClose }) => {
  const { starredDeck } = useLocalDeckStorage();
  return (
    <Box bg="purple" w="100%" alignItems="end">
      <Carousel items={deckItemMapper(starredDeck, { my: 3 })} />
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
