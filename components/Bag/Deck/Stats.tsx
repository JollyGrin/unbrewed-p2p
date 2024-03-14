import { Box, Text } from "@chakra-ui/react";

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
