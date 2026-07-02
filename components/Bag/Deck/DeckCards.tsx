import { Card } from "@/components/CardFactory/Card";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { Flex, Box, Text, HStack, Tooltip } from "@chakra-ui/react";

import { FaHeart } from "react-icons/fa";
import { GiFootprint } from "react-icons/gi";
import { LuSwords } from "react-icons/lu";
import { TbArcheryArrow } from "react-icons/tb";
import { MdSupervisorAccount as IconSidekick } from "react-icons/md";

export const DeckCards = ({
  decks,
  selectedDeckId,
  onToggleCharacterCard,
}: {
  decks?: DeckImportType[];
  selectedDeckId?: string;
  /** when set, clicking a card flags it as a hero/rule card (kept out of the draw deck) */
  onToggleCharacterCard?: (cardIndex: number) => void;
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
      <Flex flexWrap="wrap" gap="0.5rem" mx="0.5rem">
        {deck && <HeroCard deck={deck} />}
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

const HeroCard = ({ deck }: { deck: DeckImportType }) => {
  const hero = deck?.deck_data?.hero;
  const sidekick = deck?.deck_data?.sidekick;
  const isSidekick =
    sidekick?.name !== "Sidekick" || (!!sidekick.hp && !!sidekick.quantity);
  return (
    <Box w="408px" bg="brand.highlight" borderRadius="0.25rem" p="0.5rem">
      <Flex justifyContent="space-between">
        <Text fontWeight={700}>{hero?.name}</Text>
        <HStack>
          <FaHeart />
          <Text>{hero?.hp}</Text>
          <GiFootprint />
          <Text>{hero?.move}</Text>
          <IsRanged isRanged={hero?.isRanged} />
        </HStack>
      </Flex>

      {isSidekick && (
        <Flex justifyContent="space-between">
          <Text fontWeight={700}>{sidekick?.name}</Text>
          <HStack>
            {sidekick?.hp && (
              <>
                <FaHeart />
                <Text>{sidekick?.hp}</Text>
              </>
            )}
            {sidekick?.quantity && (
              <>
                <IconSidekick />
                <Text>{sidekick?.quantity}</Text>
              </>
            )}
            <IsRanged isRanged={sidekick?.isRanged} />
          </HStack>
        </Flex>
      )}

      <Box>
        <Text>{hero?.specialAbility}</Text>
        <Text
          mt="4px"
          fontSize="0.75rem"
          opacity="0.75"
          maxH="80px"
          overflowY="auto"
        >
          {deck.note}
        </Text>
        <HStack>
          <Text mt="4px" fontSize="0.75rem" opacity="0.75">
            Made by: {deck.user}
          </Text>
        </HStack>
      </Box>
    </Box>
  );
};

const IsRanged = ({ isRanged }: { isRanged?: boolean }) => (
  <Tooltip label={isRanged ? "Is Ranged" : "Is Meele"}>
    <span>{isRanged ? <TbArcheryArrow /> : <LuSwords />}</span>
  </Tooltip>
);
