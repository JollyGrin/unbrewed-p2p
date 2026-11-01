import {
  Box,
  Button,
  Circle,
  Flex,
  HStack,
  Image,
  IconButton,
  Input,
  Spinner,
  Tag,
  TagLabel,
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useLocalServerStorage } from "@/lib/hooks/useLocalStorage";
import { useBagDecks } from "@/lib/bag/useBag";
import { useProDecks } from "@/lib/proDecks";
import { trackDeckSelected } from "@/lib/deckAnalytics";
import { SettingsModal } from "@/components/Settings/settings.modal";
import { useLoadRouterDeck } from "@/lib/hooks";
import { SiteNav } from "@/components/SiteNav";
import { SelectedDeckContainer } from "./SelectedDeck";
import { InviteLink } from "./InviteLink";
import { useCreateLobby } from "./useCreateLobby";
import { generateRandomName } from "./randomName";
import styled from "@emotion/styled";
import { SettingsIcon } from "@chakra-ui/icons";
import { GiRollingDices } from "@/components/Icons/gi";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { DiscordPresence } from "@/components/Discord";
import { useAccount } from "@/lib/account/useAccount";
import { MapPickerModal } from "@/components/Game/Header/map.modal";
import DEFAULT_MAPS from "@/components/Bag/Map/MapModal/defaultMaps.json";
import { useBagMaps } from "@/lib/bag/useBag";
import { MapData } from "@/lib/hooks";
import { track } from "@/lib/analytics";
import { deckSourceOf } from "@/lib/gameAnalytics";

