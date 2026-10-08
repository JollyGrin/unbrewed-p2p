import { Box, Button, Flex, Input, Text } from "@chakra-ui/react";
import type { useOpponentDeck } from "./useOpponentDeck";

/** Their deck from outside your bag: paste a link to one. */
export const OpponentPaste = ({
  opponent,
}: {
  opponent: ReturnType<typeof useOpponentDeck>;
}) => (
  <Box p="12px 14px" bg="brand.highlight" borderRadius="12px">
    <Flex gap="10px" alignItems="center" flexWrap="wrap">
      <Text
        as="label"
        htmlFor="their-link"
        fontSize="14px"
        fontWeight={700}
        whiteSpace="nowrap"
      >
        Not in your bag?{" "}
        <Box as="span" srOnly>
          Paste a link to their deck, or a deck id
        </Box>
      </Text>
      <Input
        id="their-link"
        flex="1 1 14rem"
        minW={0}
        h="44px"
        bg="white"
        color="brand.surfaceDim"
        border="1.5px solid"
        borderColor="brand.secondary"
        fontSize="14px"
        placeholder="unmatched.cards or Unmatched Labs link, or a deck id"
        value={opponent.pasted}
        onChange={(e) => opponent.setPasted(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && opponent.loadPasted()}
        data-testid="opponent-link"
      />
      <Button
        h="44px"
        px="18px"
        bg="brand.secondary"
        color="brand.highlight"
        fontSize="14px"
        _hover={{ bg: "brand.surface" }}
        onClick={opponent.loadPasted}
        isLoading={opponent.loading}
      >
        Load
      </Button>
    </Flex>
    <Text fontSize="0.8rem" opacity={0.8} mt="6px">
      Picking a seat for a friend to fill is coming with open seats.
    </Text>
    {opponent.error && (
      <Text mt="6px" color="red.700" role="alert">
        {opponent.error}
      </Text>
    )}
  </Box>
);
