import { useEffect, useMemo, useState } from "react";
import { Box, Button, Checkbox, Flex, Text } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { BagDeckView, useBagMaps } from "@/lib/bag/useBag";
import { useReplaceConfirm } from "@/components/Bag/ReplaceDeckConfirm";
import { DeckCards } from "@/components/Bag/Deck/DeckCards";
import { failureReason, trackDeckAddFailed } from "@/lib/deckAnalytics";
import { DeckPreview } from "./DeckPreview";
import { FoundLine } from "./FoundLine";
import { LabsSkippedSummary } from "./LabsSkipped";
import { LabsUnsupportedWarning } from "./LabsUnsupported";
import {
  LABS_ERROR_MESSAGES,
  LabsImport,
  LabsImportError,
  LabsLoadedSet,
  LabsUnsupportedFeature,
  addLabsMap,
  buildLabsImport,
  defaultLabsCharacter,
  fetchLabsSet,
  labsImportedText,
  listLabsHeroes,
  withoutSkippedMap,
} from "@/lib/labs";

/**
 * An Unmatched Labs set or character link from the paste bar (#1538): fetch
 * it at once, preview the mapped deck (with hero pills when the set has
 * several), and end in a table — Solo table, Invite a friend, or Save for
 * later. The map checkbox (#1002), the skipped summary (#1000) and the
 * replace-confirm step (#1033) are unchanged; the unsupported-card warning
 * (#978) is a non-blocking note under the buttons.
 */
