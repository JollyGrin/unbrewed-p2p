import { useRef, useState } from "react";
import { useRouter } from "next/router";
import { Box, Flex, Grid, Spinner, Text } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { useBagDecks, useBagMaps } from "@/lib/bag/useBag";
import { useAccount } from "@/lib/account/useAccount";
import { useStorageBreakdown } from "@/lib/storage/breakdown";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { shareUrl } from "@/lib/account/bagCloud";
import { track } from "@/lib/analytics";
import { knownAddSource } from "@/lib/deckAnalytics";
import { MapData } from "@/lib/hooks/useLocalStorage";
import { AddDeckHub } from "@/components/Bag/AddDeckHub";
import { MapModal } from "@/components/Bag/Map/MapModal";
import DEFAULT_MAPS from "@/components/Bag/Map/MapModal/defaultMaps.json";
import { DeckStats } from "./Stats";
import { DangerConfirm } from "./DangerConfirm";
import { DeckDetail } from "./DeckDetail";
import { AddTile, DeckTile, UpNextCard } from "./UpNext";

/** The board every table falls back to (lib/maps/defaultMap.ts). */
const DEFAULT_MAP_TITLE = "The Mended Drum";

/**
 * The Decks tab (#1538): the paste bar on top, then "Your bag" — the starred
 * deck as one wide Up next card with the table buttons, every other deck as
 * a tile that becomes Up next when tapped. "Edit deck" swaps the whole
 * panel for the deck's detail screen, which has its own way back (#816's
 * list/detail swap, now on every breakpoint).
 */
