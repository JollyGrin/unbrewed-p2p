import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { Box, Button, Flex, Text, useDisclosure } from "@chakra-ui/react";
import { useStarterDecks } from "./useStarterDecks";

export const StarterDeckContainer = (props: {
  pushDeck: (data: DeckImportType) => void;
  deckIds?: string[];
}) => {
  const { isOpen, onOpen } = useDisclosure();
  const results = useStarterDecks({ enabled: isOpen });
  const hasResult = !!results.find((record) => record.status === "success");
  return (
    <Box p="1rem" mt="2rem" bg="antiquewhite" borderRadius="0.25rem">
      <Text>Don't have any decks in mind?</Text>
      {!hasResult && (
        <Button mt="1rem" onClick={onOpen}>
          Load starter decks
        </Button>
      )}
      <Flex flexWrap="wrap" gap="0.5rem" mt="1rem">
        {results?.map(
          (record) =>
            record.data !== undefined && (
              <Button
                borderRadius="0.25rem"
                cursor="pointer"
                p="0.5rem"
                bg="rgba(0,0,0,0.15)"
                isDisabled={props.deckIds?.includes(record.data.id)}
                onClick={() => props.pushDeck(record.data as DeckImportType)}
              >
                {record.data.name}
              </Button>
            ),
        )}
      </Flex>
    </Box>
  );
};
