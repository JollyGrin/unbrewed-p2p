import { Dispatch, SetStateAction, useState } from "react";
import { Box, Button, Flex, Input, Text } from "@chakra-ui/react";
import { CardFactory } from "@/components/CardFactory/card.factory";
import { DECK_ID } from "@/lib/constants/unmatched-deckids";
import { useUnmatchedDeck } from "@/lib/hooks/useUnmatchedDeck";
import { Carousel } from "@/components/Game/game.carousel";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import { StarterDeckContainer } from "@/components/Bag/StarterDecks";
import { DeckSlot } from "./Slot";
import { DeckStats } from "./Stats";
import { DeckInfo } from "./Info";

export const BagDecks = () => {
  const { data, isLoading, setDeckId } = useUnmatchedDeck();

  const { decks, pushDeck, removeDeckbyId, totalKbLeft, setStar, star } =
    useLocalDeckStorage();

  const [selectedDeckId, setSelectedDeckId] = useState<string>();

  return (
    <>
      <Box bg="brand.primary">
        <DeckStats length={decks?.length ?? 0} deckKb={totalKbLeft ?? 0} />
        <Flex justifyContent={"space-between"}>
          {decks && (
            <Carousel
              items={decks?.map((deck) => (
                <Box w="110px" key={deck.id}>
                  <DeckSlot
                    abbrev={deck?.deck_data.hero.name
                      .substring(0, 3)
                      .toUpperCase()}
                    id={deck?.id}
                    setSelectedDeck={setSelectedDeckId}
                    isSelected={selectedDeckId === deck.id}
                    star={star}
                  />
                </Box>
              ))}
            />
          )}
        </Flex>
      </Box>

      <Flex bg="brand.secondary" flexDir={"column"} p={3}>
        {!selectedDeckId && !data && (
          <>
            <UnmatchedInput setDeckId={setDeckId} />
            <StarterDeckContainer
              pushDeck={pushDeck}
              deckIds={decks?.map((deck) => deck.id)}
            />
          </>
        )}
        {!selectedDeckId && data && <DeckInfo data={data} />}
        {selectedDeckId && (
          <DeckInfo data={decks?.find((deck) => deck.id === selectedDeckId)} />
        )}
      </Flex>
      <Flex bg="brand.secondary" h="100%">
        {!selectedDeckId && data && !isLoading && <DeckCarousel data={data} />}
        {decks && selectedDeckId && (
          <DeckCarousel
            selectedDeck={decks?.find((deck) => deck.id === selectedDeckId)}
          />
        )}
      </Flex>
      <Flex bg="brand.secondary" alignItems={"end"} p={3}>
        {!selectedDeckId && data && (
          <Button
            onClick={(e) => {
              e.preventDefault();
              pushDeck(data);
              setDeckId(undefined);
            }}
          >
            Save Deck
          </Button>
        )}
        {selectedDeckId && (
          <Flex gap={2}>
            <Button onClick={() => setSelectedDeckId(undefined)}>
              Deselect
            </Button>
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
          </Flex>
        )}
      </Flex>
    </>
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

const DeckCarousel = ({
  data,
  selectedDeck,
}: {
  data?: DeckImportType;
  selectedDeck?: DeckImportType;
}) => {
  const deck = selectedDeck ? selectedDeck : data;
  if (!deck) return <div />;
  return (
    <Carousel
      items={deck.deck_data.cards.map((card, index) => (
        <Box key={card.title + index} h="250px" w="190px">
          <CardFactory card={card} />
        </Box>
      ))}
    />
  );
};
