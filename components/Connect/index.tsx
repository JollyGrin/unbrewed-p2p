import axios from "axios";
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
  useDisclosure,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useLocalDeckStorage,
  useLocalServerStorage,
} from "@/lib/hooks/useLocalStorage";
import { SettingsModal } from "@/components/Settings/settings.modal";
import { toast } from "react-hot-toast";
import { useLoadRouterDeck } from "@/lib/hooks";
import { Navbar } from "@/components/Navbar";
import { SelectedDeckContainer } from "./SelectedDeck";

export const ConnectPage = () => {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const gidRef = useRef<HTMLInputElement>(null);
  const { isOpen, onClose, onOpen } = useDisclosure();

  useLoadRouterDeck();

  // the useQuery loading props not working on repeat visits
  const [loading, setLoading] = useState<boolean>(false);

  const { starredDeck } = useLocalDeckStorage();
  const { activeServer, setActiveServer, serverList } = useLocalServerStorage();

  // This serverURL should come from somewhere else.
  const serverURL = new URL(activeServer);

  // We need to create the lobby before a websocket can be made.
  // We do this on the connect, as an error from a GET request is easier
  // to handle than an error from a websocket. So make sure the server is
  // responding before we go to a connected state.
  const { refetch } = useQuery(
    ["create-lobby"],
    async () => {
      if (!gidRef?.current?.value) return;
      const createLobbyURL = new URL(
        `/lobby/${gidRef.current.value}`,
        serverURL,
      );
      try {
        const result = await axios.get(createLobbyURL.toString());
        return result.data;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
    {
      // We manually call refetch.
      enabled: false,
      refetchOnWindowFocus: false,
      onSuccess: () => {
        // If the lobby was created, we can move to the game state and
        // connect to the websocket.
        if (!nameRef?.current || !gidRef?.current) return;
        router.push(
          "/game?name=" +
            nameRef.current.value +
            "&gid=" +
            gidRef.current.value,
        );

        // HACK: the loading props are borked, so manually setting and resetting state
        setTimeout(() => {
          setLoading(false);
          toast.success(
            `Successfully connected to GameServer: \n ${activeServer}`,
          );
        }, 10000);
      },
      onError: () => {
        setLoading(false);
        onOpen();
        toast.error(`Failed to connect to GameServer: \n ${activeServer}`);
      },
    },
  );

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
        isOpen={isOpen}
        onClose={onClose}
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
        onClick={onOpen}
        cursor="pointer"
      >
        <Text color="ghostwhite">Active GameServer URL:</Text>
        <Tag p={2}>{activeServer}</Tag>
      </Flex>
    </Flex>
  );
};
