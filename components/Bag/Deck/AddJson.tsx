import { Box, Flex, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { toast } from "react-hot-toast";
import NextLink from "next/link";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useBagDecks, useBagMaps } from "@/lib/bag/useBag";
import { BulkBundle } from "@/lib/bag/bundle";
import { track } from "@/lib/analytics";
import { trackDeckAddFailed } from "@/lib/deckAnalytics";
import { isImportBlocked } from "@/lib/decks/blockedAuthors";
import { InvalidDecksNote, reportInvalidDecks, useReportAllInvalid } from "@/components/Bag/InvalidDecksNote";
import { useReplaceConfirm } from "@/components/Bag/ReplaceDeckConfirm";
import { DeckPreview, goldButton } from "@/components/Bag/AddDeckHub/DeckPreview";
import { FoundLine } from "@/components/Bag/AddDeckHub/FoundLine";
import { Button } from "@chakra-ui/react";

/**
 * Deck JSON from the paste bar (#1538), already recognised by
 * `normalizeBundle`: a single deck previews and ends in a table like any
 * fetched deck; a backup bundle (several decks, or maps) imports whole, as
 * the Backup & Share tab does.
 */
export const AddJson = ({
  bundle,
  onAdded,
}: {
  bundle: BulkBundle;
  onAdded?: (deckId: string) => void;
}) => {
  const { decks, pushDeck, setStar, importDecks } = useBagDecks();
  const { data: maps, importMaps } = useBagMaps();
  const { confirmReplace, asking, prompt } = useReplaceConfirm();

  // A backup that also held malformed decks takes the backup path, so the
  // skipped ones are reported (#1609).
  const single =
    bundle.decks.length === 1 && bundle.maps.length === 0 && !bundle.invalidDecks
      ? bundle.decks[0]
      : undefined;

  const saveSingle = async (): Promise<string | undefined> => {
    if (!single) return undefined;
    // storage full, a blocked author, or the player kept their edited copy — already toasted
    if (!(await pushDeck(single, { confirmReplace, source: "json" }))) return undefined;
    setStar(single.id);
    toast.success(`${single.name ?? "Deck"} saved & ready to play`);
    onAdded?.(single.id);
    return single.id;
  };

  useReportAllInvalid(bundle);
  const existingDeckIds = useMemo(() => new Set((decks ?? []).map((d) => d.id)), [decks]);
  const existingMapUrls = useMemo(() => new Set(maps.map((m) => m.imgUrl)), [maps]);
  const newDecks = bundle.decks.filter((deck) => !existingDeckIds.has(deck.id));
  const newMaps = bundle.maps.filter((map) => !existingMapUrls.has(map.imgUrl));

  const importAll = async () => {
    reportInvalidDecks(bundle);
    const addedDecks = await importDecks(newDecks);
    const addedMaps = await importMaps(newMaps);
    // One event per import, not per deck (#1512).
    if (addedDecks > 0) track("deck_added", { source: "bulk", deck_count: addedDecks });
    else if (newDecks.length > 0) {
      trackDeckAddFailed(
        "bulk",
        newDecks.every(isImportBlocked) ? "blocked_author" : "storage_refused",
      );
    }
    if (addedDecks + addedMaps === 0 && newDecks.length + newMaps.length > 0) return;
    toast.success(`Imported ${addedDecks} decks and ${addedMaps} maps`);
    const first = newDecks[0] as DeckImportType | undefined;
    if (first) onAdded?.(first.id);
  };

  if (single) {
    return (
      <Flex direction="column" color="brand.secondary">
        <FoundLine>a deck&apos;s JSON</FoundLine>
        <Box mt="0.75rem">
          <DeckPreview
            deck={single}
            source="Deck JSON"
            onSave={saveSingle}
            isDisabled={asking}
            prompt={prompt}
          />
        </Box>
      </Flex>
    );
  }

  const total = newDecks.length + newMaps.length;
  return (
    <Flex direction="column" color="brand.secondary">
      <FoundLine>
        a backup · {bundle.decks.length} {bundle.decks.length === 1 ? "deck" : "decks"}
        {bundle.maps.length > 0 && ` · ${bundle.maps.length} ${bundle.maps.length === 1 ? "map" : "maps"}`}
      </FoundLine>
      <Text fontSize="0.85rem" mt="0.4rem" opacity={0.85}>
        {bundle.decks
          .slice(0, 12)
          .map((deck) => deck.name + (existingDeckIds.has(deck.id) ? " (in bag)" : ""))
          .join(" · ")}
        {bundle.decks.length > 12 && ` · +${bundle.decks.length - 12} more`}
      </Text>
      <InvalidDecksNote bundle={bundle} />
      <Flex mt="0.75rem" gap="0.75rem" align="center" flexWrap="wrap">
        <Button {...goldButton} isDisabled={total === 0} onClick={importAll}>
          Import {total} new {total === 1 ? "item" : "items"}
        </Button>
        <Text fontSize="0.82rem" opacity={0.8}>
          Backups can also be restored from{" "}
          <NextLink href="/bag?tab=2" style={{ textDecoration: "underline" }}>
            Backup &amp; Share
          </NextLink>
          .
        </Text>
      </Flex>
    </Flex>
  );
};
