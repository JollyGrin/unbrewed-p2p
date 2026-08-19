/**
 * The hero picker on /collection (ticket #625, design doc §4f).
 *
 * It replaces a `<select>`. The dropdown was correct and unreadable: a player
 * with 25 heroes could not see which of them had points without opening the
 * list and reading it one option at a time, and "where are my points?" is the
 * question this page exists to answer. So every row states its own numbers at
 * REST — no hover, no click, no tooltip — and the list is ordered so the rows
 * that matter are the ones you land on (`lib/collection/picker.ts`).
 *
 * Three decisions worth keeping:
 *
 *  - **The rim is the real `FighterTokenRim`**, painted on a token-shaped disc
 *    the same way the board and the preview panel paint it. A mock gradient
 *    here would drift from the ladder the day someone re-tunes it, and this
 *    row is a player's answer to "what am I actually wearing on that hero?".
 *  - **Buttons, not a listbox.** A `role="listbox"` owes the user arrow-key
 *    roving and typeahead; a column of buttons is keyboard- and
 *    screen-reader-complete for free, and each button's accessible name
 *    already reads "Thrall, 900 earned, 700 available, silver rim".
 *  - **Zero-point heroes collapse.** They are a lookup ("what could I start
 *    earning on?"), not a status board, so they sit behind one disclosure —
 *    which opens by default when there is nothing above it, because an empty
 *    picker on a fresh account would look broken rather than new.
 *
 * ⛔ THE INVARIANT — nothing here touches the engine. It picks which hero the
 * page is talking about, and paints chrome.
 */
import { useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";

import { FighterTokenRim } from "@/components/Pro/FighterTokenRim";
import { tokenInitials } from "@/components/Pro/FighterTokenPortrait";
import { HeroPickerRow, HeroPickerSections } from "@/lib/collection/picker";
import { COSMETIC_RIM_PAINTS } from "@/lib/pro/cosmetics";

/** A number the API knows, or the em dash the rest of the page uses for "?". */
const points = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString();

/**
 * A mini fighter token: seat disc, initials, and the hero's real rim. Small
 * enough to sit in a list row, large enough that the rim's band (~11% of the
 * diameter) is still a band — see `COSMETIC_RIM_MIN_PX`.
 */
const RimDisc = ({ row }: { row: HeroPickerRow }) => (
  <Flex
    data-testid={`hero-rim-${row.hero.heroId}`}
    data-cosmetic-tier={row.rim ?? "none"}
    position="relative"
    align="center"
    justify="center"
    flexShrink={0}
    w="2.1rem"
    h="2.1rem"
    borderRadius="50%"
    bg="rgba(72, 40, 79, 0.16)"
    border="1px solid rgba(72, 40, 79, 0.25)"
  >
    {row.rim && <FighterTokenRim tier={row.rim} />}
    <Text fontSize="0.62rem" fontWeight="bold" opacity={0.85}>
      {tokenInitials(row.hero.name)}
    </Text>
  </Flex>
);

const HeroRow = ({
  row,
  selected,
  onSelect,
}: {
  row: HeroPickerRow;
  selected: boolean;
  onSelect: (heroId: string) => void;
}) => {
  // `null` rim with unknown points is an outage, not a bare token: during one
  // the API reports no tier at all, and "No rim" would be a claim we can't
  // make about somebody who may well be wearing gold.
  const rimLabel = row.rim
    ? `${COSMETIC_RIM_PAINTS[row.rim].label} rim`
    : row.earned === null
      ? "Rim unavailable"
      : "No rim";
  return (
    <Flex
      as="button"
      type="button"
      // The tier the row is wearing and whether it is the current pick, both
      // legible to a test (and to devtools) without reading a gradient.
      data-testid={`hero-row-${row.hero.heroId}`}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      onClick={() => onSelect(row.hero.heroId)}
      w="100%"
      textAlign="left"
      align="center"
      gap="0.6rem"
      px="0.55rem"
      py="0.45rem"
      borderRadius="0.5rem"
      border="1px solid"
      borderColor={selected ? "brand.accent" : "transparent"}
      bg={selected ? "rgba(224, 168, 46, 0.18)" : "transparent"}
      _hover={{ bg: selected ? "rgba(224, 168, 46, 0.22)" : "rgba(72, 40, 79, 0.08)" }}
    >
      <RimDisc row={row} />
      <Box flex="1" minW={0}>
        <Text fontSize="0.85rem" fontWeight={selected ? 700 : 600} noOfLines={1}>
          {row.hero.name}
          {row.hero.lab && (
            <Text as="span" fontSize="0.7rem" opacity={0.65} fontWeight={400}>
              {" "}
              (lab)
            </Text>
          )}
        </Text>
        {/* Every number this row has, at rest — the whole point of #625. */}
        <Text fontSize="0.72rem" opacity={0.75}>
          {points(row.earned)} earned · {points(row.available)} available · {rimLabel}
        </Text>
      </Box>
    </Flex>
  );
};

export interface HeroPickerProps {
  sections: HeroPickerSections;
  selectedHeroId: string | null;
  onSelect: (heroId: string) => void;
}

export const HeroPicker = ({ sections, selectedHeroId, onSelect }: HeroPickerProps) => {
  const { ranked, more } = sections;
  // Nothing above it = nothing to disclose. A brand-new account opens straight
  // into the roster instead of a heading and a closed drawer.
  const [open, setOpen] = useState(ranked.length === 0);
  const rowsOf = (rows: HeroPickerRow[]) =>
    rows.map((row) => (
      <HeroRow
        key={row.hero.heroId}
        row={row}
        selected={row.hero.heroId === selectedHeroId}
        onSelect={onSelect}
      />
    ));

  return (
    <Box
      data-testid="collection-hero-picker"
      mb="0.9rem"
      aria-labelledby="collection-hero-heading"
      as="section"
    >
      <Text
        id="collection-hero-heading"
        as="h2"
        fontSize="0.75rem"
        textTransform="uppercase"
        letterSpacing="0.06em"
        opacity={0.7}
        mb="0.3rem"
      >
        Hero
      </Text>
      <Box
        // Scrolls rather than growing: 25+ heroes must not push the points,
        // the rim panel and the card grid off the first screen.
        maxH={{ base: "14rem", sm: "17rem" }}
        overflowY="auto"
        border="1px solid rgba(72, 40, 79, 0.25)"
        borderRadius="0.6rem"
        p="0.35rem"
        sx={{ overscrollBehavior: "contain" }}
      >
        {ranked.length === 0 && (
          <Text fontSize="0.78rem" opacity={0.7} px="0.55rem" py="0.4rem">
            No points yet — play a Pro game and the hero you piloted shows up here.
          </Text>
        )}
        {rowsOf(ranked)}
        {open && rowsOf(more)}
      </Box>
      {more.length > 0 && (
        // OUTSIDE the scroll box on purpose: a disclosure a player has to
        // scroll a list to discover is a disclosure nobody opens.
        <Flex
          as="button"
          type="button"
          data-testid="collection-more-decks"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          align="center"
          gap="0.4rem"
          mt="0.35rem"
          px="0.2rem"
          fontSize="0.75rem"
          textTransform="uppercase"
          letterSpacing="0.06em"
          opacity={0.75}
          _hover={{ opacity: 1 }}
        >
          <Text as="span">{open ? "▾" : "▸"}</Text>
          <Text as="span">
            {open ? "Hide" : "More"} decks ({more.length})
          </Text>
        </Flex>
      )}
    </Box>
  );
};
