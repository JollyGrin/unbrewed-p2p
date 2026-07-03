import {
  Box,
  Button,
  Flex,
  IconButton,
  Input,
  Select,
  Spinner,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import { RepeatIcon } from "@chakra-ui/icons";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import styled from "@emotion/styled";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { PopularDeckMeta } from "@/lib/constants/top-decks";
import {
  DEFAULT_SERVER,
  LS_KEY,
  useLocalDeckStorage,
  useLocalServerStorage,
} from "@/lib/hooks/useLocalStorage";
import {
  fetchDeckById,
  isValidServerUrl,
  persistAndStarDeck,
  randomPlayerName,
  randomPopularDeck,
} from "@/lib/invite";

/** Sentinel values for the deck <Select>; local decks use their own id. */
const CHOICE_REMOTE = "__remote";

/**
 * Invite landing page: everything on this screen is pre-filled from the
 * invite link (lobby, gameserver, optionally a deck) so a friend who has
 * never seen Unbrewed is one click away from sitting at the table.
 */
export const JoinPage = () => {
  const router = useRouter();
  const gid = router.query.gid as string | undefined;
  const invitedDeckId = router.query.deckId as string | undefined;
  const serverParam = router.query.server as string | undefined;

  const { decks, star } = useLocalDeckStorage();
  const { activeServer, setActiveServer } = useLocalServerStorage();

  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [deckChoice, setDeckChoice] = useState<string>(CHOICE_REMOTE);
  const [remoteDeck, setRemoteDeck] = useState<DeckImportType>();
  const [randomMeta, setRandomMeta] = useState<PopularDeckMeta>();
  const [remoteDeckFailed, setRemoteDeckFailed] = useState(false);
  const [joining, setJoining] = useState(false);

  // random values are picked after mount so the static prerender matches
  useEffect(() => {
    setMounted(true);
    setName(randomPlayerName());
  }, []);

  const serverOverride =
    serverParam && isValidServerUrl(serverParam) ? serverParam : undefined;
  const targetServer = serverOverride ?? activeServer;

  // resolve which deck the joiner starts with
  useEffect(() => {
    if (!mounted || !router.isReady) return;

    const loadRemote = async (id: string) => {
      try {
        setRemoteDeck(await fetchDeckById(id));
      } catch (err) {
        console.error(err);
        setRemoteDeckFailed(true);
      }
    };

    if (invitedDeckId) {
      // the host picked a deck for them — it may already be in their bag
      const local = decks?.find(
        (d) => d.id === invitedDeckId || d.version_id === invitedDeckId,
      );
      if (local) {
        setRemoteDeck(local);
        setDeckChoice(local.id);
      } else {
        setDeckChoice(CHOICE_REMOTE);
        loadRemote(invitedDeckId);
      }
      return;
    }

    if (decks?.length) {
      // returning player: default to their starred deck
      const starred = decks.find((d) => d.id === star);
      setDeckChoice((starred ?? decks[0]).id);
      return;
    }

    // brand-new player: hand them one of the community's favorite decks
    const meta = randomPopularDeck();
    setRandomMeta(meta);
    setDeckChoice(CHOICE_REMOTE);
    loadRemote(meta.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, router.isReady, invitedDeckId, decks, star]);

  useEffect(() => {
    router.prefetch("/game");
  }, [router]);

  const remoteDeckName =
    remoteDeck?.name ?? randomMeta?.name ?? (remoteDeckFailed ? "" : "…");

  const handleJoin = async () => {
    if (!gid) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Enter a name to join");
      return;
    }
    setJoining(true);
    try {
      // create/verify the lobby on the host's gameserver
      const lobbyUrl = new URL(`/lobby/${gid}`, targetServer);
      await axios.get(lobbyUrl.toString());

      // adopt the host's server so the websocket opens against the same room
      if (serverOverride && serverOverride !== activeServer) {
        setActiveServer(serverOverride);
      }

      if (deckChoice === CHOICE_REMOTE) {
        const deck =
          remoteDeck ??
          (await fetchDeckById(invitedDeckId ?? randomMeta?.id ?? ""));
        persistAndStarDeck(deck);
      } else {
        localStorage.setItem(LS_KEY.STAR_DECK, deckChoice);
      }

      router.push(
        `/game?name=${encodeURIComponent(trimmedName)}&gid=${encodeURIComponent(gid)}`,
      );
    } catch (err) {
      console.error(err);
      setJoining(false);
      toast.error(
        "Couldn't reach the game — ask your friend for a fresh link, or connect manually.",
      );
    }
  };

  if (!router.isReady || !mounted) {
    return (
      <Wrapper bgImage="background/choosefighter.png" bgBlendMode="multiply">
        <Spinner color="ghostwhite" size="xl" />
      </Wrapper>
    );
  }

  if (!gid) {
    return (
      <Wrapper bgImage="background/choosefighter.png" bgBlendMode="multiply">
        <JoinContainer backdropFilter="blur(6px)">
          <Title>This invite is missing its lobby</Title>
          <Text color="brand.secondary" textAlign="center">
            Ask your friend to copy the invite link again — or set up a game
            yourself.
          </Text>
          <Button
            as={Link}
            href="/connect"
            bg="brand.secondary"
            color="brand.primary"
            _hover={{ bg: "brand.surfaceDim" }}
          >
            Go to the connect page
          </Button>
        </JoinContainer>
      </Wrapper>
    );
  }

  const hasOwnDecks = !!decks?.length;
  const deckReady = deckChoice !== CHOICE_REMOTE || !!remoteDeck;

  return (
    <Wrapper bgImage="background/choosefighter.png" bgBlendMode="multiply">
      <JoinContainer backdropFilter="blur(6px)">
        <VStack spacing={1} textAlign="center">
          <Title>You&apos;re invited!</Title>
          <Text color="brand.secondary" opacity={0.8}>
            A seat is waiting for you in lobby{" "}
            <Text as="span" fontWeight={700} fontFamily="SpaceGrotesk">
              {gid}
            </Text>
          </Text>
        </VStack>

        <VStack w="100%" maxW="380px" spacing="1.25rem">
          <Box w="100%">
            <FieldLabel>Playing as</FieldLabel>
            <Flex mt={2} gap={2}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                bg="white"
                focusBorderColor="brand.secondary"
              />
              <IconButton
                aria-label="Roll a new name"
                icon={<RepeatIcon />}
                onClick={() => setName(randomPlayerName())}
                variant="outline"
                color="brand.secondary"
                borderColor="brand.secondary"
                _hover={{ bg: "brand.secondary", color: "brand.primary" }}
              />
            </Flex>
          </Box>

          <Box w="100%">
            <FieldLabel>Your deck</FieldLabel>
            {hasOwnDecks ? (
              <Select
                mt={2}
                bg="white"
                focusBorderColor="brand.secondary"
                value={deckChoice}
                onChange={(e) => setDeckChoice(e.target.value)}
              >
                {invitedDeckId && !remoteDeckFailed && (
                  <option value={CHOICE_REMOTE}>
                    Host&apos;s pick: {remoteDeckName}
                  </option>
                )}
                {decks?.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </Select>
            ) : remoteDeckFailed ? (
              <Text mt={2} fontSize="0.9rem" color="tomato">
                Couldn&apos;t download a deck — check your connection and try
                again, or grab one from{" "}
                <Link href="/bag" style={{ textDecoration: "underline" }}>
                  your bag
                </Link>
                .
              </Text>
            ) : (
              <Text mt={2} fontSize="0.9rem" color="brand.secondary">
                {invitedDeckId ? (
                  <>Your host picked a deck for you: </>
                ) : (
                  <>You&apos;ll play a community favorite: </>
                )}
                <Text as="span" fontWeight={700}>
                  {remoteDeckName}
                </Text>
              </Text>
            )}
          </Box>

          <Button
            w="100%"
            size="lg"
            bg="brand.secondary"
            color="brand.primary"
            _hover={{ bg: "brand.surfaceDim" }}
            _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
            isDisabled={joining || !deckReady}
            onClick={handleJoin}
          >
            {(joining || !deckReady) && <Spinner size="sm" mr={2} />}
            {joining
              ? "Joining…"
              : deckReady
                ? "Jump into the game"
                : "Fetching your deck…"}
          </Button>

          <Text fontSize="0.8rem" color="brand.secondary" opacity={0.7}>
            No account, nothing to install — you play right in the browser.
          </Text>
        </VStack>
      </JoinContainer>

      <Flex
        position="absolute"
        bottom="0.75rem"
        alignItems="center"
        gap={2}
        color="ghostwhite"
        bg="blackAlpha.400"
        borderRadius="full"
        px={3}
        py={1}
        fontSize="0.8rem"
      >
        <Text>GameServer:</Text>
        <Tag size="sm" bg="brand.secondary" color="brand.primary">
          {targetServer === DEFAULT_SERVER ? "default" : targetServer}
        </Tag>
      </Flex>
    </Wrapper>
  );
};

const FieldLabel = (props: { children: React.ReactNode }) => (
  <Text
    fontFamily="SpaceGrotesk"
    fontWeight={600}
    color="brand.secondary"
    fontSize="0.95rem"
  >
    {props.children}
  </Text>
);

const Title = (props: { children: React.ReactNode }) => (
  <Text
    fontSize={"2.5rem"}
    fontWeight={700}
    fontFamily="SpaceGrotesk"
    color="brand.secondary"
    lineHeight="1.1"
  >
    {props.children}
  </Text>
);

const Wrapper = styled(Flex)`
  height: 100svh;
  background-color: slategray;
  background-position: center;
  background-size: cover;
  justify-content: center;
  align-items: center;
`;

const JoinContainer = styled(Flex)`
  flex-direction: column;
  width: 95%;
  max-width: 520px;
  background-color: rgba(241, 224, 193, 0.92);
  border-radius: 1rem;
  padding: 2.5rem 2rem;
  gap: 1.75rem;
  justify-content: flex-start;
  align-items: center;
  box-shadow: 0 12px 40px rgba(44, 24, 49, 0.45);
`;