export const BagDecks = () => {
  const {
    decks,
    pushDeck,
    removeDeckbyId,
    updateDeck,
    setStar,
    star,
    isLoading,
    sourceOf,
    cloudIdOf,
    clearDecks,
    clearStar,
  } = useBagDecks();
  const { data: bagMaps } = useBagMaps();
  const storage = useStorageBreakdown();
  const account = useAccount();
  const { query, push } = useRouter();
  const [, copy] = useCopyToClipboard();

  const [editingId, setEditingId] = useState<string>();
  const editing = decks?.find((deck) => deck.id === editingId);
  const pasteRef = useRef<HTMLInputElement>(null);

  const count = decks?.length ?? 0;
  const upNext = decks?.find((deck) => deck.id === star);
  // Every deck keeps its place in the grid, the starred one included (it is
  // highlighted there and shown above as Up next): starring must never
  // reflow the tiles under the player's thumb.
  const tiles = decks ?? [];

  // The map a table opened from here will use: the one picked in the modal
  // (`?mapUrl=`), else the default board.
  const mapUrl = typeof query.mapUrl === "string" ? query.mapUrl : undefined;
  const pickedMap = mapUrl
    ? [...bagMaps, ...(DEFAULT_MAPS as MapData[])].find((map) => map.imgUrl === mapUrl)
    : undefined;
  const mapTitle = pickedMap?.meta?.title ?? (mapUrl ? "custom map" : DEFAULT_MAP_TITLE);
  const changeMap = () => push({ query: { ...query, editMapUrl: true } });

  const focusPaste = () => {
    pasteRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    pasteRef.current?.focus();
  };

  const toss = (id: string) => {
    const deck = decks?.find((d) => d.id === id);
    setEditingId(undefined);
    removeDeckbyId(id);
    // Tossing the Up next deck: the star moves to the next deck, so the page
    // keeps its table buttons and never points at a deck that is gone.
    if (id === star) {
      const next = decks?.find((d) => d.id !== id);
      if (next) setStar(next.id);
      else clearStar();
    }
    track("deck_removed", { source: knownAddSource(deck) });
    toast.success(`Tossed ${deck?.name} from your bag`);
  };

  const clearAll = async () => {
    setEditingId(undefined);
    await clearDecks();
    toast.success("Cleared your bag");
  };

  const makeUpNext = (id: string) => {
    if (id === star) return;
    setStar(id);
    const deck = decks?.find((d) => d.id === id);
    toast.success(`${deck?.name} is up next`, { id: "bag-up-next" });
  };

  return (
    /* One scroll container: the stats bar scrolls away, every pane flows at
       its natural height, no nested scroll boxes. */
    <Flex direction="column" h="100%" minH={0} overflowY="auto" bg="brand.highlight">
      {!editing && (
        <DeckStats length={count} storage={storage} isSignedIn={account.status === "signed-in"} />
      )}

      {editing ? (
        <DeckDetail
          deck={editing}
          onBack={() => setEditingId(undefined)}
          updateDeck={updateDeck}
          onToss={() => toss(editing.id)}
          cloudId={cloudIdOf(editing.id)}
        />
      ) : (
        <>
          <Box px={{ base: "1rem", md: "1.5rem" }} pt={{ base: "1rem", md: "1.5rem" }} pb="0.5rem">
            <AddDeckHub
              deckIds={decks?.map((deck) => deck.id)}
              pushDeck={pushDeck}
              setStar={setStar}
              star={star}
              onDeckAdded={() => undefined}
              inputRef={pasteRef}
            />
          </Box>

          <Box
            as="section"
            aria-label="Your bag"
            px={{ base: "1rem", md: "1.5rem" }}
            pt="1rem"
            pb={{ base: "1.5rem", md: "2rem" }}
            maxW="920px"
            w="100%"
            mx="auto"
            color="brand.secondary"
          >
            <Flex align="baseline" gap="0.6rem" mb="0.75rem" flexWrap="wrap">
              <Text
                as="h2"
                fontFamily="BebasNeueRegular"
                fontSize="1.6rem"
                letterSpacing="0.04em"
                lineHeight={1}
              >
                Your bag
              </Text>
              <Text fontSize="0.8rem" opacity={0.7}>
                {count} {count === 1 ? "deck" : "decks"} · 🎒
              </Text>
              {tiles.length > 1 && (
                <Text fontSize="0.8rem" opacity={0.7} ml={{ md: "auto" }}>
                  Tap a deck to make it up next
                </Text>
              )}
            </Flex>

            {isLoading && count === 0 ? (
              /*
                An account bag arrives one round trip after mount. Showing the
                empty state in the meantime would tell a signed-in player their
                decks are gone, so wait instead of flashing (#644).
              */
              <Flex align="center" gap="0.5rem" p="1.5rem 0" opacity={0.8}>
                <Spinner size="sm" color="brand.secondary" />
                <Text fontSize="0.85rem">Loading your bag…</Text>
              </Flex>
            ) : count === 0 ? (
              <Text fontSize="0.9rem" opacity={0.8} p="0.5rem 0">
                Your bag is empty. Paste a deck above, or browse the popular decks.
              </Text>
            ) : (
              <>
                {upNext && (
                  <UpNextCard
                    deck={upNext}
                    bagSource={sourceOf(upNext.id)}
                    mapTitle={mapTitle}
                    onChangeMap={changeMap}
                    onEdit={() => setEditingId(upNext.id)}
                    onShare={
                      cloudIdOf(upNext.id)
                        ? () => {
                            copy(shareUrl("decks", cloudIdOf(upNext.id)!));
                            toast.success("Share link copied");
                          }
                        : undefined
                    }
                    onToss={() => toss(upNext.id)}
                  />
                )}
                <Grid
                  templateColumns={{
                    base: "repeat(3, minmax(0, 1fr))",
                    md: "repeat(6, minmax(0, 1fr))",
                  }}
                  gap={{ base: "0.4rem", md: "0.6rem" }}
                  mt="0.75rem"
                >
                  {tiles.map((deck) => (
                    <DeckTile
                      key={deck.id + deck.version_id}
                      deck={deck}
                      bagSource={sourceOf(deck.id)}
                      starred={deck.id === upNext?.id}
                      onSelect={makeUpNext}
                    />
                  ))}
                  <AddTile onClick={focusPaste} />
                </Grid>
                <Flex justify="flex-end" mt="1rem" opacity={0.75} _hover={{ opacity: 1 }}>
                  <DangerConfirm
                    label="Clear bag"
                    question={`Toss all ${count} ${count === 1 ? "deck" : "decks"}?`}
                    confirmLabel={`Clear all ${count}`}
                    onConfirm={() => void clearAll()}
                    size="xs"
                  />
                </Flex>
              </>
            )}
          </Box>
        </>
      )}
      <MapModal />
    </Flex>
  );
};
