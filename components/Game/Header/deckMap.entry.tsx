import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useBagMaps } from "@/lib/bag/useBag";
import { fetchLabsSet } from "@/lib/labs/fetch";
import { LabsMapOffer, addLabsMap, labsMapOffer } from "@/lib/labs/labsMap";
import { isLabsDeckId, parseLabsInput } from "@/lib/labs/parse";
import { Box, Button, Flex, Image, Text } from "@chakra-ui/react";
import { useState } from "react";

type Lookup =
  | { status: "idle" | "loading" | "none" }
  | { status: "ready"; offer: LabsMapOffer };

/** The Labs input a deck was imported from, or undefined for any other deck. */
const labsSourceOf = (deck: DeckImportType | undefined) =>
  deck && isLabsDeckId(deck.id) && deck.sourceUrl
    ? parseLabsInput(deck.sourceUrl) ?? undefined
    : undefined;

/**
 * "This deck's map" (#1028): shown above the gallery when the player's deck
 * came from Unmatched Labs. Nothing is fetched until the player presses it,
 * and the answer is kept, so pressing again never fetches again.
 */
export const DeckMapEntry = (props: {
  deck: DeckImportType | undefined;
  /** Sets the room's map, the same way every other entry does. */
  onUse: (imgUrl: string) => void;
}) => {
  const bagMaps = useBagMaps();
  const localMaps = bagMaps.data;
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [open, setOpen] = useState(false);
  const source = labsSourceOf(props.deck);
  if (!props.deck || !source) return null;

  const setName = props.deck.note?.match(/from Unmatched Labs — "(.*?)"/)?.[1];

  const press = async () => {
    setOpen((prev) => !prev);
    if (lookup.status !== "idle") return;
    setLookup({ status: "loading" });
    try {
      const loaded = await fetchLabsSet(source);
      const offer = labsMapOffer(loaded, props.deck!);
      setLookup(offer ? { status: "ready", offer } : { status: "none" });
    } catch {
      setLookup({ status: "none" });
    }
  };

  const offer = lookup.status === "ready" ? lookup.offer : undefined;
  const saved = !!offer && localMaps.some((m) => m.imgUrl === offer.map.imgUrl);

  return (
    <Box mb="1rem" p="0.6rem" borderRadius="0.5rem" bg="rgba(255,255,255,0.35)">
      <Button
        size="sm"
        variant="ghost"
        fontFamily="SpaceGrotesk"
        aria-expanded={open}
        onClick={press}
      >
        This deck&apos;s map{setName ? ` — ${setName}` : ""}
      </Button>
      {open && lookup.status === "loading" && (
        <Text fontSize="0.85rem" opacity={0.7} pl="0.75rem">
          Looking for the map…
        </Text>
      )}
      {open && lookup.status === "none" && (
        <Text fontSize="0.85rem" pl="0.75rem">
          This set has no map to bring in
        </Text>
      )}
      {open && offer && (
        <Flex gap="0.75rem" align="center" pl="0.75rem" flexWrap="wrap">
          <Image
            alt={`${offer.name} preview`}
            src={offer.map.imgUrl}
            w="7rem"
            h="5rem"
            objectFit="cover"
            borderRadius="0.35rem"
          />
          <Box>
            <Text fontWeight={700}>{offer.name}</Text>
            {saved && (
              <Text fontSize="0.8rem" opacity={0.8}>
                Saved in your maps
              </Text>
            )}
          </Box>
          <Flex gap="0.5rem" ml="auto">
            {!saved && (
              <Button size="sm" variant="outline" onClick={() => addLabsMap(offer.map, bagMaps)}>
                Save to my maps
              </Button>
            )}
            <Button
              size="sm"
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              onClick={() => props.onUse(offer.map.imgUrl)}
            >
              Use for this room
            </Button>
          </Flex>
        </Flex>
      )}
    </Box>
  );
};
