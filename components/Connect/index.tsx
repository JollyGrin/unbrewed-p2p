import {
  Box,
  Button,
  Flex,
  FormLabel,
  Grid,
  HStack,
  Input,
  Select,
  Spinner,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
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
import { PlusSquareIcon } from "@chakra-ui/icons";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { toast } from "react-hot-toast";

export const ConnectPage = () => {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const gidRef = useRef<HTMLInputElement>(null);

  const [lobby, setLobby] = useState(gidRef?.current?.value ?? "");
  const [sharedDeckId, setSharedDeckId] = useState<string | undefined>();

  // uses router props to load new decks
  useLoadRouterDeck();

  const { starredDeck, decks } = useLocalDeckStorage();
  const { activeServer, setActiveServer, serverList } = useLocalServerStorage();

  // create the lobby and connect to it
  const { refetch, loading, setLoading, disclosure } = useCreateLobby({
    gidRef,
    nameRef,
  });

  const [_, copy] = useCopyToClipboard();

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
        <Text fontSize={"2.5rem"} fontWeight={700} fontFamily="SpaceGrotesk">
          Connect to a Lobby
        </Text>
        <SelectedDeckContainer />
        <Grid
          templateColumns={`1fr ${sharedDeckId === undefined ? "auto" : ""} 1fr`}
          w="100%"
          gap="0.5rem"
        >
          {sharedDeckId === undefined && <div />}
          <VStack>
            <Input
              ref={nameRef}
              defaultValue={router.query.username as string | undefined}
              placeholder="Your name"
              bg="white"
            />
            <Input
              ref={gidRef}
              defaultValue={router.query.lobby as string | undefined}
              onChange={(e) => {
                setLobby(e.target.value);
                if (e.target.value === "") setSharedDeckId(undefined);
              }}
              placeholder="lobby name"
              bg="white"
            />
            <Button
              // If we are loading a new lobby request, freeze the input values.
              // isDisabled={(data && isLoading) || starredDeck === undefined}
              w="100%"
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
          {sharedDeckId === undefined && (
            <PlusSquareIcon
              opacity={lobby !== "" ? 1 : 0}
              transition="all 0.25s ease-in-out"
              onClick={() => setSharedDeckId("")}
              fontSize="2rem"
              alignSelf="center"
              justifySelf="center"
              cursor="pointer"
              _hover={{
                transform: "scale(1.2)",
              }}
            />
          )}

          {sharedDeckId !== undefined && (
            <VStack>
              <FormLabel mt="7px">Share a link with the deck:</FormLabel>
              <Select
                bg="white"
                onChange={(e) => setSharedDeckId(e.target.value)}
              >
                {decks?.map((deck) => (
                  <option key={deck.id} value={deck.version_id ?? deck.id}>
                    {deck.name}
                  </option>
                ))}
              </Select>
              <Button
                w="100%"
                onClick={() => {
                  const baseUrl = "https://unbrewed.xyz/connect";
                  const sharableUrl = `${baseUrl}?lobby=${gidRef?.current?.value}&deckId=${sharedDeckId}`;
                  copy(sharableUrl);
                  toast.success("Copied to clipboard: " + sharableUrl);
                }}
              >
                Copy Sharable Link
              </Button>
            </VStack>
          )}
        </Grid>
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
  min-height: 600px;
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 1rem;
  padding: 2rem;
  justify-content: space-evenly;
  align-items: center;
`;
