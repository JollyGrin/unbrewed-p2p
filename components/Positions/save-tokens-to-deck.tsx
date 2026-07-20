import { Button, Text } from "@chakra-ui/react";
import { FC } from "react";
import { toast } from "react-hot-toast";
import { DeckImportType } from "../DeckPool/deck-import.type";
import { BoardToken, toSavedToken } from "./position.type";

/**
 * Persist the loadout built during a game back onto the starred deck, so the
 * next game with that deck starts with it already on the table (issue #467).
 *
 * Card tokens are skipped: a card belongs to the pool it was played from, and
 * saving one would duplicate it into every future game.
 */
export const SaveTokensToDeck: FC<{
  deck: DeckImportType;
  tokens: BoardToken[];
  color: string;
  onSave: (updated: DeckImportType) => void;
}> = ({ deck, tokens, color, onSave }) => {
  const keepable = tokens.filter((t) => !t.card);

  const save = () => {
    onSave({
      ...deck,
      savedTokens: keepable.map(toSavedToken),
      savedTokenColor: color,
    });
    toast.success(
      keepable.length
        ? `Saved ${keepable.length} token${keepable.length === 1 ? "" : "s"} to ${deck.name}`
        : `Cleared saved tokens on ${deck.name}`,
    );
  };

  return (
    <>
      <Button size="sm" onClick={save}>
        Save these to {deck.name}
      </Button>
      <Text fontSize="0.75rem" opacity={0.65} mt="0.3rem">
        Replaces this deck&apos;s saved loadout — it spawns automatically at the
        start of your next game. Edit it any time in your bag.
      </Text>
    </>
  );
};
