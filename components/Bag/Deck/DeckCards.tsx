import { Card } from "@/components/CardFactory/Card";
import { CardTilt } from "@/components/CardFactory/CardTilt";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { Flex, Box, Text, Button } from "@chakra-ui/react";
import { useState } from "react";
import { CardInspector } from "./CardInspector";
import { HeroSheet } from "./HeroSheet";

export const DeckCards = ({
  decks,
  selectedDeckId,
  onToggleCharacterCard,
  onUpdateDeck,
}: {
  decks?: DeckImportType[];
  selectedDeckId?: string;
  /** when set, the card inspector offers a button to flag the card as a hero/rule card (kept out of the draw deck) */
  onToggleCharacterCard?: (cardIndex: number) => void;
  /** persists the hero sheet's editors (hero info, cardback, tokens) */
  onUpdateDeck?: (updated: DeckImportType) => Promise<void> | void;
}) => {
  const deck = decks?.find((deck) => deck.id === selectedDeckId);
  const cards = deck?.deck_data?.cards;
  const isImageDeck = deck?.tags?.includes("image-deck");
  const [inspecting, setInspecting] = useState<number | null>(null);

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
          ⚠ Imported deck — click a hero or rule card below, then
          choose &quot;Keep out of draw deck&quot; to keep it out of the shuffle.
        </Flex>
      )}
      {deck && <HeroSheet deck={deck} onSave={onUpdateDeck} />}
      {/* py/px leave room for the hovered card's 1.08 scale + tilt, so it never
          reaches the scroll container edge (a transform that does would grow a
          scrollbar for the duration of the hover). */}
      <Flex flexWrap="wrap" gap="0.5rem" mx="0.5rem" py="16px" px="6px">
        {cards?.map((card, index) => (
          <CardTilt
            key={card.title + index}
            maxW="200px"
            cursor="pointer"
            role="button"
            tabIndex={0}
            aria-label={`Inspect ${card.title}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setInspecting(index);
              }
            }}
            outline={card.isCharacterCard ? "3px solid" : "none"}
            outlineColor="brand.accent"
            // keyboard focus ring (the outline above is "none" on unflagged cards)
            _focusVisible={{
              outline: "3px solid",
              outlineColor: "brand.primary",
              outlineOffset: "2px",
            }}
            onClick={() => setInspecting(index)}
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
          </CardTilt>
        ))}
      </Flex>
      <CardInspector
        cards={cards ?? []}
        index={inspecting}
        onIndexChange={setInspecting}
        onClose={() => setInspecting(null)}
        // Gated on the callback alone, exactly as the grid click was on main:
        // DeckDetail passes it for EVERY deck, and Labs decks (arrive
        // pre-flagged) or any deck flagged earlier must stay changeable.
        // (#1578's "image decks only" premise is wrong — don't re-add it.)
        renderActions={
          onToggleCharacterCard
            ? (card, index) => (
                // plain stop-gap until #1578 builds the real toggle here
                <Button
                  size="sm"
                  w="100%"
                  h="auto"
                  py="0.4rem"
                  whiteSpace="normal"
                  variant={card.isCharacterCard ? "solid" : "outline"}
                  colorScheme="yellow"
                  onClick={() => onToggleCharacterCard(index)}
                >
                  {card.isCharacterCard
                    ? "Hero / rule card — kept out of draw deck"
                    : "Keep out of draw deck (hero / rule card)"}
                </Button>
              )
            : undefined
        }
      />
    </Box>
  );
};
