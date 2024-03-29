import { Dispatch, SetStateAction, useState } from "react";
import { Box, Button, Flex, Grid, HStack, Input, Text } from "@chakra-ui/react";
import { CardFactory } from "@/components/CardFactory/card.factory";
import { DECK_ID } from "@/lib/constants/unmatched-deckids";
import { useUnmatchedDeck } from "@/lib/hooks/useUnmatchedDeck";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";

import { FaStar } from "react-icons/fa";

import { StarterDeckContainer } from "@/components/Bag/StarterDecks";
import { DeckStats } from "./Stats";
import { AddJson } from "./AddJson";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { toast } from "react-hot-toast";
import { DeckCards } from "./DeckCards";

export const BagDecks = () => {
  const { data, setDeckId } = useUnmatchedDeck();

  const { decks, pushDeck, removeDeckbyId, totalKbLeft, setStar, star } =
    useLocalDeckStorage();

  const [selectedDeckId, setSelectedDeckId] = useState<string>();

  return (
    <>
      <Box bg="brand.primary">
        <DeckStats length={decks?.length ?? 0} deckKb={totalKbLeft ?? 0} />
      </Box>
      <Grid templateColumns="1fr 4fr" h="100%">
        <Box bg="white">
          {decks?.map((deck) => (
            <DeckListItem
              key={deck.id + deck.version_id}
              {...{ deck, star, selectedDeckId, setSelectedDeckId }}
            />
          ))}
        </Box>
        {selectedDeckId && (
          <Box h="100%" bg="brand.secondary">
            <Buttons
              deck={decks?.find((deck) => deck.id === selectedDeckId)}
              {...{
                setSelectedDeckId,
                selectedDeckId,
                star,
                setStar,
                removeDeckbyId,
              }}
            />
            <DeckCards {...{ decks, selectedDeckId }} />
          </Box>
        )}

        {!selectedDeckId && (
          <Box p="0.5rem">
            {!data && (
              <Flex direction="column">
                <Box>
                  <UnmatchedInput setDeckId={setDeckId} />
                </Box>
                <AddJson />
                <StarterDeckContainer
                  deckIds={decks?.map((deck) => deck.id)}
                  {...{ pushDeck }}
                />
              </Flex>
            )}
            {data && (
              <HStack ml="0.5rem" mb="0.5rem" gap="0.5rem">
                <Button onClick={() => pushDeck(data)}>Save Deck</Button>
                <Button onClick={() => setDeckId(undefined)}>Clear</Button>
              </HStack>
            )}

            {/* If data exists, show the cards */}
            {data && <DeckCards decks={[data]} selectedDeckId={data.id} />}
          </Box>
        )}
      </Grid>
    </>
  );
};

const DeckListItem = ({
  deck,
  star,
  setSelectedDeckId,
  selectedDeckId,
}: {
  deck: DeckImportType;
  star?: string;
  selectedDeckId?: string;
  setSelectedDeckId: (id: string) => void;
}) => {
  return (
    <HStack
      key={deck.id + deck.version_id}
      p="0.5rem"
      bg={selectedDeckId === deck.id ? "rgba(0,0,0,0.15)" : ""}
      cursor="pointer"
      onClick={() => setSelectedDeckId(deck.id)}
    >
      <Box
        h="2rem"
        w="1.5rem"
        borderRadius="0.25rem"
        bg={deck.deck_data.appearance.highlightColour}
        bgImg={deck.deck_data.appearance.cardbackUrl}
        bgPos="center"
        bgSize="cover"
        transition="all 0.25s ease-in-out"
        _hover={{
          transform: "scale(1.8)",
        }}
      />
      {star === deck.id && (
        <FaStar
          color="gold"
          style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))" }}
        />
      )}
      <Text>{deck.name}</Text>
    </HStack>
  );
};

const Buttons = ({
  deck,
  selectedDeckId,
  setSelectedDeckId,
  removeDeckbyId,
  setStar,
}: {
  deck?: DeckImportType;
  selectedDeckId?: string;
  setSelectedDeckId: (id?: string) => void;
  removeDeckbyId: (id: string) => void;
  setStar: (id: string) => void;
}) => {
  const [_, copy] = useCopyToClipboard();
  return (
    <HStack p="0.5rem" justifyContent="end">
      {selectedDeckId && (
        <Flex gap={2}>
          <Button onClick={() => setSelectedDeckId(undefined)}>Deselect</Button>
          <Button
            bg="tomato"
            onClick={() => {
              setSelectedDeckId(undefined);
              removeDeckbyId(selectedDeckId);
            }}
          >
            Toss from Bag
          </Button>

          <Button
            bg="gold"
            onClick={() => {
              setStar(selectedDeckId);
            }}
          >
            ☆ Star Deck
          </Button>

          <Button
            onClick={() => {
              copy(JSON.stringify(deck));
              toast.success("Copied JSON for: " + deck?.name);
            }}
          >
            Copy JSON
          </Button>
        </Flex>
      )}
    </HStack>
  );
};

const UnmatchedInput = ({
  setDeckId,
}: {
  setDeckId: Dispatch<SetStateAction<string | undefined>>;
}) => {
  return (
    <>
      <Text color="antiquewhite" fontSize={"1.25rem"}>
        Load a deck from{" "}
        <a
          href="https://unmatched.cards/decks"
          style={{ textDecoration: "underline" }}
        >
          unmatched.cards
        </a>
      </Text>
      <Input
        bg="antiquewhite"
        maxW="200px"
        my="10px"
        fontFamily={"monospace"}
        placeholder={"Example: " + DECK_ID.THRALL}
        letterSpacing={"2px"}
        onChange={(e) => {
          setDeckId(e.target.value);
        }}
      />
    </>
  );
};
