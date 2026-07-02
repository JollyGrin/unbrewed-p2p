import { Box, Button, Flex, HStack, Input, Link, Text } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { DECK_ID } from "@/lib/constants/unmatched-deckids";
import { useUnmatchedDeck } from "@/lib/hooks/useUnmatchedDeck";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DeckCards } from "@/components/Bag/Deck/DeckCards";

/**
 * Paste a deck code from unmatched.cards, preview the fetched deck, then
 * save it to the bag. Rendered bare inside AddDeckHub's focused view.
 */
export const CodePanel = ({
  pushDeck,
  setStar,
  onAdded,
}: {
  pushDeck: (deck: DeckImportType) => void;
  setStar: (id: string) => void;
  onAdded?: (deckId: string) => void;
}) => {
  const { data, isLoading, setDeckId } = useUnmatchedDeck();

  const save = () => {
    if (!data) return;
    pushDeck(data);
    setStar(data.id);
    toast.success(`${data.name} saved & ready to play`);
    setDeckId(undefined);
    onAdded?.(data.id);
  };

  return (
    <Flex direction="column" color="brand.secondary">
      <Text fontSize="0.9rem" opacity={0.85} mb="0.75rem">
        Open a deck on{" "}
        <Link href="https://unmatched.cards/decks" isExternal textDecoration="underline">
          unmatched.cards
        </Link>{" "}
        and copy the code — the part after <code>/decks/</code> in the URL —
        then paste it here.
      </Text>

      <Text fontWeight={700} fontSize="0.85rem">
        Deck code
      </Text>
      <Input
        bg="white"
        maxW="260px"
        my="0.4rem"
        fontFamily="monospace"
        letterSpacing="2px"
        placeholder={"e.g. " + DECK_ID.THRALL}
        onChange={(e) => setDeckId(e.target.value)}
      />

      {isLoading && (
        <Text fontSize="0.85rem" opacity={0.7} mt="0.25rem">
          Fetching deck…
        </Text>
      )}

      {data && (
        <Box mt="0.75rem">
          <HStack mb="0.5rem">
            <Button
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              onClick={save}
            >
              ★ Save &amp; use “{data.name}”
            </Button>
            <Button variant="ghost" onClick={() => setDeckId(undefined)}>
              Clear
            </Button>
          </HStack>
          <DeckCards decks={[data]} selectedDeckId={data.id} />
        </Box>
      )}
    </Flex>
  );
};
