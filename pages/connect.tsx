import axios from "axios";
import {
  Button,
  Flex,
  HStack,
  Input,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";


const ConnectToGamePage = () => {
  return <ConnectPage />;
};
export default ConnectToGamePage;

const ConnectPage = () => {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const gidRef = useRef<HTMLInputElement>(null);

  // This serverURL should come from somewhere else.
  const serverURL = new URL("http://localhost:1111");

  // We need to create the lobby before a websocket can be made.
  // We do this on the connect, as an error from a GET request is easier
  // to handle than an error from a websocket. So make sure the server is
  // responding before we go to a connected state.
  const { isLoading, refetch } = useQuery(
    ["create-lobby"],
    async () => {
      if (!gidRef?.current?.value) return;
      const createLobbyURL = new URL(`/lobby/${gidRef.current.value}`, serverURL);
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
        if (!nameRef?.current || !gidRef?.current) return
        router.push("/game?name=" + nameRef.current.value + "&gid=" + gidRef.current.value);
      },
      // onError: (e) => toast.error("Error fetching deck"),
    }
  );

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
            <Input ref={nameRef} placeholder="Your name" />
            <Input ref={gidRef} placeholder="room name" />
          </HStack>
          <Button
            // If we are loading a new lobby request, freeze the input values.
            disabled={isLoading}
            onClick={() => {
              if (!nameRef?.current?.value || !gidRef?.current?.value) {
                alert("I need a name and a room name");
                return;
              }
              refetch();
            }}
          >
            Submit
          </Button>
        </VStack>
      </Flex>
    </Flex>
  );
};
