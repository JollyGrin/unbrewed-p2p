import { Button, useDisclosure } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { GiPawn } from "react-icons/gi";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  BoardToken,
  DEFAULT_PLAYER_COLOR,
  SavedToken,
  toSavedToken,
} from "@/components/Positions/position.type";
import { TokenLibraryModal } from "@/components/Positions/token-library.modal";

/**
 * Per-deck token loadout editor (issue #467).
 *
 * Sandbox players rebuild the same markers every game — a wound disc, a trap
 * icon, a minion image — because tokens only ever live in the session's
 * position blob. Saving them on the deck means starring it and joining a game
 * spawns the whole set (GameShell), and the loadout rides through deck
 * export/import for free since decks serialize whole.
 *
 * Reuses the in-game TokenLibraryModal in `offBoard` mode so there is exactly
 * one token picker to maintain. Edits write straight through `onSave`
 * (updateDeck → localStorage["DECKS"]) — the modal has no save button, and the
 * deck prop flowing back down is what re-renders the list.
 */
export const EditSavedTokens = ({
  deck,
  onSave,
}: {
  deck: DeckImportType;
  onSave: (updated: DeckImportType) => void;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const count = deck.savedTokens?.length ?? 0;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        color="brand.primary"
        borderColor="rgba(255,255,255,0.25)"
        _hover={{ bg: "rgba(255,255,255,0.08)" }}
        leftIcon={<GiPawn size="0.8rem" />}
        onClick={onOpen}
      >
        Tokens{count > 0 ? ` (${count})` : ""}
      </Button>
      {isOpen && (
        <EditSavedTokensModal
          deck={deck}
          onSave={onSave}
          isOpen={isOpen}
          onClose={onClose}
        />
      )}
    </>
  );
};

/**
 * Saved tokens carry no id (position and identity are per-game), but the
 * picker keys and patches rows by id — so index-derived ids bridge the two.
 */
const asRows = (saved: SavedToken[]): BoardToken[] =>
  saved.map((token, i) => ({ ...token, id: `saved#${i}`, x: 0, y: 0 }));

const rowIndex = (id: string) => Number(id.split("#")[1]);

const EditSavedTokensModal = ({
  deck,
  onSave,
  isOpen,
  onClose,
}: {
  deck: DeckImportType;
  onSave: (updated: DeckImportType) => void;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const saved = deck.savedTokens ?? [];
  const color = deck.savedTokenColor ?? DEFAULT_PLAYER_COLOR;

  const write = (next: SavedToken[], nextColor = color) =>
    onSave({ ...deck, savedTokens: next, savedTokenColor: nextColor });

  return (
    <TokenLibraryModal
      isOpen={isOpen}
      onClose={onClose}
      offBoard
      title={`${deck.name} — saved tokens`}
      intro="These spawn on the board whenever you start a game with this deck starred. Images are URLs only — no uploads."
      color={color}
      onColorChange={(hex) => write(saved, hex)}
      tokens={asRows(saved)}
      // No pool behind a bagged deck, so linked-HP counters have nothing to
      // read here — they still resolve live once spawned in a game.
      linkedHp={{}}
      onAdd={(token) => write([...saved, toSavedToken(token)])}
      onPatch={(id, patch) =>
        write(saved.map((t, i) => (i === rowIndex(id) ? { ...t, ...patch } : t)))
      }
      onDelete={(id) => {
        write(saved.filter((_, i) => i !== rowIndex(id)));
        toast.success("Removed from this deck's tokens");
      }}
    />
  );
};
