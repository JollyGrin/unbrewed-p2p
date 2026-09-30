import {
  Box,
  Flex,
  Link,
  SimpleGrid,
  Text,
  type LinkProps,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useState } from "react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  deckMetaLine,
  refusedChip,
  type DeckPreview,
} from "@/lib/tableplace/preview";
import {
  Cardback,
  FilterChip,
  focusRing,
  SectionHead,
  TILE_RING_OFF,
  TILE_RING_ON,
  TileBadge,
  TileChip,
} from "./galleryParts";

/** A bag deck with what it would put on a table, or why it can't. */
export type DeckEntry = { deck: DeckImportType; preview: DeckPreview };

type Filter = "all" | "ready" | "needs";

const BagLink = (props: LinkProps) => (
  <Link
    as={NextLink}
    href="/bag"
    textDecoration="underline"
    fontWeight={600}
    {...props}
  />
);

const DeckTile = ({
  entry: { deck, preview },
  selected,
  isYou,
  isThem,
  onPick,
}: {
  entry: DeckEntry;
  selected: boolean;
  isYou: boolean;
  isThem: boolean;
  onPick: () => void;
}) => {
  const refused = !!preview.refused;
  return (
    <Flex
      as="button"
      type="button"
      flexDir="column"
      gap="6px"
      minW={0}
      textAlign="left"
      color="brand.secondary"
      borderRadius="8px"
      cursor={refused ? "not-allowed" : "pointer"}
      disabled={refused}
      aria-pressed={refused ? undefined : selected}
      onClick={onPick}
      _focusVisible={focusRing}
      data-testid="deck-tile"
      data-deck={deck.id}
    >
      <Box
        as="span"
        position="relative"
        display="block"
        w="100%"
        borderRadius="8px"
        overflow="hidden"
        boxShadow={refused ? "none" : selected ? TILE_RING_ON : TILE_RING_OFF}
        sx={{ aspectRatio: "5 / 7" }}
      >
        <Cardback
          deck={deck}
          greyed={refused}
          w="100%"
          h="100%"
          fontSize="1.5rem"
        />
        {isYou && <TileBadge left="6px">You</TileBadge>}
        {isThem && (
          <TileBadge right="6px" bg="brand.highlight">
            Them
          </TileBadge>
        )}
        {refused && (
          <TileChip letterSpacing="0.04em" data-testid="deck-reason">
            {refusedChip(preview)}
          </TileChip>
        )}
      </Box>
      <Box
        as="span"
        fontSize="14px"
        fontWeight={700}
        lineHeight={1.2}
        wordBreak="break-word"
      >
        {preview.deckName}
      </Box>
      <Box as="span" fontSize="12.5px" lineHeight={1.25}>
        {deckMetaLine(preview)}
      </Box>
    </Flex>
  );
};

/**
 * Tabs 1 and 2: the bag as tiles, split into the decks that can go on a table
 * and the ones that need card images first. `children` sits above the tiles
 * (tab 2's paste row).
 */
export const DeckGallery = ({
  seat,
  entries,
  yourId,
  theirId,
  onPick,
  children,
}: {
  seat: "you" | "them";
  /** The classified bag; undefined while it is still loading. */
  entries: DeckEntry[] | undefined;
  yourId?: string;
  theirId?: string;
  onPick: (id: string) => void;
  children?: React.ReactNode;
}) => {
  const [filter, setFilter] = useState<Filter>("all");
  const ready = entries?.filter((e) => !e.preview.refused) ?? [];
  const needs = entries?.filter((e) => e.preview.refused) ?? [];
  const seatId = seat === "you" ? yourId : theirId;

  const grid = (list: DeckEntry[]) => (
    <SimpleGrid
      columns={{ base: 3, md: 5, lg: 4, xl: 6 }}
      spacingX={{ base: "10px", lg: "14px" }}
      spacingY="14px"
    >
      {list.map((entry) => (
        <DeckTile
          key={entry.deck.id}
          entry={entry}
          selected={entry.deck.id === seatId}
          isYou={entry.deck.id === yourId}
          isThem={entry.deck.id === theirId}
          onPick={() => onPick(entry.deck.id)}
        />
      ))}
    </SimpleGrid>
  );

  return (
    <Flex flexDir="column" gap="18px">
      {entries && entries.length > 0 && (
        <Flex
          align="center"
          justify="space-between"
          gap="8px 16px"
          flexWrap="wrap"
        >
          <Flex
            gap="8px"
            flexWrap="wrap"
            role="group"
            aria-label="Filter decks"
          >
            <FilterChip
              label="All"
              count={entries.length}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterChip
              label="Table-ready"
              count={ready.length}
              active={filter === "ready"}
              onClick={() => setFilter("ready")}
            />
            <FilterChip
              label="Need images"
              count={needs.length}
              active={filter === "needs"}
              onClick={() => setFilter("needs")}
            />
          </Flex>
          {/* a tap target of its own, not a link in a sentence */}
          <BagLink
            display="inline-flex"
            alignItems="center"
            minH="44px"
            fontSize="13px"
          >
            Add more decks in your bag
          </BagLink>
        </Flex>
      )}

      {children}

      {!entries ? (
        <Text opacity={0.8}>Loading your bag…</Text>
      ) : entries.length === 0 ? (
        <Text data-testid="bag-empty">
          Your bag has no decks yet. <BagLink>Add decks in your bag</BagLink>
          {seat === "them" && ", or paste a link to their deck above"}.
        </Text>
      ) : (
        <>
          {filter !== "needs" && (ready.length > 0 || filter === "ready") && (
            <Flex flexDir="column" gap="10px" data-testid="decks-ready">
              <SectionHead
                title="Ready for the table"
                count={ready.length}
                sub="Every card has a finished image."
              />
              {ready.length > 0 ? (
                grid(ready)
              ) : (
                <Text fontSize="14px">
                  No deck in your bag is table-ready yet.
                </Text>
              )}
            </Flex>
          )}
          {filter !== "ready" && (needs.length > 0 || filter === "needs") && (
            <Flex flexDir="column" gap="10px" data-testid="decks-needs">
              <SectionHead
                title="Need card images first"
                count={needs.length}
                long
                sub={
                  needs.length > 0 && (
                    <span data-testid="needs-how">
                      The table needs a finished image for every card. On
                      unmatched.cards, open the deck in the editor and export it
                      from its <b>TTS JSON</b> tab, then add it in your{" "}
                      <BagLink>bag</BagLink> with{" "}
                      <b>Import from The Unmatched Club</b> (it takes any
                      Tabletop Simulator export).
                    </span>
                  )
                }
              />
              {needs.length > 0 ? (
                grid(needs)
              ) : (
                <Text fontSize="14px">
                  Every deck in your bag is table-ready.
                </Text>
              )}
            </Flex>
          )}
        </>
      )}
    </Flex>
  );
};
