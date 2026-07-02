import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react";
import { useStarterDecks } from "./useStarterDecks";

/**
 * A handful of bundled, ready-to-play decks for people who don't have a
 * deck in mind yet. Rendered bare inside AddDeckHub's focused view.
 */
export const StarterDeckContainer = (props: {
  pushDeck: (data: DeckImportType) => void;
  deckIds?: string[];
}) => {
  const results = useStarterDecks({ enabled: true });
  const loading = results.some((record) => record.status === "loading");

  return (
    <Flex direction="column" color="brand.secondary">
      <Text fontSize="0.9rem" opacity={0.85} mb="0.75rem">
        New here, or just want to jump in? Pick one of these ready-made decks
        and it&apos;s added to your bag.
      </Text>

      {loading && (
        <Flex align="center" gap="0.5rem" opacity={0.7}>
          <Spinner size="sm" />
          <Text fontSize="0.85rem">Loading starter decks…</Text>
        </Flex>
      )}

      <Flex flexWrap="wrap" gap="0.5rem">
        {results?.map((record) => {
          if (record.data === undefined) return null;
          const added = props.deckIds?.includes(record.data.id);
          return (
            <Button
              key={record.data.id}
              size="sm"
              variant="outline"
              borderColor="rgba(72, 40, 79, 0.3)"
              bg={added ? "rgba(72, 40, 79, 0.12)" : "white"}
              isDisabled={added}
              onClick={() => props.pushDeck(record.data as DeckImportType)}
            >
              {added ? "✓ " : "+ "}
              {record.data.name}
            </Button>
          );
        })}
      </Flex>

      {!loading && results.every((r) => r.data === undefined) && (
        <Box
          mt="0.5rem"
          p="0.6rem"
          borderRadius="0.4rem"
          bg="rgba(72, 40, 79, 0.06)"
        >
          <Text fontSize="0.8rem" opacity={0.75}>
            Couldn&apos;t reach the starter deck source right now — try another
            method, or check back in a moment.
          </Text>
        </Box>
      )}
    </Flex>
  );
};
