//@ts-nocheck
import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Spinner,
  Tag,
  Text,
} from "@chakra-ui/react";
import { CardFactory } from "@/components/CardFactory/card.factory";
import { DECK_ID } from "@/lib/constants/unmatched-deckids";
import { useUnmatchedDeck } from "@/lib/hooks/useUnmatchedDeck";
import { useRouter } from "next/router";
import { Carousel } from "@/components/Game/game.carousel";
import {
  DeckImportDataType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import Link from "next/link";

const BagPage = () => {
  const { data, isLoading, error, deckId, setDeckId, apiUrl, setApiUrl } =
    useUnmatchedDeck();

  const { decks, pushDeck, removeDeckbyId, totalKbLeft, setStar, star } =
    useLocalDeckStorage();
  const [selectedDeckId, setSelectedDeckId] = useState<string>();

  return (
    <Flex flexDir={"column"} bg="antiquewhite" h="100svh">
      <BagNav />
      <DeckStats length={decks?.length} deckKb={totalKbLeft} />
      <Flex justifyContent={"space-between"}>
        {decks && (
          <Carousel
            items={decks?.map((deck, index) => (
              <Box w="110px" key={deck.id}>
                <DeckSlot
                  abbrev={deck?.deck_data.hero.name
                    .substring(0, 3)
                    .toUpperCase()}
                  id={deck?.id}
                  setSelectedDeck={setSelectedDeckId}
                  star={star}
                />
              </Box>
            ))}
          />
        )}
      </Flex>
      <Flex bg="purple" p={3} gap={2}>
        {/* <Button>Load from URL</Button>
        <Button>Load from JSON</Button> */}
      </Flex>

      <Flex bg="indigo" flexDir={"column"} p={3}>
        {!selectedDeckId && !data && <UnmatchedInput setDeckId={setDeckId} />}
        {!selectedDeckId && data && <DeckInfo data={data} />}
        {selectedDeckId && (
          <DeckInfo data={decks?.find((deck) => deck.id === selectedDeckId)} />
        )}
      </Flex>
      <Flex bg="indigo" h="100%">
        {!selectedDeckId && data && !isLoading && <DeckCarousel data={data} />}
        {decks && selectedDeckId && (
          <DeckCarousel
            selectedDeck={decks?.find((deck) => deck.id === selectedDeckId)}
          />
        )}
      </Flex>
      <Flex bg="indigo" alignItems={"end"} p={3}>
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
    </Flex>
  );
};
export default BagPage;

const BagNav = () => {
  return (
    <Flex justifyContent={"space-between"} alignItems={"center"} p={2}>
      <Text fontFamily="SpaceGrotesk" fontSize="2.25rem" fontWeight="700">
        Bag
      </Text>
      <Link href="/game">
        <Box w="2rem" h="2rem" bg="black" />
      </Link>
    </Flex>
  );
};

const DeckStats = ({ length, deckKb }) => {
  return (
    <Box mt={2} p={2}>
      <Text
        fontFamily={"ArchivoNarrow"}
        fontSize={"3rem"}
        fontWeight={700}
        letterSpacing={"2px"}
      >
        {length > 0 ? length : 0} Decks
      </Text>
      <Text fontFamily={"monospace"} opacity={0.6}>
        {deckKb}kb / {5 * 1024}kb used local storage space
      </Text>
    </Box>
  );
};

const DeckSlot = ({ abbrev, id, setSelectedDeck, star }) => {
  const isStarred = star === id;
  return (
    <Flex
      m={2}
      bg="rgba(0,0,0,0.25)"
      w="100px"
      height="100px"
      borderRadius={5}
      justifyContent={"center"}
      alignItems={"center"}
      userSelect={"none"}
      cursor={"pointer"}
    >
      {abbrev && (
        <Flex
          bg="purple"
          h="85%"
          w="85%"
          borderRadius={"inherit"}
          border={isStarred && "2px solid gold"}
          p={2}
          color="antiquewhite"
          justifyContent={"center"}
          alignItems={"center"}
          onClick={(e) => {
            e.preventDefault();
            console.log("hi", id);
            setSelectedDeck(id);
          }}
        >
          <Text fontWeight={700} fontSize={"1.5rem"}>
            {abbrev}
          </Text>
        </Flex>
      )}
    </Flex>
  );
};

const UnmatchedInput = ({ setDeckId }) => {
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

const DeckCarousel = ({ data, selectedDeck }) => {
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

const DeckInfo: DeckImportDataType = ({ data }) => {
  if (!data) return <div />;
  const { hero, sidekick } = data.deck_data;
  return (
    <Box>
      <HStack mb={2}>
        <Tag>❤️️{hero.hp}</Tag>
        <Tag>👟{hero.move}</Tag>
        <Tag>{hero.isRanged ? "🏹" : "⚔️"}</Tag>
        <Text color="antiquewhite" fontWeight={700} letterSpacing={"1px"}>
          {hero.name}
        </Text>
      </HStack>
      <HStack display={sidekick.quantity === 0 ? "none" : "inline-flex"}>
        <Tag>
          {sidekick.quantity > 1
            ? sidekick.quantity + "x"
            : "❤️️" + sidekick.hp}
        </Tag>
        <Tag>{sidekick.isRanged ? "🏹" : "⚔️"}</Tag>
        <Text color="antiquewhite" fontWeight={700} letterSpacing={"1px"}>
          {sidekick.name}
        </Text>
      </HStack>
    </Box>
  );
};
