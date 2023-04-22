import { useQuery } from "@tanstack/react-query";
import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react";
import axios from "axios";
import { useState } from "react";
import { CardFactory } from "@/components/CardFactory/card.factory";
import { DeckImportDataType } from "@/components/DeckPool/deck-import.type";

const BackpackPage = () => {
  const [deckId, setDeckId] = useState<string>();
  const [apiUrl, setApiUrl] = useState<string>(
    "https://unbrewed-api.vercel.app/api/unmatched-deck/"
  );
  const [selectedCardIndex, setSelectedCardIndex] = useState<number>(0);

  const { data, isLoading } = useQuery(
    ["deck"],
    async () => {
      try {
        const result = await axios.get(apiUrl + deckId);
        return result.data;
      } catch (err) {
        console.error(err);
      }
    },
    { enabled: !!deckId }
  );

  return (
    <Box>
      <Text>Load a deck</Text>
      <Button onClick={() => setDeckId("pk1x")}>Load Thrall</Button>
      {!!deckId && isLoading && <Spinner />}

      {data?.deck_data && (
        <Box w="75%" margin="5rem auto">
          <Flex m={"2rem 0"} gap={2}>
            <Button
              display={
                data.deck_data.cards.length > selectedCardIndex
                  ? "inline"
                  : "none"
              }
              onClick={() => {
                setSelectedCardIndex(selectedCardIndex + 1);
              }}
            >
              +
            </Button>

            <Button
              display={selectedCardIndex > 0 ? "inline" : "none"}
              onClick={() => {
                setSelectedCardIndex(selectedCardIndex - 1);
              }}
            >
              -
            </Button>
          </Flex>
          <CardFactory card={data.deck_data.cards[selectedCardIndex]} />
          <code>{JSON.stringify(data.deck_data.cards[selectedCardIndex])}</code>
        </Box>
      )}
    </Box>
  );
};
export default BackpackPage;
