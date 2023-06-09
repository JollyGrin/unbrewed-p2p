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
import Link from "next/link";
import { SettingsModal } from "@/components/Settings/settings.modal";
import { toast } from "react-hot-toast";

const ConnectToGamePage = () => {
  return <ConnectPage />;
};
export default ConnectToGamePage;

const ConnectPage = () => {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const gidRef = useRef<HTMLInputElement>(null);
  const { isOpen, onClose, onOpen } = useDisclosure();

  // the useQuery loading props not working on repeat visits
  const [loading, setLoading] = useState<boolean>(false);

  const { starredDeck } = useLocalDeckStorage();
  const { activeServer, setActiveServer, serverList } = useLocalServerStorage();

  console.log("out", activeServer.substring(0, 12));

  // This serverURL should come from somewhere else.
  const serverURL = new URL(activeServer ?? "http://localhost:1111");

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
        serverURL
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
          "/game?name=" + nameRef.current.value + "&gid=" + gidRef.current.value
        );

        // HACK: the loading props are borked, so manually setting and resetting state
        setTimeout(() => {
          setLoading(false);
          toast.success(
            `Successfully connected to GameServer: \n ${activeServer}`
          );
        }, 10000);
      },
      onError: () => {
        setLoading(false);
        onOpen();
        toast.error(`Failed to connect to GameServer: \n ${activeServer}`);
      },
    }
  );

  useEffect(() => {
    router.prefetch("/game");
  }, [router]);

  return (
    <Flex
      h={"100svh"}
      bg="brand.800"
      justifyContent={"center"}
      alignItems={"center"}
    >
      <SettingsModal
        isOpen={isOpen}
        onClose={onClose}
        serverStorage={{ activeServer, setActiveServer, serverList }}
      />
      <Flex
        flexDir={"column"}
        h="60%"
        w="95%"
        maxW="600px"
        bg="white"
        borderRadius={5}
        p={3}
        justifyContent={"space-evenly"}
        alignItems={"center"}
      >
        <Text fontSize={"2.5rem"}>Connect</Text>
        <SelectedDeckContainer />
        <VStack m={"2rem auto"}>
          <HStack>
            <Input ref={nameRef} placeholder="Your name" />
            <Input ref={gidRef} placeholder="room name" />
          </HStack>
          <Button
            // If we are loading a new lobby request, freeze the input values.
            // isDisabled={(data && isLoading) || starredDeck === undefined}
            isDisabled={loading || starredDeck === undefined}
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
            Submit
          </Button>
        </VStack>
      </Flex>
      <Flex
        position="absolute"
        bottom="0"
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

const SelectedDeckContainer = () => {
  const { starredDeck } = useLocalDeckStorage();
  return (
    <Flex
      flexDir={"column"}
      w="100%"
      justifyContent={"center"}
      alignItems={"center"}
      gap={3}
    >
      {starredDeck === undefined ? (
        <>
          <Flex
            w="100px"
            h="100px"
            justifyContent="center"
            alignItems="center"
            bg="saddlebrown"
            boxShadow="inset 0 0 10px black"
            borderRadius={5}
            flexDir={"column"}
          >
            <Link href={"/bag"}>
              <Text
                fontSize="6xl"
                color="goldenrod"
                cursor="pointer"
                _hover={{ color: "gold" }}
              >
                +
              </Text>
            </Link>
          </Flex>
          <Text>
            No deck selected! <br /> Star a deck from your bag
          </Text>
        </>
      ) : (
        <>
          <Flex
            w="100px"
            h="100px"
            bg={starredDeck.deck_data.appearance.highlightColour}
            border={`0.5rem solid ${starredDeck.deck_data.appearance.borderColour}`}
            justifyContent="center"
            alignItems="center"
            boxShadow="0 0 10px rgba(0,0,0,0.5)"
            borderRadius={5}
            flexDir={"column"}
            transition="all 0.25s ease-in-out"
            _hover={{ boxShadow: "0 0 20px rgba(0,0,0,0.55)" }}
            cursor="pointer"
          >
            <Text
              fontSize="4xl"
              fontFamily={"monospace"}
              color={starredDeck.deck_data.appearance.borderColour}
              _hover={{ color: "gold" }}
            >
              {starredDeck.name.substring(0, 2)}
            </Text>
          </Flex>
          <Tag p={2} fontFamily={"monospace"} fontSize={"1.1rem"}>
            {starredDeck.name}
          </Tag>
        </>
      )}
    </Flex>
  );
};
