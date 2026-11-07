import { useEffect, useRef } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { useUnmatchedDeck } from "@/lib/hooks/useUnmatchedDeck";
import { DeckCards } from "@/components/Bag/Deck/DeckCards";
import { useReplaceConfirm } from "@/components/Bag/ReplaceDeckConfirm";
import { BagDeckView } from "@/lib/bag/useBag";
import { failureReason, trackDeckAddFailed } from "@/lib/deckAnalytics";
import { parseDeckLink } from "@/lib/deckLink";
import { LabsImportError } from "@/lib/labs/errors";
import { DeckPreview } from "./DeckPreview";
import { FoundLine } from "./FoundLine";

/**
 * A code worth reporting a failed fetch for: a Labs character link, or a whole
 * unmatched.cards code (4+ url-safe characters). Anything shorter is the
 * player still typing, and its 404 is not a failed add.
 */
const isCompleteCode = (raw: string | undefined): boolean => {
  const link = raw ? parseDeckLink(raw) : null;
  if (!link) return false;
  return link.source === "labs" || /^[A-Za-z0-9_-]{4,}$/.test(link.id.trim());
};

/**
 * An unmatched.cards code from the paste bar (#1538): `useUnmatchedDeck`
 * fetches it as it changes, the preview ends in a table.
 */
export const CodePanel = ({
  code,
  pushDeck,
  setStar,
  onAdded,
}: {
  /** the deck code (the part after `/decks/`), fetched as it changes */
  code: string;
  pushDeck: BagDeckView["pushDeck"];
  setStar: (id: string) => void;
  onAdded?: (deckId: string) => void;
}) => {
  const { data, isLoading, error, deckId, setDeckId } = useUnmatchedDeck();
  const { confirmReplace, asking, prompt } = useReplaceConfirm();

  useEffect(() => {
    setDeckId(code || undefined);
  }, [code, setDeckId]);

  // One report per complete code that fails; never a half-typed one.
  const reportedFor = useRef<string>();
  useEffect(() => {
    if (!error || !isCompleteCode(deckId) || reportedFor.current === deckId) return;
    if (error instanceof LabsImportError && error.code === "bad-input") return;
    reportedFor.current = deckId;
    trackDeckAddFailed("code", failureReason(error));
  }, [error, deckId]);

  const save = async (): Promise<string | undefined> => {
    if (!data) return undefined;
    // storage full, or the player kept their edited copy — already toasted
    if (!(await pushDeck(data, { confirmReplace, source: "code" }))) return undefined;
    setStar(data.id);
    toast.success(`${data.name} saved & ready to play`);
    onAdded?.(data.id);
    return data.id;
  };

  // A stale fetch for the previous code is not this code's deck.
  const current = data && deckId === code ? data : undefined;

  return (
    <Flex direction="column" color="brand.secondary">
      {isLoading && <FoundLine tone="working">unmatched.cards deck {code} · fetching…</FoundLine>}
      {!isLoading && !!error && deckId === code && (
        <FoundLine tone="problem">
          Couldn&apos;t fetch deck {code} from unmatched.cards. Check the code, or
          try again in a moment.
        </FoundLine>
      )}
      {current && (
        <>
          <FoundLine>
            unmatched.cards deck{current.user ? ` · by ${current.user}` : ""}
          </FoundLine>
          <Box mt="0.75rem">
            <DeckPreview
              deck={current}
              source="unmatched.cards"
              onSave={save}
              isDisabled={asking}
              prompt={prompt}
            />
          </Box>
          <Box mt="0.75rem">
            <DeckCards decks={[current]} selectedDeckId={current.id} />
          </Box>
        </>
      )}
    </Flex>
  );
};
