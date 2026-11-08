import { Card } from "@/components/CardFactory/Card";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { Flex, Box, Text } from "@chakra-ui/react";
import { HeroSheet } from "./HeroSheet";

export const DeckCards = ({
  decks,
  selectedDeckId,
  onToggleCharacterCard,
  onUpdateDeck,
}: {
  decks?: DeckImportType[];
  selectedDeckId?: string;
  /** when set, clicking a card flags it as a hero/rule card (kept out of the draw deck) */
  onToggleCharacterCard?: (cardIndex: number) => void;
  /** persists the hero sheet's editors (hero info, cardback, tokens) */
  onUpdateDeck?: (updated: DeckImportType) => Promise<void> | void;
}) => {
  const deck = decks?.find((deck) => deck.id === selectedDeckId);
  const cards = deck?.deck_data?.cards;
  const isImageDeck = deck?.tags?.includes("image-deck");

  return (
    <Box>
      {isImageDeck && onToggleCharacterCard && (
        <Flex
          mx="0.5rem"
          mb="0.5rem"
          p="0.4rem 0.75rem"
          bg="brand.accent"
          borderRadius="0.4rem"
          fontSize="0.85rem"
          fontWeight={600}
        >
          ⚠ Imported deck — click any hero or rule card below to keep it out
          of the shuffled draw deck.
        </Flex>
      )}
      {deck && <HeroSheet deck={deck} onSave={onUpdateDeck} />}
      <Flex flexWrap="wrap" gap="0.5rem" mx="0.5rem">
        {cards?.map((card, index) => (
          <Box
            key={card.title + index}
            maxW="200px"
            position="relative"
            transition="transform 0.15s ease-out"
            cursor={onToggleCharacterCard ? "pointer" : undefined}
            outline={card.isCharacterCard ? "3px solid" : "none"}
            outlineColor="brand.accent"
            borderRadius="0.4rem"
            _hover={{ transform: "scale(2)", zIndex: 10, position: "relative" }}
            onClick={() => onToggleCharacterCard?.(index)}
          >
            <Card card={card} />
            {card.isCharacterCard && (
              <Text
                position="absolute"
                bottom="0"
                w="100%"
                textAlign="center"
                fontSize="0.6rem"
                fontWeight={700}
                bg="brand.accent"
                borderBottomRadius="0.4rem"
              >
                HERO/RULE — NOT SHUFFLED
              </Text>
            )}
          </Box>
        ))}
      </Flex>
    </Box>
  );
};
