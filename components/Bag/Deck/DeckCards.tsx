import { CardFactory } from "@/components/CardFactory/card.factory";
import {
  DeckImportType,
  DeckImportHeroType,
  DeckImportSidekickType,
} from "@/components/DeckPool/deck-import.type";
import { Flex, Box, Text, HStack, Tooltip } from "@chakra-ui/react";

import { FaHeart } from "react-icons/fa";
import { GiFootprint } from "react-icons/gi";
import { LuSwords } from "react-icons/lu";
import { TbArcheryArrow } from "react-icons/tb";
import { MdSupervisorAccount as IconSidekick } from "react-icons/md";

export const DeckCards = ({
  decks,
  selectedDeckId,
}: {
  decks?: DeckImportType[];
  selectedDeckId?: string;
}) => {
  const deck = decks?.find((deck) => deck.id === selectedDeckId);
  const cards = deck?.deck_data?.cards;

  return (
    <Flex flexWrap="wrap" gap="0.5rem" mx="0.5rem">
      {deck && <HeroCard deck={deck} />}
      {cards?.map((card) => (
        <Box
          key={card.title}
          maxW="200px"
          transition="all 0.25s ease-in-out"
          _hover={{ transform: "scale(2)" }}
        >
          <CardFactory card={card} />
        </Box>
      ))}
    </Flex>
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
