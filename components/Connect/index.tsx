import {
  Box,
  Button,
  Circle,
  Collapse,
  Divider,
  Flex,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Select,
  Spinner,
  Tag,
  TagLabel,
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
import { generateRandomName } from "./randomName";
import styled from "@emotion/styled";
import { SettingsIcon } from "@chakra-ui/icons";
import { GiRollingDices } from "react-icons/gi";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { buildInviteUrl } from "@/lib/invite";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { DiscordPresence } from "@/components/Discord";

export const ConnectPage = () => {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const gidRef = useRef<HTMLInputElement>(null);

  const [lobby, setLobby] = useState(gidRef?.current?.value ?? "");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteDeckId, setInviteDeckId] = useState("");

  // uses router props to load new decks
  const { isLoading: isDeckImporting, error: deckImportFailed } =
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

  // Fill in randomized readable defaults, but never override an invite link's
  // query params (?username=, ?lobby=) — those must take priority.
  useEffect(() => {
    if (nameRef.current && !nameRef.current.value) {
      nameRef.current.value = generateRandomName();
    }
    if (gidRef.current && !gidRef.current.value) {
      const randomLobby = generateRandomName();
      gidRef.current.value = randomLobby;
      setLobby(randomLobby);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRerollName = () => {
    if (nameRef.current) {
      nameRef.current.value = generateRandomName();
    }
  };

  const handleRerollLobby = () => {
    const randomLobby = generateRandomName();
    if (gidRef.current) {
      gidRef.current.value = randomLobby;
    }
    setLobby(randomLobby);
  };

  const handleJoinSomeoneElse = () => {
    if (gidRef.current) {
      gidRef.current.value = "";
      gidRef.current.focus();
    }
    setLobby("");
    setShowInvite(false);
  };

  const hasDeck = starredDeck !== undefined;

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
      <ConnectContainer backdropFilter="blur(6px)">
        <VStack spacing={1} textAlign="center">
          <Text
            fontSize={"2.5rem"}
            fontWeight={700}
            fontFamily="SpaceGrotesk"
            color="brand.secondary"
            lineHeight="1.1"
          >
            Connect to a Lobby
          </Text>
          <Text color="brand.secondary" opacity={0.7} fontSize="0.95rem">
            Set up your table in three quick steps
          </Text>
        </VStack>

        {/* Step 1 — deck */}
        <VStack w="100%" spacing={2}>
          <StepLabel number="1" label="Choose your deck" />
          <SelectedDeckContainer
            isLoading={isDeckImporting}
            error={deckImportFailed}
          />
        </VStack>

        {/* Steps 2 & 3 — name + lobby */}
        <VStack w="100%" maxW="380px" spacing="1rem">
          <Box w="100%">
            <StepLabel number="2" label="Enter your name" />
            <HStack mt={2} spacing={2}>
              <Input
                id="player-name"
                ref={nameRef}
                defaultValue={router.query.username as string | undefined}
                placeholder="Your name"
                bg="white"
                focusBorderColor="brand.secondary"
              />
              <IconButton
                aria-label="Reroll name"
                icon={<GiRollingDices />}
                onClick={handleRerollName}
                variant="ghost"
                color="brand.secondary"
                _hover={{ bg: "blackAlpha.50" }}
              />
            </HStack>
          </Box>

          <Box w="100%">
            <StepLabel number="3" label="Name a lobby" />
            <HStack mt={2} spacing={2}>
              <Input
                id="lobby-name"
                ref={gidRef}
                defaultValue={router.query.lobby as string | undefined}
                onChange={(e) => {
                  setLobby(e.target.value);
                  if (e.target.value === "") setShowInvite(false);
                }}
                placeholder="lobby name"
                bg="white"
                focusBorderColor="brand.secondary"
              />
              <IconButton
                aria-label="Reroll lobby name"
                icon={<GiRollingDices />}
                onClick={handleRerollLobby}
                variant="ghost"
                color="brand.secondary"
                _hover={{ bg: "blackAlpha.50" }}
              />
            </HStack>
            <Text mt={1} fontSize="0.8rem" color="brand.secondary" opacity={0.65}>
              Create a new lobby, or type a friend&apos;s lobby name to join
              them.{" "}
              <Text
                as="span"
                textDecoration="underline"
                cursor="pointer"
                onClick={handleJoinSomeoneElse}
              >
                Join someone else&apos;s game
              </Text>
            </Text>
          </Box>

          <Button
            w="100%"
            isDisabled={loading || !hasDeck || isDeckImporting}
            bg="brand.secondary"
            color="brand.primary"
            _hover={{ bg: "brand.surfaceDim" }}
            _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
            onClick={() => {
              if (!nameRef?.current?.value || !gidRef?.current?.value) {
                toast.error("Enter your name and a lobby name to connect");
                return;
              }
              setLoading(true);
              refetch();
            }}
          >
            {(loading || isDeckImporting) && <Spinner size="sm" mr={2} />}
            {isDeckImporting ? "Importing your deck…" : "Connect to Game"}
          </Button>
          {isDeckImporting ? (
            <Text fontSize="0.8rem" color="brand.secondary" opacity={0.7} textAlign="center">
              Fetching the deck from your invite link…
            </Text>
          ) : deckImportFailed ? (
            <Text fontSize="0.8rem" color="tomato" opacity={0.9} textAlign="center">
              Couldn&apos;t load that deck — star one from your bag instead
            </Text>
          ) : (
            !hasDeck && (
              <Text fontSize="0.8rem" color="brand.secondary" opacity={0.7} textAlign="center">
                Star a deck in your bag to enable connecting
              </Text>
            )
          )}

          <Button
            w="100%"
            variant="outline"
            color="brand.secondary"
            borderColor="brand.secondary"
            _hover={{ bg: "brand.secondary", color: "brand.primary" }}
            as={Link}
            href={{ pathname: "/offline" }}
          >
            Play Offline without Map
          </Button>

          {/* No friend to invite? Point them to the live Discord to find one. */}
          <VStack w="100%" spacing="0.4rem" pt="0.25rem">
            <Text fontSize="0.8rem" color="brand.secondary" opacity={0.65}>
              No one to play with yet?
            </Text>
            <DiscordPresence tone="dark" />
          </VStack>
        </VStack>

        {/* Optional — invite a friend with a one-click join link */}
        <Box w="100%" maxW="380px">
          <Divider borderColor="brand.secondary" opacity={0.25} />
          {!showInvite ? (
            <Button
              mt="0.75rem"
              variant="ghost"
              size="sm"
              w="100%"
              color="brand.secondary"
              _hover={{ bg: "blackAlpha.50" }}
              isDisabled={lobby === ""}
              onClick={() => setShowInvite(true)}
            >
              {lobby === ""
                ? "Name a lobby above to invite a friend"
                : "＋ Invite a friend with a link"}
            </Button>
          ) : (
            <Collapse in={showInvite} animateOpacity>
              <VStack mt="0.75rem" spacing={2} align="stretch">
                <FormLabel m={0} color="brand.secondary" fontSize="0.85rem">
                  Bundle a deck for them (optional):
                </FormLabel>
                <Select
                  bg="white"
                  focusBorderColor="brand.secondary"
                  value={inviteDeckId}
                  onChange={(e) => setInviteDeckId(e.target.value)}
                >
                  <option value="">
                    Let them choose — or get a popular deck
                  </option>
                  {decks?.map((deck) => (
                    <option key={deck.id} value={deck.version_id ?? deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </Select>
                <Button
                  w="100%"
                  bg="brand.secondary"
                  color="brand.primary"
                  _hover={{ bg: "brand.surfaceDim" }}
                  onClick={() => {
                    const gid = gidRef?.current?.value;
                    if (!gid) return;
                    copy(
                      buildInviteUrl({
                        gid,
                        server: activeServer,
                        deckId: inviteDeckId || undefined,
                      }),
                    );
                    toast.success(
                      "Invite link copied — anyone who clicks it jumps straight in!",
                    );
                  }}
                >
                  Copy Invite Link
                </Button>
              </VStack>
            </Collapse>
          )}
        </Box>
      </ConnectContainer>

      <Flex
        position="absolute"
        bottom="0.75rem"
        right="0.75rem"
        flexDir={"row"}
        alignItems="center"
        gap={2}
        onClick={disclosure.onOpen}
        cursor="pointer"
        bg="blackAlpha.400"
        color="ghostwhite"
        borderRadius="full"
        px={3}
        py={1}
        fontSize="0.8rem"
        transition="all 0.2s ease"
        _hover={{ bg: "blackAlpha.600" }}
      >
        <SettingsIcon />
        <Text display={{ base: "none", md: "block" }}>GameServer:</Text>
        <Tag
          size="sm"
          bg="brand.secondary"
          color="brand.primary"
          display={{ base: "none", md: "inline-flex" }}
        >
          <TagLabel maxW={{ base: "38vw", md: "none" }}>{activeServer}</TagLabel>
        </Tag>
      </Flex>
    </Wrapper>
  );
};

const StepLabel = (props: { number: string; label: string }) => (
  <HStack w="100%" spacing={2} justify="flex-start">
    <Circle
      size="1.5rem"
      bg="brand.secondary"
      color="brand.primary"
      fontFamily="SpaceGrotesk"
      fontWeight={700}
      fontSize="0.85rem"
    >
      {props.number}
    </Circle>
    <Text
      fontFamily="SpaceGrotesk"
      fontWeight={600}
      color="brand.secondary"
      fontSize="0.95rem"
    >
      {props.label}
    </Text>
  </HStack>
);

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
  width: 95%;
  max-width: 600px;
  min-height: min(600px, calc(100svh - 4rem));
  max-height: calc(100svh - 2rem);
  overflow-y: auto;
  background-color: rgba(241, 224, 193, 0.92);
  border-radius: 1rem;
  padding: 2rem;
  gap: 1.5rem;
  justify-content: flex-start;
  align-items: center;
  box-shadow: 0 12px 40px rgba(44, 24, 49, 0.45);
`;