export const LabsPanel = ({
  link,
  pushDeck,
  setStar,
  onAdded,
  onOpenImages,
}: {
  /** the pasted link; fetched whenever it changes */
  link: string;
  pushDeck: BagDeckView["pushDeck"];
  setStar: (id: string) => void;
  onAdded?: (deckId: string) => void;
  /** switch the hub to the card-image import (the TTS-export fallback) */
  onOpenImages?: () => void;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState<LabsLoadedSet>();
  const [characterId, setCharacterId] = useState<string>();
  // Off by default; adds the set's map to the player's maps on save (#1002).
  const [addMap, setAddMap] = useState(false);
  const bagMaps = useBagMaps();
  const { confirmReplace, asking, prompt } = useReplaceConfirm();

  const heroes = useMemo(
    () => (loaded ? listLabsHeroes(loaded.row.document.set) : []),
    [loaded],
  );
  const built = useMemo((): LabsImport | { error: string; cause: unknown } | undefined => {
    if (!loaded || !characterId) return undefined;
    try {
      return buildLabsImport(loaded, characterId);
    } catch (err) {
      return { error: messageOf(err), cause: err };
    }
  }, [loaded, characterId]);
  useEffect(() => {
    if (built && "error" in built) trackDeckAddFailed("unmatched-labs", failureReason(built.cause));
  }, [built]);
  const result = built && "deck" in built ? built : undefined;
  const shownError = error ?? (built && "error" in built ? built.error : undefined);

  useEffect(() => {
    let cancelled = false;
    setLoaded(undefined);
    setCharacterId(undefined);
    setError(undefined);
    setAddMap(false);
    if (!link.trim()) return;
    setIsLoading(true);
    void (async () => {
      try {
        const next = await fetchLabsSet(link);
        if (cancelled) return;
        setLoaded(next);
        // A set with several heroes previews its first; the pills swap it.
        setCharacterId(
          defaultLabsCharacter(next) ?? listLabsHeroes(next.row.document.set)[0]?.id,
        );
      } catch (err) {
        if (cancelled) return;
        setError(messageOf(err));
        trackDeckAddFailed("unmatched-labs", failureReason(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [link]);

  const save = async (): Promise<string | undefined> => {
    if (!result) return undefined;
    const { deck } = result;
    // blocked author, storage full, or the player kept their edited copy — already toasted
    const skipped = addMap && result.map ? withoutSkippedMap(result.skipped) : result.skipped;
    const saved = await pushDeck(deck, {
      confirmReplace,
      source: "unmatched-labs",
      addedProps: {
        labs_unsupported_count: result.unsupported.length,
        labs_skipped_count: skipped.reduce((n, s) => n + s.count, 0),
      },
    });
    if (!saved) return undefined;
    setStar(deck.id);
    toast.success(`${deck.name} saved & ready to play`);
    if (addMap && result.map) {
      // A republished set's map has a new url: replace the older copy (#1029).
      if (await addLabsMap(result.map.map, bagMaps)) {
        toast.success(`${result.map.map.meta?.title ?? "Map"} added to your maps`);
      }
    }
    onAdded?.(deck.id);
    return deck.id;
  };

  const setName = loaded?.row.name;
  const author = result?.author ?? loaded?.author;

  return (
    <Flex direction="column" color="brand.secondary">
      {isLoading && <FoundLine tone="working">Fetching from Unmatched Labs…</FoundLine>}
      {loaded && (
        <FoundLine>
          Unmatched Labs {heroes.length > 1 ? "set" : "deck"}
          {heroes.length > 1 ? ` · ${heroes.length} heroes` : ""}
          {author ? ` · by ${author}` : ""}
        </FoundLine>
      )}
      {shownError && (
        <Box
          role="alert"
          mt="0.5rem"
          p="0.75rem"
          borderRadius="0.5rem"
          bg="red.50"
          border="1px solid"
          borderColor="red.300"
          color="red.800"
          fontSize="0.9rem"
          maxW="560px"
        >
          {shownError}
        </Box>
      )}

      {loaded && heroes.length > 1 && !result && !shownError && (
        <Text fontSize="0.9rem" mt="0.5rem">
          <b>{setName}</b> has {heroes.length} heroes — pick one:
        </Text>
      )}

      {result && (
        <Box mt="0.75rem">
          <DeckPreview
            deck={result.deck}
            source={`Unmatched Labs · ${result.setName}`}
            heroes={heroes}
            characterId={characterId}
            onPickHero={setCharacterId}
            onSave={save}
            isDisabled={asking}
            prompt={prompt}
            note={
              result.unsupported.length > 0 ? (
                <UnsupportedNote
                  deckName={result.deck.name}
                  unsupported={result.unsupported}
                  onOpenImages={onOpenImages}
                />
              ) : undefined
            }
          >
            {result.map && (
              <Checkbox
                mt="0.75rem"
                colorScheme="purple"
                isChecked={addMap}
                onChange={(e) => setAddMap(e.target.checked)}
              >
                <Text fontSize="0.9rem">
                  Also add this set&apos;s map ({result.map.name}) to my maps
                </Text>
              </Checkbox>
            )}
            <Box mt="0.75rem" maxW="620px">
              <LabsSkippedSummary
                skipped={addMap && result.map ? withoutSkippedMap(result.skipped) : result.skipped}
                imported={labsImportedText(result.deck, addMap && !!result.map)}
                sourceUrl={result.deck.sourceUrl}
              />
            </Box>
          </DeckPreview>
          <Box mt="0.75rem">
            <DeckCards decks={[result.deck]} selectedDeckId={result.deck.id} />
          </Box>
        </Box>
      )}
      {loaded && heroes.length > 1 && !result && (
        <Flex gap="0.4rem" flexWrap="wrap" mt="0.4rem">
          {heroes.map((hero) => (
            <Button
              key={hero.id}
              size="sm"
              variant="outline"
              colorScheme="purple"
              onClick={() => setCharacterId(hero.id)}
            >
              {hero.name}
            </Button>
          ))}
        </Flex>
      )}
    </Flex>
  );
};

/**
 * "Heads up: 2 cards use effects our template can't draw. They'll show as
 * text, and you can still play." — with the full warning (#978) behind a
 * details toggle, for the TTS-export route to real card art.
 */
const UnsupportedNote = ({
  deckName,
  unsupported,
  onOpenImages,
}: {
  deckName: string;
  unsupported: LabsUnsupportedFeature[];
  onOpenImages?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const cards = new Set(unsupported.flatMap((f) => f.cards)).size;
  const count = cards > 0 ? `${cards} ${cards === 1 ? "card uses" : "cards use"}` : "Some cards use";
  return (
    <Box data-testid="labs-unsupported-note">
      <Text>
        <Text as="b" color="#A8720A">
          Heads up:
        </Text>{" "}
        {count} effects our template can&apos;t draw. They&apos;ll show as
        text, and you can still play.{" "}
        <Button
          variant="link"
          size="sm"
          fontSize="0.82rem"
          color="brand.secondary"
          textDecoration="underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide details" : "Details"}
        </Button>
      </Text>
      {open && (
        <Box mt="0.5rem">
          <LabsUnsupportedWarning
            deckName={deckName}
            unsupported={unsupported}
            onOpenImages={onOpenImages}
          />
        </Box>
      )}
    </Box>
  );
};

const messageOf = (err: unknown) =>
  err instanceof LabsImportError ? err.message : LABS_ERROR_MESSAGES.network;