export const ConnectPage = () => {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const gidRef = useRef<HTMLInputElement>(null);
  const account = useAccount();
  // The name WE last wrote into the (uncontrolled) name field — a random
  // default, or the account name once `/me` answers. null once the player has
  // touched the field, which is what stops a late probe from overwriting them.
  const autoNameRef = useRef<string | null>(null);

  const [lobby, setLobby] = useState(gidRef?.current?.value ?? "");
  // The lobby name WE last rolled. Connecting under it creates a lobby; a
  // typed or invite-link name joins one (analytics, #1511).
  const rolledLobbyRef = useRef<string | null>(null);

  // uses router props to load new decks
  const { isLoading: isDeckImporting, error: deckImportFailed } =
    useLoadRouterDeck();

  const { starredDeck, decks, setStar, isLoading: bagLoading } = useBagDecks();
  const proDecks = useProDecks();
  const { activeServer, setActiveServer, serverList } = useLocalServerStorage();

  // Map chosen before the lobby exists. Local state only — it rides on the
  // /game push as `mapUrl`; an invite link's ?mapUrl= pre-selects it.
  const [mapUrl, setMapUrl] = useState<string | undefined>(() => {
    const q = router.query.mapUrl;
    return typeof q === "string" && q ? q : undefined;
  });
  const mapDisclosure = useDisclosure();
  const { data: localMaps } = useBagMaps();
  const chosenMap = mapUrl
    ? [...localMaps, ...(DEFAULT_MAPS as MapData[])].find(
        (m) => m.imgUrl === mapUrl,
      )
    : undefined;

  // The router query settles after hydration on a statically optimised page,
  // so adopt an invite link's mapUrl once, if nothing was chosen yet.
  const queryMapUrl = router.query.mapUrl;
  useEffect(() => {
    if (typeof queryMapUrl === "string" && queryMapUrl) {
      setMapUrl((prev) => prev ?? queryMapUrl);
    }
  }, [queryMapUrl]);

  // create the lobby and connect to it
  const { refetch, loading, setLoading, disclosure } = useCreateLobby({
    gidRef,
    nameRef,
    mapUrl,
    onLobbyReady: () => {
      if (gidRef.current?.value === rolledLobbyRef.current) {
        track("lobby_created", {
          mode: "sandbox",
          deck_source: deckSourceOf(starredDeck),
        });
      } else {
        track("lobby_joined", { mode: "sandbox" });
      }
    },
  });

  useEffect(() => {
    router.prefetch("/game");
  }, [router]);

  // Fill in randomized readable defaults, but never override an invite link's
  // query params (?username=, ?lobby=) — those must take priority.
  useEffect(() => {
    if (nameRef.current && !nameRef.current.value) {
      const random = generateRandomName();
      nameRef.current.value = random;
      autoNameRef.current = random;
    }
    if (gidRef.current && !gidRef.current.value) {
      const randomLobby = generateRandomName();
      gidRef.current.value = randomLobby;
      rolledLobbyRef.current = randomLobby;
      setLobby(randomLobby);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed-in players play under their Discord name (issue #568). The `/me`
  // probe settles after mount, so this replaces the random default the moment
  // it answers — but ONLY while the field still holds the value WE wrote. The
  // input is uncontrolled and stays freely editable; typing or rolling a fresh
  // name clears the claim so a late probe can't stomp a deliberate choice. A
  // guest (or an unreachable API) keeps the random name exactly as before.
  useEffect(() => {
    if (account.status !== "signed-in") return;
    const input = nameRef.current;
    if (!input || input.value !== autoNameRef.current) return;
    input.value = account.account.username;
    autoNameRef.current = input.value;
  }, [account]);

  const handleRerollName = () => {
    if (nameRef.current) {
      nameRef.current.value = generateRandomName();
      autoNameRef.current = null; // a deliberate roll — don't restomp it
    }
  };

  const handleRerollLobby = () => {
    const randomLobby = generateRandomName();
    if (gidRef.current) {
      gidRef.current.value = randomLobby;
    }
    rolledLobbyRef.current = randomLobby;
    setLobby(randomLobby);
  };

  const handleJoinSomeoneElse = () => {
    if (gidRef.current) {
      gidRef.current.value = "";
      gidRef.current.focus();
    }
    setLobby("");
  };

  const hasDeck = starredDeck !== undefined;

  return (
    <Wrapper>
      <SettingsModal
        isOpen={disclosure.isOpen}
        onClose={disclosure.onClose}
        serverStorage={{ activeServer, setActiveServer, serverList }}
      />
      <MapPickerModal
        isOpen={mapDisclosure.isOpen}
        onClose={mapDisclosure.onClose}
        selectedUrl={mapUrl}
        onConfirm={setMapUrl}
        onReset={() => setMapUrl(undefined)}
        title="Select a Map"
        confirmLabel="Select Map"
        footerNote="Applies to the lobby you connect to. You can still change the map in-game."
      />
      <Box w="100%" color="brand.primary">
        <SiteNav />
      </Box>
      <ConnectContainer>
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
            Set up your table in a few quick steps
          </Text>
        </VStack>

        {/* Two columns on desktop so the whole card fits without scrolling;
            stacks back to a single column on narrow screens. */}
        <Flex
          w="100%"
          flexDir={{ base: "column", md: "row" }}
          align="flex-start"
          justify="center"
          gap={{ base: "1.5rem", md: "2.5rem" }}
        >
        {/* Step 1 — deck (left column) */}
        <VStack w="100%" spacing={2}>
          <StepLabel number="1" label="Choose your deck" />
          <SelectedDeckContainer
            // bagLoading covers the account half arriving a round trip after
            // mount (#644): the tile spins rather than claiming no deck.
            isLoading={isDeckImporting || bagLoading}
            error={deckImportFailed}
            starredDeck={starredDeck}
            decks={decks}
            proDecks={proDecks}
            setStar={(id) => {
              setStar(id);
              trackDeckSelected("sandbox", id, decks, proDecks);
            }}
          />
        </VStack>

        {/* Steps 2 & 3 — name + lobby (right column) */}
        <VStack w="100%" maxW="380px" spacing="1rem">
          <Box w="100%">
            <StepLabel number="2" label="Enter your name" />
            <HStack mt={2} spacing={2}>
              <Input
                id="player-name"
                ref={nameRef}
                defaultValue={router.query.username as string | undefined}
                onChange={() => {
                  autoNameRef.current = null; // the player owns the field now
                }}
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
                onChange={(e) => setLobby(e.target.value)}
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

          <Box w="100%">
            <StepLabel number="4" label="Select map" />
            <HStack mt={2} spacing={3}>
              {mapUrl && (
                <Image
                  alt=""
                  src={chosenMap?.thumbUrl ?? mapUrl}
                  w="3.5rem"
                  h="2.5rem"
                  objectFit="cover"
                  borderRadius="0.35rem"
                  flexShrink={0}
                />
              )}
              <Text
                flex="1"
                minW={0}
                noOfLines={1}
                fontWeight={600}
                color="brand.secondary"
                data-testid="connect-map-title"
              >
                {mapUrl ? (chosenMap?.meta?.title ?? "Custom map") : "Default"}
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="brand.secondary"
                borderColor="brand.secondary"
                _hover={{ bg: "brand.secondary", color: "brand.primary" }}
                onClick={mapDisclosure.onOpen}
              >
                Select map
              </Button>
            </HStack>
            <Text mt={1} fontSize="0.8rem" color="brand.secondary" opacity={0.65}>
              You can also change the map in-game.
            </Text>
          </Box>

          <Button
            w="100%"
            isDisabled={loading || !hasDeck || isDeckImporting || bagLoading}
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
            !hasDeck &&
            !bagLoading && (
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
            href={{ pathname: "/irl" }}
          >
            Play Offline without Map
          </Button>

          <Button
            w="100%"
            variant="outline"
            color="brand.secondary"
            borderColor="brand.secondary"
            _hover={{ bg: "brand.secondary", color: "brand.primary" }}
            as={Link}
            href="/table"
          >
            Try the 3D Table (beta)
          </Button>

          {/* No friend to invite? Point them to the live Discord to find one. */}
          <VStack w="100%" spacing="0.4rem" pt="0.25rem">
            <Text fontSize="0.8rem" color="brand.secondary" opacity={0.65}>
              No one to play with yet?
            </Text>
            <DiscordPresence tone="dark" />
          </VStack>

          {/* Optional — invite a friend with a one-click join link */}
          <InviteLink
            lobby={lobby}
            decks={decks}
            activeServer={activeServer}
            gidRef={gidRef}
          />
        </VStack>
        </Flex>
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

// Flat purple backdrop (issue #1192) — the AI-art photo background is gone,
// so /connect and /join share the same theme-token surface.
const Wrapper = styled(Flex)`
  /* The nav sits in flow; the card centres in the rest via auto margins and
     the page scrolls (rather than clipping under the bar) when it is taller. */
  min-height: 100svh;
  flex-direction: column;
  background-color: var(--chakra-colors-brand-surface);
  align-items: center;
  padding-bottom: 1rem;
`;

const ConnectContainer = styled(Flex)`
  flex-direction: column;
  width: 95%;
  max-width: 960px;
  background-color: rgba(241, 224, 193, 0.96);
  border-radius: 1rem;
  padding: 1.5rem 2rem;
  gap: 1.25rem;
  margin: auto 0;
  justify-content: flex-start;
  align-items: center;
  box-shadow: 0 12px 40px rgba(44, 24, 49, 0.45);
`;
