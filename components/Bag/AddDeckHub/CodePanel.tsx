import { Box, Button, Flex, HStack, Input, Link, Text } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { DECK_ID } from "@/lib/constants/unmatched-deckids";
import { useUnmatchedDeck } from "@/lib/hooks/useUnmatchedDeck";
import { DeckCards } from "@/components/Bag/Deck/DeckCards";
import { useReplaceConfirm } from "@/components/Bag/ReplaceDeckConfirm";
import { BagDeckView } from "@/lib/bag/useBag";

/**
 * Paste a deck code from unmatched.cards, preview the fetched deck, then
 * save it to the bag. Rendered bare inside AddDeckHub's focused view.
 */
export const CodePanel = ({
  pushDeck,
  setStar,
  onAdded,
}: {
  pushDeck: BagDeckView["pushDeck"];
  setStar: (id: string) => void;
  onAdded?: (deckId: string) => void;
}) => {
  const { data, isLoading, setDeckId } = useUnmatchedDeck();
  const { confirmReplace, asking, prompt } = useReplaceConfirm();

  const save = async () => {
    if (!data) return;
    // storage full, or the player kept their edited copy — already toasted
    if (!(await pushDeck(data, { confirmReplace }))) return;
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
              isDisabled={asking}
              onClick={save}
            >
              ★ Save &amp; use “{data.name}”
            </Button>
            <Button variant="ghost" onClick={() => setDeckId(undefined)}>
              Clear
            </Button>
          </HStack>
          {prompt}
          <DeckCards decks={[data]} selectedDeckId={data.id} />
        </Box>
      )}
    </Flex>
  );
};
