import { useState } from "react";
import { Box, Button, Flex, Grid, Text } from "@chakra-ui/react";
import { FaArrowLeft } from "react-icons/fa";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { PopularDecks } from "@/components/Bag/PopularDecks";
import { AddImageDeck } from "@/components/Bag/ImageDeck";
import { StarterDeckContainer } from "@/components/Bag/StarterDecks";
import { AddJson } from "@/components/Bag/Deck/AddJson";
import { CodePanel } from "./CodePanel";

type MethodId = "popular" | "code" | "images" | "json" | "starters";

type Method = {
  id: MethodId;
  icon: string;
  title: string;
  blurb: string;
  featured?: boolean;
};

const METHODS: Method[] = [
  {
    id: "popular",
    icon: "⭐",
    title: "Popular decks",
    blurb: "Browse the community's most-liked decks. One click and you're ready to play.",
    featured: true,
  },
  {
    id: "code",
    icon: "🔑",
    title: "Deck code",
    blurb: "Paste a code from unmatched.cards to pull in a deck.",
  },
  {
    id: "images",
    icon: "🖼️",
    title: "Card images",
    blurb: "Bring any deck from card images — a TTS export or a list of image URLs.",
  },
  {
    id: "json",
    icon: "📋",
    title: "Paste JSON",
    blurb: "Already have a deck's raw JSON? Import it from text or a URL.",
  },
  {
    id: "starters",
    icon: "🎲",
    title: "Starter decks",
    blurb: "New here? Load a few ready-made decks to try.",
  },
];

export const AddDeckHub = ({
  pushDeck,
  setStar,
  star,
  deckIds,
  onDeckAdded,
}: {
  pushDeck: (deck: DeckImportType) => void;
  setStar: (id: string) => void;
  star?: string;
  deckIds?: string[];
  /** jump to the new deck's detail view once a single deck is built */
  onDeckAdded?: (deckId: string) => void;
}) => {
  const [method, setMethod] = useState<MethodId | null>(null);
  const active = METHODS.find((m) => m.id === method);

  if (active) {
    return (
      <Box maxW="920px" mx="auto">
        <Button
          variant="ghost"
          size="sm"
          color="brand.primary"
          _hover={{ bg: "rgba(255,255,255,0.08)" }}
          leftIcon={<FaArrowLeft />}
          mb="0.75rem"
          onClick={() => setMethod(null)}
        >
          All options
        </Button>
        <Box
          bg="brand.parchment"
          borderRadius="0.75rem"
          p={{ base: "1rem", md: "1.25rem" }}
          boxShadow="0 2px 10px rgba(20, 8, 24, 0.22)"
        >
          <Flex align="center" gap="0.6rem" mb="0.75rem">
            <Text fontSize="1.5rem" lineHeight={1}>
              {active.icon}
            </Text>
            <Text
              fontFamily="SpaceGrotesk"
              fontWeight={700}
              fontSize="1.25rem"
              color="brand.secondary"
            >
              {active.title}
            </Text>
          </Flex>

          {method === "popular" && (
            <PopularDecks deckIds={deckIds} pushDeck={pushDeck} setStar={setStar} star={star} />
          )}
          {method === "code" && (
            <CodePanel pushDeck={pushDeck} setStar={setStar} onAdded={onDeckAdded} />
          )}
          {method === "images" && <AddImageDeck onAdded={onDeckAdded} />}
          {method === "json" && <AddJson onAdded={onDeckAdded} />}
          {method === "starters" && (
            <StarterDeckContainer deckIds={deckIds} pushDeck={pushDeck} />
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box maxW="920px" mx="auto">
      <Text
        fontFamily="BebasNeueRegular"
        fontSize="2rem"
        letterSpacing="0.03em"
        color="brand.primary"
        lineHeight={1.1}
      >
        Add a deck to your bag
      </Text>
      <Text fontSize="0.9rem" opacity={0.85} mb="1.25rem" color="brand.primary">
        Pick how you want to bring a deck in — you can always add more later.
      </Text>

      <Grid
        templateColumns={{ base: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr" }}
        gap="0.85rem"
      >
        {METHODS.map((m) => (
          <MethodCard key={m.id} method={m} onClick={() => setMethod(m.id)} />
        ))}
      </Grid>
    </Box>
  );
};

const MethodCard = ({
  method,
  onClick,
}: {
  method: Method;
  onClick: () => void;
}) => (
  <Flex
    as="button"
    onClick={onClick}
    direction="column"
    textAlign="left"
    gap="0.4rem"
    p="1rem"
    borderRadius="0.75rem"
    bg="brand.parchment"
    border="2px solid"
    borderColor={method.featured ? "brand.accent" : "rgba(72, 40, 79, 0.15)"}
    boxShadow="0 2px 8px rgba(20, 8, 24, 0.18)"
    cursor="pointer"
    transition="all 0.15s ease-out"
    gridColumn={{ base: "auto", sm: method.featured ? "1 / -1" : "auto" }}
    _hover={{
      transform: "translateY(-2px)",
      boxShadow: "0 8px 20px rgba(20, 8, 24, 0.3)",
      borderColor: method.featured ? "brand.accentDeep" : "brand.secondary",
    }}
  >
    <Flex align="center" gap="0.5rem">
      <Text fontSize="1.6rem" lineHeight={1}>
        {method.icon}
      </Text>
      <Text
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="1.05rem"
        color="brand.secondary"
      >
        {method.title}
      </Text>
      {method.featured && (
        <Text
          fontSize="0.62rem"
          fontWeight={700}
          textTransform="uppercase"
          letterSpacing="0.06em"
          bg="brand.accent"
          color="brand.surfaceDim"
          px="0.4rem"
          py="0.1rem"
          borderRadius="full"
        >
          Easiest
        </Text>
      )}
    </Flex>
    <Text fontSize="0.85rem" opacity={0.82} color="brand.secondary">
      {method.blurb}
    </Text>
  </Flex>
);
