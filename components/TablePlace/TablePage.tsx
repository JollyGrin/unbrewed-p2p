import {
  Box,
  Button,
  Flex,
  Link,
  ListItem,
  Text,
  UnorderedList,
  VStack,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import { Navbar } from "@/components/Navbar";
import { DeckLinkHold } from "@/components/DeckLink/DeckLinkHold";
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
import { plainSkipped, previewOf } from "@/lib/tableplace/preview";
import { DeckGallery } from "./DeckGallery";
import { DeckPreviewCard } from "./DeckPreviewCard";
import { focusRing, SHORT_SCREEN, type TableTab } from "./galleryParts";
import { InviteScreen } from "./InviteScreen";
import { MapGallery } from "./MapGallery";
import { OpponentPaste } from "./OpponentPaste";
import { TableRail } from "./TableRail";
import { useImageSize } from "./useImageSize";
import { useOpponentDeck } from "./useOpponentDeck";

type Status = "idle" | "validating" | "creating";

const TABS: { id: TableTab; label: string }[] = [
  { id: "you", label: "Your deck" },
  { id: "them", label: "Their deck" },
  { id: "map", label: "Map" },
];

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

  // Which decks can go on a table. The bag hands back a new array on every
  // render, so the work is kept per deck (`previewOf`), not per array.
  const entries = useMemo(
    () => decks?.map((deck) => ({ deck, preview: previewOf(deck) })),
    [decks],
  );
  const yours = starredDeck && previewOf(starredDeck);
  const theirs = opponent.deck && previewOf(opponent.deck);

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
  // What the layout left off, beyond each deck's own list
  const layoutSkipped = (composed?.skipped ?? [])
    .filter((s) => !/no finished face$/.test(s))
    .map(plainSkipped);
  const leftOff =
    (yours?.skipped.length ?? 0) +
    (theirs?.skipped.length ?? 0) +
    layoutSkipped.length;

  // The gallery on show: the rail's slots and the tabs both pick it.
  const [tab, setTab] = useState<TableTab>("you");
  const stripRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const showTab = (next: TableTab) => {
    if (next === tab) return;
    setTab(next);
    if (galleryRef.current) galleryRef.current.scrollTop = 0;
  };
  /** After a pick: on to the next empty slot, with its gallery's top in view. */
  const advance = (next: TableTab) => {
    if (next === tab) return;
    showTab(next);
    const strip = stripRef.current;
    if (strip && strip.getBoundingClientRect().top < 0) {
      strip.scrollIntoView?.({ block: "start" });
    }
  };
  const pickYours = (id: string) => {
    setStar(id);
    advance(!opponent.deck ? "them" : !map ? "map" : "you");
  };
  const pickTheirs = (id: string) => {
    opponent.pickBag(id, decks ?? []);
    advance(!map ? "map" : "them");
  };

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
  const picked: Record<TableTab, string | undefined> = {
    you: yours?.deckName,
    them: theirs?.deckName,
    map: map?.label,
  };

  if (lobby) {
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
          <InviteScreen
            lobby={lobby}
            onReset={() => {
              setLastLobby(lobby);
              setLobby(undefined);
              setApiError(undefined);
            }}
          />
        </VStack>
      </Flex>
    );
  }

  return (
    <Flex
      flexDir="column"
      bg="brand.highlight"
      color="brand.secondary"
      fontFamily="SpaceGrotesk"
      minH="100svh"
      // From `lg` the page is one screen: the rail stays put, the gallery scrolls.
      h={{ lg: "100svh" }}
    >
      <Box flexShrink={0}>
        <Navbar />
      </Box>
      <Flex
        flex="1"
        minH={0}
        w="100%"
        maxW="1360px"
        mx="auto"
        flexDir={{ base: "column", lg: "row" }}
        gap={{ base: "16px", lg: "28px" }}
        px={{ base: "16px", lg: "32px" }}
        // below `lg`, room for the pinned Create bar
        pb={{ base: "140px", lg: "32px" }}
        sx={{ [SHORT_SCREEN]: { paddingBottom: "16px" } }}
      >
        {/* The rail. Below `lg` its parts join the page's one column, so the
            gallery can sit between the strip and the disclosure. */}
        <Flex
          display={{ base: "contents", lg: "flex" }}
          flexDir="column"
          gap="14px"
          w="372px"
          flexShrink={0}
          minH={0}
        >
          <Flex
            display={{ base: "contents", lg: "flex" }}
            flexDir="column"
            gap="14px"
            flex="1"
            minH={0}
            overflowY="auto"
            // room for focus rings the scroll box would clip
            p="3px"
            m="-3px"
          >
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

            <Flex flexDir="column" gap="6px">
              <Text
                as="h1"
                fontWeight={700}
                fontSize={{ base: "26px", lg: "30px" }}
                lineHeight={1.1}
              >
                Set up a 3D table
              </Text>
              {/* Below `lg` the first screen goes to the gallery's tiles. */}
              <Text
                display={{ base: "none", lg: "block" }}
                fontSize="14px"
                lineHeight={1.45}
                data-testid="intro"
              >
                Pick both decks and a map, and we&apos;ll lay out a table on
                table.place for you and a friend.
              </Text>
            </Flex>

            <TableRail
              ref={stripRef}
              flexShrink={0}
              tab={tab}
              onTab={showTab}
              your={{
                deck: starredDeck,
                preview: yours,
                state:
                  starredDeck !== undefined
                    ? undefined
                    : isLoading
                      ? "loading"
                      : link.failed
                        ? "failed"
                        : undefined,
              }}
              their={{
                deck: opponent.deck,
                preview: theirs,
                state: opponent.loading ? "loading" : undefined,
              }}
              map={map}
              mapCount={maps.length}
              mapFailed={mapSize.failed}
            />

            <Box
              as="details"
              order={{ base: 2, lg: 0 }}
              flexShrink={0}
              fontSize="14px"
              data-testid="table-contents"
            >
              <Text as="summary" cursor="pointer" fontWeight={600} py="12px">
                What goes on the table
                {leftOff > 0 &&
                  ` · ${leftOff} ${leftOff === 1 ? "thing stays" : "things stay"} off the table`}
              </Text>
              {!yours && !theirs ? (
                <Text opacity={0.8}>Pick both decks to see them here.</Text>
              ) : (
                <VStack spacing="0.75rem" align="stretch">
                  {yours && (
                    <DeckPreviewCard title="Your deck" preview={yours} />
                  )}
                  {theirs && (
                    <DeckPreviewCard title="Their deck" preview={theirs} />
                  )}
                  {layoutSkipped.length > 0 && (
                    <UnorderedList fontSize="0.85rem">
                      {layoutSkipped.map((s) => (
                        <ListItem key={s}>{s}</ListItem>
                      ))}
                    </UnorderedList>
                  )}
                </VStack>
              )}
            </Box>
          </Flex>

          {/* Below `lg` this is a bar pinned to the bottom of the screen,
              with the status line above the button. */}
          <Flex
            flexDir="column"
            gap="8px"
            flexShrink={0}
            position={{ base: "fixed", lg: "static" }}
            bottom={0}
            left={0}
            right={0}
            zIndex={{ base: 20, lg: "auto" }}
            p={{
              base: "12px 16px calc(12px + env(safe-area-inset-bottom))",
              lg: 0,
            }}
            bg={{ base: "brand.surface", lg: "transparent" }}
            color={{ base: "brand.highlight", lg: "inherit" }}
            boxShadow={{ base: "0 -4px 16px rgba(44,24,49,0.35)", lg: "none" }}
            data-testid="create-bar"
          >
            <Button
              order={{ base: 2, lg: 0 }}
              w="100%"
              h="52px"
              flexShrink={0}
              borderRadius="10px"
              bg="brand.accent"
              color="brand.surfaceDim"
              fontSize="17px"
              fontWeight={700}
              _hover={{
                bg: "brand.accentDeep",
                _disabled: { bg: "brand.accent" },
              }}
              _focusVisible={focusRing}
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
            {missing.length > 0 ? (
              <Text
                order={{ base: 1, lg: 0 }}
                fontSize="14px"
                fontWeight={600}
                data-testid="status"
              >
                Still needed: {missing.join(", ")}.
              </Text>
            ) : (
              !refusedDeck &&
              !mapSize.failed && (
                <Text
                  order={{ base: 1, lg: 0 }}
                  fontSize="14px"
                  fontWeight={600}
                  data-testid="status"
                >
                  Ready: {picked.you} vs {picked.them} on {picked.map}.
                </Text>
              )
            )}
            {refusedDeck && (
              <Text
                order={{ base: 1, lg: 0 }}
                fontSize="14px"
                fontWeight={600}
                data-testid="refused-reason"
              >
                One deck can&apos;t go on the table yet (see above).
              </Text>
            )}
            {/* Not in the pinned bar: it holds the status and the button. */}
            <Text
              display={{ base: "none", lg: "block" }}
              fontSize="13px"
              lineHeight={1.4}
              data-testid="closes-note"
            >
              Create it when you&apos;re both ready: a table nobody opens closes
              after {EMPTY_LOBBY_REAP_MINUTES} minutes.
            </Text>
            {apiError && (
              <Box
                p="0.75rem"
                bg="red.50"
                color="red.800"
                borderRadius="0.5rem"
                maxH={{ base: "40svh", lg: "none" }}
                overflowY="auto"
                role="alert"
                data-testid="api-error"
              >
                {isOurBug(apiError) ? (
                  <>
                    <Text fontWeight={600}>
                      We couldn&apos;t lay out this table. That&apos;s a bug on
                      our side.
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
          </Flex>
        </Flex>

        <Flex
          order={{ base: 1, lg: 0 }}
          flex="1"
          minW={0}
          minH={0}
          flexDir="column"
          bg={{ lg: "brand.parchment" }}
          border={{ lg: "1px solid" }}
          borderColor={{ lg: "brand.primary" }}
          borderRadius={{ lg: "18px" }}
          overflow={{ lg: "hidden" }}
        >
          {/* Below `lg` the strip above is the tab control. */}
          <Box
            role="tablist"
            aria-label="What to pick"
            display={{ base: "none", lg: "grid" }}
            gridTemplateColumns="repeat(3, minmax(0, 1fr))"
            gap="8px"
            p="10px"
            flexShrink={0}
            bg="brand.highlight"
            borderBottom="1px solid"
            borderColor="brand.primary"
          >
            {TABS.map(({ id, label }, i) => (
              <Flex
                key={id}
                as="button"
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls="table-gallery"
                onClick={() => showTab(id)}
                align="center"
                gap="12px"
                minW={0}
                minH="56px"
                p="8px 14px"
                borderRadius="10px"
                textAlign="left"
                bg={tab === id ? "brand.secondary" : "transparent"}
                color={tab === id ? "brand.highlight" : "brand.secondary"}
                _focusVisible={focusRing}
                data-testid={`tab-${id}`}
              >
                <Box
                  as="span"
                  fontFamily="BebasNeueRegular"
                  fontSize="32px"
                  lineHeight={1}
                >
                  {i + 1}
                </Box>
                <Flex as="span" flexDir="column" minW={0}>
                  <Box as="span" fontSize="15px" fontWeight={700}>
                    {label}
                  </Box>
                  <Text as="span" fontSize="13px" noOfLines={1}>
                    {picked[id] ?? "Not picked yet"}
                  </Text>
                </Flex>
              </Flex>
            ))}
          </Box>

          <Box
            ref={galleryRef}
            id="table-gallery"
            role="tabpanel"
            aria-label={TABS.find((t) => t.id === tab)?.label}
            flex="1"
            minH={0}
            overflowY={{ lg: "auto" }}
            p={{ lg: "18px 24px 24px" }}
          >
            {tab === "map" ? (
              <MapGallery
                maps={maps}
                selectedUrl={mapUrl}
                deckMapUrl={deckMap?.imgUrl}
                onPick={setMapUrl}
              />
            ) : tab === "you" && link.held && !link.held.refresh ? (
              <DeckLinkHold link={link} />
            ) : (
              <DeckGallery
                seat={tab}
                // an empty list while the account half loads isn't an empty bag
                entries={isLoading && !entries?.length ? undefined : entries}
                yourId={starredDeck?.id}
                theirId={opponent.deck?.id}
                onPick={tab === "you" ? pickYours : pickTheirs}
              >
                {tab === "them" && <OpponentPaste opponent={opponent} />}
              </DeckGallery>
            )}
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
};
