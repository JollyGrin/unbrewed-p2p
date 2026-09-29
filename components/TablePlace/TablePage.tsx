import {
  Box,
  Button,
  Flex,
  Image,
  Input,
  ListItem,
  Select,
  Text,
  UnorderedList,
  VStack,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { Navbar } from "@/components/Navbar";
import { SelectedDeckContainer } from "@/components/Connect/SelectedDeck";
import { DeckLinkHold } from "@/components/DeckLink/DeckLinkHold";
import defaultMaps from "@/components/Bag/Map/MapModal/defaultMaps.json";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import type { MapData } from "@/lib/hooks/useLocalStorage";
import { useBagDecks, useBagMaps } from "@/lib/bag/useBag";
import { useDeckLink } from "@/lib/hooks/useDeckLink";
import { fetchLinkedDeck } from "@/lib/deckLink";
import { absoluteUrl, composeTable } from "@/lib/tableplace";
import {
  createLobby,
  EMPTY_LOBBY_REAP_MINUTES,
  LOBBY_TTL_SECONDS,
  retryCopy,
  validateLobby,
  type LobbyCreated,
  type TablePlaceError,
} from "@/lib/tableplace/api";
import { opponentDeckLink } from "@/lib/tableplace/opponent";
import { plainSkipped, previewDeck } from "@/lib/tableplace/preview";
import { DeckPreviewCard } from "./DeckPreviewCard";
import { InviteScreen } from "./InviteScreen";
import { useImageSize } from "./useImageSize";

type Status = "idle" | "validating" | "creating";

const Step = ({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) => (
  <Box w="100%">
    <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.15rem">
      {n}. {title}
    </Text>
    <Box mt="0.5rem">{children}</Box>
  </Box>
);

const useOpponentDeck = () => {
  const [pasted, setPasted] = useState("");
  const [deck, setDeck] = useState<DeckImportType>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = async (fetcher: () => Promise<DeckImportType>) => {
    setLoading(true);
    setError(undefined);
    setDeck(undefined);
    try {
      setDeck(await fetcher());
    } catch {
      setError("Couldn't load that deck. Check the link and try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadPasted = () => {
    const link = opponentDeckLink(pasted);
    if (!link) {
      setDeck(undefined);
      setError(
        "That isn't a deck link. Paste an unmatched.cards or Unmatched Labs link, or a deck id.",
      );
      return;
    }
    load(() => fetchLinkedDeck(link).then((r) => r.deck));
  };

  return {
    pasted,
    setPasted,
    loadPasted,
    deck,
    loading,
    error,
  };
};

export const TablePage = () => {
  const { query, isReady } = useRouter();
  const deckId = query.deckId as string | undefined;

  // Your deck: the bag's starred deck, and `?deckId=` stars it like /irl does.
  const { decks, starredDeck, setStar, isLoading } = useBagDecks();
  const link = useDeckLink(deckId, { ready: isReady, waitForWholeBag: true });

  const opponent = useOpponentDeck();

  const { data: bagMaps } = useBagMaps();
  const maps: MapData[] = useMemo(() => {
    const seen = new Set<string>();
    return [...(bagMaps ?? []), ...(defaultMaps as MapData[])].filter((m) =>
      seen.has(m.imgUrl) ? false : (seen.add(m.imgUrl), true),
    );
  }, [bagMaps]);
  const [mapUrl, setMapUrl] = useState<string>("");
  const map = maps.find((m) => m.imgUrl === mapUrl);
  const mapSize = useImageSize(map?.imgUrl);

  const yours = useMemo(
    () => (starredDeck ? previewDeck(starredDeck) : undefined),
    [starredDeck],
  );
  const theirs = useMemo(
    () => (opponent.deck ? previewDeck(opponent.deck) : undefined),
    [opponent.deck],
  );

  const composed = useMemo(() => {
    if (!starredDeck || !opponent.deck || !map || !mapSize.size) return;
    if (yours?.refused || theirs?.refused) return;
    return composeTable({
      seats: [starredDeck, opponent.deck],
      faces: [() => null, () => null],
      map: { imageUrl: absoluteUrl(map.imgUrl), ...mapSize.size },
      ttlSeconds: LOBBY_TTL_SECONDS,
    });
  }, [starredDeck, opponent.deck, map, mapSize.size, yours, theirs]);
  // What the layout left off, beyond each deck's own list above
  const layoutSkipped = (composed?.skipped ?? [])
    .filter((s) => !/no finished face$/.test(s))
    .map(plainSkipped);

  const [status, setStatus] = useState<Status>("idle");
  const [apiError, setApiError] = useState<TablePlaceError>();
  const [lobby, setLobby] = useState<LobbyCreated>();

  const create = async () => {
    const body = composed?.body;
    if (!body) return;
    setApiError(undefined);
    // The dry run first: its errors cost nobody a slice of the shared cap.
    setStatus("validating");
    const dry = await validateLobby(body);
    if (!dry.ok) {
      setApiError(dry.error);
      setStatus("idle");
      return;
    }
    setStatus("creating");
    const real = await createLobby(body);
    setStatus("idle");
    if (!real.ok) return setApiError(real.error);
    setLobby(real.data);
  };

  const missing = [
    !starredDeck && "your deck",
    !opponent.deck && "their deck",
    !map && "a map",
  ].filter(Boolean);

  return (
    <Flex
      flexDir="column"
      bg="brand.highlight"
      color="brand.secondary"
      minH="100svh"
    >
      <Box>
        <Navbar />
      </Box>
      <VStack
        spacing="1.5rem"
        w="100%"
        maxW="40rem"
        mx="auto"
        px="16px"
        py="1.5rem"
        align="stretch"
      >
        {lobby ? (
          <InviteScreen
            lobby={lobby}
            onReset={() => {
              setLobby(undefined);
              setApiError(undefined);
            }}
          />
        ) : (
          <>
            <Box>
              <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="2rem">
                Set up a 3D table
              </Text>
              <Text opacity={0.8}>
                Pick both decks and a map, and we&apos;ll lay out a table on
                table.place for you and a friend.
              </Text>
            </Box>

            <Step n={1} title="Your deck">
              {link.held && !link.held.refresh ? (
                <DeckLinkHold link={link} />
              ) : (
                <SelectedDeckContainer
                  isLoading={isLoading}
                  error={link.failed}
                  starredDeck={starredDeck}
                  decks={decks}
                  setStar={setStar}
                />
              )}
            </Step>

            <Step n={2} title="Their deck">
              <Flex gap="0.5rem" alignItems="center" flexWrap="wrap">
                <Input
                  bg="white"
                  maxW="32rem"
                  placeholder="unmatched.cards or Unmatched Labs link, or a deck id"
                  value={opponent.pasted}
                  onChange={(e) => opponent.setPasted(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && opponent.loadPasted()}
                  data-testid="opponent-link"
                />
                <Button
                  onClick={opponent.loadPasted}
                  isLoading={opponent.loading}
                >
                  Load
                </Button>
              </Flex>
              <Text fontSize="0.8rem" opacity={0.7} mt="0.25rem">
                Picking a seat for a friend to fill is coming with open seats.
              </Text>
              {opponent.error && (
                <Text mt="0.5rem" color="red.700">
                  {opponent.error}
                </Text>
              )}
            </Step>

            <Step n={3} title="Map">
              <Select
                bg="white"
                placeholder="Choose a map"
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                data-testid="map"
              >
                {maps.map((m) => (
                  <option key={m.imgUrl} value={m.imgUrl}>
                    {m.meta?.title ?? m.imgUrl}
                  </option>
                ))}
              </Select>
              {map && (
                <Image
                  mt="0.5rem"
                  src={map.thumbUrl ?? map.imgUrl}
                  alt={map.meta?.title ?? "map"}
                  maxH="12rem"
                  borderRadius="0.5rem"
                />
              )}
              {mapSize.failed && (
                <Text mt="0.5rem" color="red.700">
                  Couldn&apos;t load this map&apos;s image. Pick another.
                </Text>
              )}
            </Step>

            <Step n={4} title="What goes on the table">
              {!yours && !theirs ? (
                <Text opacity={0.7}>Pick both decks to see them here.</Text>
              ) : (
                <VStack spacing="0.75rem">
                  {yours && (
                    <DeckPreviewCard title="Your deck" preview={yours} />
                  )}
                  {theirs && (
                    <DeckPreviewCard title="Their deck" preview={theirs} />
                  )}
                  {layoutSkipped.length > 0 && (
                    <UnorderedList fontSize="0.85rem" alignSelf="stretch">
                      {layoutSkipped.map((s) => (
                        <ListItem key={s}>{s}</ListItem>
                      ))}
                    </UnorderedList>
                  )}
                </VStack>
              )}
            </Step>

            <Box>
              <Button
                w="100%"
                size="lg"
                bg="brand.secondary"
                color="brand.highlight"
                _hover={{ opacity: 0.9 }}
                isDisabled={!composed?.body || status !== "idle"}
                isLoading={status !== "idle"}
                loadingText={
                  status === "validating" ? "Checking the table…" : "Creating…"
                }
                onClick={create}
                data-testid="create"
              >
                Create table
              </Button>
              {missing.length > 0 && (
                <Text mt="0.5rem" fontSize="0.85rem" opacity={0.7}>
                  Still needed: {missing.join(", ")}.
                </Text>
              )}
              <Text mt="0.5rem" fontSize="0.85rem" opacity={0.7}>
                Create it when you&apos;re both ready: a table nobody opens
                closes after {EMPTY_LOBBY_REAP_MINUTES} minutes.
              </Text>
              {apiError && (
                <Box
                  mt="0.75rem"
                  p="0.75rem"
                  bg="red.50"
                  color="red.800"
                  borderRadius="0.5rem"
                  data-testid="api-error"
                >
                  <Text fontWeight={600}>{apiError.message}</Text>
                  {retryCopy(apiError) && (
                    <Text mt="0.25rem">{retryCopy(apiError)}</Text>
                  )}
                </Box>
              )}
            </Box>
          </>
        )}
      </VStack>
    </Flex>
  );
};
