import {
  Box,
  Button,
  Flex,
  FormLabel,
  Image,
  Link,
  ListItem,
  Select,
  Text,
  UnorderedList,
  VStack,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import { Navbar } from "@/components/Navbar";
import { SelectedDeckContainer } from "@/components/Connect/SelectedDeck";
import { DeckLinkHold } from "@/components/DeckLink/DeckLinkHold";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useBagDecks, useBagMaps } from "@/lib/bag/useBag";
import { useDeckLink } from "@/lib/hooks/useDeckLink";
import { labsMapOfDeck } from "@/lib/labs/labsMap";
import { composeTable } from "@/lib/tableplace";
import { buildMapList } from "@/lib/tableplace/mapList";
import {
  createLobby,
  EMPTY_LOBBY_REAP_MINUTES,
  isOurBug,
  LOBBY_TTL_SECONDS,
  retryCopy,
  validateLobby,
  type LobbyCreated,
  type TablePlaceError,
} from "@/lib/tableplace/api";
import { plainSkipped, previewDeck } from "@/lib/tableplace/preview";
import { DeckPreviewCard } from "./DeckPreviewCard";
import { OpponentPicker } from "./OpponentPicker";
import { InviteScreen } from "./InviteScreen";
import { useImageSize } from "./useImageSize";
import { useOpponentDeck } from "./useOpponentDeck";

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
    <Text
      as="h2"
      id={`step-${n}`}
      fontFamily="SpaceGrotesk"
      fontWeight={700}
      fontSize="1.15rem"
    >
      {n}. {title}
    </Text>
    <Box mt="0.5rem">{children}</Box>
  </Box>
);

export const TablePage = () => {
  const { query, isReady } = useRouter();
  const deckId = query.deckId as string | undefined;

  // Your deck: the bag's starred deck, and `?deckId=` stars it like /irl does.
  const { decks, starredDeck, setStar, isLoading } = useBagDecks();
  const link = useDeckLink(deckId, { ready: isReady, waitForWholeBag: true });

  const opponent = useOpponentDeck();

  const { data: bagMaps } = useBagMaps();
  const maps = useMemo(() => buildMapList(bagMaps), [bagMaps]);
  // Undefined until the player picks: until then, a Labs deck's own map.
  const [pickedMapUrl, setMapUrl] = useState<string>();
  const deckMap = useMemo(
    () => labsMapOfDeck(starredDeck, maps),
    [starredDeck, maps],
  );
  const mapUrl = pickedMapUrl ?? deckMap?.imgUrl ?? "";
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
      map: { imageUrl: map.imgUrl, ...mapSize.size },
      ...(map.layout ? { mapDef: map.layout } : {}),
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
  // The last table's links outlive "Make another table": a friend may not have
  // opened theirs yet.
  const [lastLobby, setLastLobby] = useState<LobbyCreated>();
  // A different table has different problems: don't leave the last one up.
  // Keyed on values, not on `composed.body`, whose identity can change on
  // any render that hands us an equal-but-new object.
  const tableKey = [
    starredDeck?.id,
    opponent.deck?.id,
    map?.imgUrl,
    mapSize.size?.width,
    mapSize.size?.height,
  ].join("|");
  useEffect(() => setApiError(undefined), [tableKey]);

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

  const refusedDeck = !!(yours?.refused || theirs?.refused);
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
              setLastLobby(lobby);
              setLobby(undefined);
              setApiError(undefined);
            }}
          />
        ) : (
          <>
            {lastLobby && (
              <Box
                p="0.75rem"
                bg="white"
                borderRadius="0.5rem"
                fontSize="0.9rem"
                data-testid="last-table"
              >
                <Text as="h2" fontWeight={700}>
                  Your last table
                </Text>
                <Text>
                  Its seat links still work until it closes:{" "}
                  {lastLobby.seats.map((s, i) => (
                    <span key={s.seat}>
                      {i > 0 && ", "}
                      <Link href={s.url} isExternal textDecor="underline">
                        seat {s.seat + 1}
                      </Link>
                    </span>
                  ))}
                  {lastLobby.seats.length === 0 && (
                    <Link
                      href={lastLobby.lobby_url}
                      isExternal
                      textDecor="underline"
                    >
                      open the lobby
                    </Link>
                  )}
                  .
                </Text>
              </Box>
            )}

            <Box>
              <Text
                as="h1"
                fontFamily="SpaceGrotesk"
                fontWeight={700}
                fontSize="2rem"
              >
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
              <OpponentPicker decks={decks} opponent={opponent} />
            </Step>

            <Step n={3} title="Map">
              <FormLabel htmlFor="table-map" srOnly>
                Map
              </FormLabel>
              <Select
                id="table-map"
                bg="white"
                placeholder="Choose a map"
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                data-testid="map"
              >
                {maps.map((m) => (
                  <option key={m.imgUrl} value={m.imgUrl}>
                    {m.label}
                  </option>
                ))}
              </Select>
              {map && map === deckMap && (
                <Text mt="0.25rem" fontSize="0.85rem" opacity={0.8}>
                  This deck&apos;s map
                </Text>
              )}
              {map?.labsSlug && !map.layout && (
                <Text
                  mt="0.25rem"
                  fontSize="0.85rem"
                  data-testid="map-no-layout"
                >
                  This map came from Unmatched Labs before we kept its spaces,
                  so figures won&apos;t snap to them. Import the set again from
                  Labs to get snapping spaces.
                </Text>
              )}
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
                <Text mt="0.5rem" color="red.700" role="alert">
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
              {refusedDeck && (
                <Text
                  mt="0.5rem"
                  fontSize="0.85rem"
                  data-testid="refused-reason"
                >
                  One deck can&apos;t go on the table yet (see above).
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
                  role="alert"
                  data-testid="api-error"
                >
                  {isOurBug(apiError) ? (
                    <>
                      <Text fontWeight={600}>
                        We couldn&apos;t lay out this table. That&apos;s a bug
                        on our side.
                      </Text>
                      <Box as="details" mt="0.25rem" fontSize="0.85rem">
                        <summary>Details</summary>
                        <Text>{apiError.message}</Text>
                      </Box>
                      <Text mt="0.25rem" fontSize="0.85rem">
                        <Link
                          href="https://github.com/JollyGrin/unbrewed-p2p/issues/new"
                          isExternal
                          textDecor="underline"
                        >
                          Report it on GitHub
                        </Link>{" "}
                        or on{" "}
                        <Link
                          href="https://discord.gg/qPxHFjwkNN"
                          isExternal
                          textDecor="underline"
                        >
                          Discord
                        </Link>
                        .
                      </Text>
                    </>
                  ) : (
                    <Text fontWeight={600}>{apiError.message}</Text>
                  )}
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
