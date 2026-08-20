import { Box, Flex, Link, Text } from "@chakra-ui/react";
import NextLink from "next/link";

import {
  BAG_BUDGET_BYTES,
  formatKb,
  type StorageBreakdown,
} from "@/lib/storage/breakdown";

/**
 * Bag capacity meter. It charges the bag for what the bag owns — decks and maps
 * (#645). Pro replays share the same physical quota but carry their own budget
 * and eviction, so they get a line in the breakdown (and a link to where you can
 * delete them) instead of filling this bar.
 */
export const DeckStats = ({
  length,
  storage,
}: {
  length: number;
  storage: StorageBreakdown;
}) => {
  const totalKb = Math.round(BAG_BUDGET_BYTES / 1024);
  const usedKb = +(storage.bagBytes / 1024).toFixed(2);
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
          {Math.min(usedKb, totalKb)}kb / {totalKb}kb local storage
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
      <Text
        mt="0.35rem"
        fontFamily={"monospace"}
        fontSize="0.66rem"
        opacity={0.55}
      >
        Decks {formatKb(storage.deckBytes)} kb · Maps{" "}
        {formatKb(storage.mapBytes)} kb ·{" "}
        <Link
          as={NextLink}
          href="/pro/replays"
          textDecoration="underline"
          _hover={{ opacity: 1 }}
        >
          Replays
        </Link>{" "}
        {formatKb(storage.replayBytes)} kb · Other{" "}
        {formatKb(storage.otherBytes)} kb
      </Text>
    </Box>
  );
};
