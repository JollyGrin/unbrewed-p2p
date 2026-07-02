import { Box, Flex, Text } from "@chakra-ui/react";

/**
 * Displays the estimated storage capacity/taken in kb (kilobytes)
 * */
export const DeckStats = ({
  length,
  deckKb,
}: {
  length: number;
  deckKb: number;
}) => {
  const totalKb = 5 * 1024;
  const usedKb = deckKb; // prop carries total localStorage used, in KB
  const pct = Math.min(100, Math.round((usedKb / totalKb) * 100));

  return (
    <Box px="0.75rem" py="0.6rem" color="brand.secondary">
      <Flex align="baseline" justify="space-between" flexWrap="wrap" gap="0.5rem">
        <Text
          fontFamily={"ArchivoNarrow"}
          fontSize={"2rem"}
          fontWeight={700}
          letterSpacing={"1px"}
          lineHeight={1}
        >
          {length > 0 ? length : 0} {length === 1 ? "Deck" : "Decks"}
        </Text>
        <Text fontFamily={"monospace"} fontSize="0.72rem" opacity={0.65}>
          {usedKb}kb / {totalKb}kb local storage
        </Text>
      </Flex>
      <Box
        mt="0.4rem"
        h="4px"
        borderRadius="full"
        bg="rgba(72, 40, 79, 0.18)"
        overflow="hidden"
      >
        <Box h="100%" w={`${pct}%`} bg="brand.secondary" opacity={0.55} />
      </Box>
    </Box>
  );
};
