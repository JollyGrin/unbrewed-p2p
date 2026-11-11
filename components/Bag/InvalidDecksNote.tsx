import { Text } from "@chakra-ui/react";
import { toast } from "react-hot-toast";

import { BulkBundle } from "@/lib/bag/bundle";
import { skippedInvalidMessage } from "@/lib/decks/isPlayableDeck";
import { trackDeckAddFailed } from "@/lib/deckAnalytics";

/**
 * Malformed decks a backup held (#1609): `normalizeBundle` leaves them out,
 * and the import panels say so before and on import.
 */
export const InvalidDecksNote = ({ bundle }: { bundle: BulkBundle }) =>
  bundle.invalidDecks ? (
    <Text color="brand.danger" fontSize="0.85rem" mt="0.4rem">
      {skippedInvalidMessage(bundle.invalidDecks)}: they will be left out.
    </Text>
  ) : null;

/** On import: one toast and one `deck_add_failed {reason: "invalid_shape"}`. */
export const reportInvalidDecks = (bundle: BulkBundle | undefined): void => {
  if (!bundle?.invalidDecks) return;
  toast.error(skippedInvalidMessage(bundle.invalidDecks), { id: "bag-deck-invalid" });
  trackDeckAddFailed("bulk", "invalid_shape");
};
