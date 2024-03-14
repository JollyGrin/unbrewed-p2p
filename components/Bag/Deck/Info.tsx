import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { Box, HStack, Text, Tag } from "@chakra-ui/react";

export const DeckInfo = ({ data }: { data?: DeckImportType }) => {
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
          {sidekick.quantity !== null && sidekick.quantity > 1
            ? sidekick.quantity + "x"
            : "❤️️" + sidekick.hp}
        </Tag>
        <Tag>{sidekick.isRanged ? "🏹" : "⚔️"}</Tag>
        <Text color="antiquewhite" fontWeight={700} letterSpacing={"1px"}>
          {sidekick.name}
        </Text>
      </HStack>
      <Text mt="1rem" color="antiquewhite">
        {data.deck_data.hero.specialAbility}
      </Text>
    </Box>
  );
};
