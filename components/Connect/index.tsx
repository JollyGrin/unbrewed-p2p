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
    <Flex
      h={"100svh"}
      bg="slategray"
      bgImage="background/choosefighter.png"
      bgPosition="center"
      bgSize="cover"
      bgBlendMode="multiply"
      justifyContent={"center"}
      alignItems={"center"}
      position="relative"
    >
      <SettingsModal
        isOpen={disclosure.isOpen}
        onClose={disclosure.onClose}
        serverStorage={{ activeServer, setActiveServer, serverList }}
      />
      <Box position="absolute" top="0" w="100%" color="brand.primary">
        <Navbar />
      </Box>
      <Flex
        flexDir={"column"}
        h="60%"
        w="95%"
        maxW="600px"
        bg="rgba(255,255,255,0.9)"
        backdropFilter="blur(5px)"
        borderRadius={9}
        p={3}
        justifyContent={"space-evenly"}
        alignItems={"center"}
      >
        <Text fontSize={"2.5rem"}>Connect</Text>
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
      </Flex>
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
    </Flex>
  );
};
