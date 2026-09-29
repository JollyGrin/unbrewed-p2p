import { Button, Flex, Input, Select, Text } from "@chakra-ui/react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { bagDeckLabel } from "@/lib/tableplace/opponent";
import type { useOpponentDeck } from "./useOpponentDeck";

/** Step 2: pick the opponent's deck from your bag, or paste a link to one. */
export const OpponentPicker = ({
  decks,
  opponent,
}: {
  decks: DeckImportType[] | undefined;
  opponent: ReturnType<typeof useOpponentDeck>;
}) => (
  <>
    {decks && decks.length > 0 && (
      <>
        <Text fontSize="0.9rem" fontWeight={600} mb="0.25rem">
          From your bag
        </Text>
        <Select
          bg="white"
          maxW="32rem"
          placeholder="Choose one of your decks"
          aria-label="Choose their deck from your bag"
          value={opponent.bagId}
          onChange={(e) => opponent.pickBag(e.target.value, decks)}
          data-testid="opponent-bag"
        >
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {bagDeckLabel(d)}
            </option>
          ))}
        </Select>
        <Text fontSize="0.9rem" fontWeight={600} mt="0.75rem" mb="0.25rem">
          Or paste a link
        </Text>
      </>
    )}
    <Flex gap="0.5rem" alignItems="center" flexWrap="wrap">
      <Input
        bg="white"
        maxW="32rem"
        aria-label="Their deck: a link or deck id"
        placeholder="unmatched.cards or Unmatched Labs link, or a deck id"
        value={opponent.pasted}
        onChange={(e) => opponent.setPasted(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && opponent.loadPasted()}
        data-testid="opponent-link"
      />
      <Button onClick={opponent.loadPasted} isLoading={opponent.loading}>
        Load
      </Button>
    </Flex>
    <Text fontSize="0.8rem" opacity={0.7} mt="0.25rem">
      Picking a seat for a friend to fill is coming with open seats.
    </Text>
    {opponent.error && (
      <Text mt="0.5rem" color="red.700" role="alert">
        {opponent.error}
      </Text>
    )}
  </>
);
