import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Spinner,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
import {
  useLocalDeckStorage,
  useLocalServerStorage,
} from "@/lib/hooks/useLocalStorage";
import { SettingsModal } from "@/components/Settings/settings.modal";
import { useLoadRouterDeck } from "@/lib/hooks";
import { Navbar } from "@/components/Navbar";
import { SelectedDeckContainer } from "./SelectedDeck";
import { useCreateLobby } from "./useCreateLobby";
import styled from "@emotion/styled";

export const ConnectPage = () => {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const gidRef = useRef<HTMLInputElement>(null);

  // uses router props to load new decks
  useLoadRouterDeck();

  const { starredDeck } = useLocalDeckStorage();
  const { activeServer, setActiveServer, serverList } = useLocalServerStorage();

  // create the lobby and connect to it
  const { refetch, loading, setLoading, disclosure } = useCreateLobby({
    gidRef,
    nameRef,
  });

  useEffect(() => {
    router.prefetch("/game");
  }, [router]);

  return (
    <Wrapper bgImage="background/choosefighter.png" bgBlendMode="multiply">
      <SettingsModal
        isOpen={disclosure.isOpen}
        onClose={disclosure.onClose}
        serverStorage={{ activeServer, setActiveServer, serverList }}
      />
      <Box position="absolute" top="0" w="100%" color="brand.primary">
        <Navbar />
      </Box>
      <ConnectContainer backdropFilter="blur(5px)">
        <Text fontSize={"2.5rem"} fontFamily="SpaceGrotesk">
          Connect
        </Text>
        <SelectedDeckContainer />
        <VStack m={"2rem auto"}>
          <HStack>
            <Input
              ref={nameRef}
              defaultValue={router.query.username as string | undefined}
              placeholder="Your name"
              bg="white"
            />
            <Input
              ref={gidRef}
              defaultValue={router.query.lobby as string | undefined}
              placeholder="room name"
              bg="white"
            />
          </HStack>
          <Button
            // If we are loading a new lobby request, freeze the input values.
            // isDisabled={(data && isLoading) || starredDeck === undefined}
            isDisabled={loading || starredDeck === undefined}
            bg="brand.primary"
            onClick={() => {
              if (!nameRef?.current?.value || !gidRef?.current?.value) {
                alert("I need a name and a room name");
                return;
              }
              setLoading(true);
              refetch();
            }}
          >
            {loading && <Spinner />}
            Connect to Game
          </Button>
        </VStack>
      </ConnectContainer>
      <Flex
        position="absolute"
        bottom="0.5rem"
        flexDir={"column"}
        alignItems="center"
        onClick={disclosure.onOpen}
        cursor="pointer"
      >
        <Text color="ghostwhite">Active GameServer URL:</Text>
        <Tag p={2}>{activeServer}</Tag>
      </Flex>
    </Wrapper>
  );
};

const Wrapper = styled(Flex)`
  height: 100svh;
  background-color: slategray;
  background-position: center;
  background-size: cover;
  justify-content: center;
  align-items: center;
  position: center;
`;

const ConnectContainer = styled(Flex)`
  flex-direction: column;
  height: 50%;
  width: 95%;
  max-width: 600px;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 1rem;
  padding: 2rem;
  justify-content: space-evenly;
  align-items: center;
`;
