import { Box, Flex, Image, Text, type BoxProps } from "@chakra-ui/react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { colors } from "@/styles/style";

/** The three things a table needs, and the gallery that picks each. */
export type TableTab = "you" | "them" | "map";

/** Keyboard focus on the page's own buttons (tabs, tiles, slots, chips). */
export const focusRing = {
  outline: "3px solid",
  outlineColor: "brand.accentDeep",
  outlineOffset: "2px",
};

export const TILE_RING_ON = `0 0 0 3px ${colors.brand.accent}, 0 8px 24px rgba(44,24,49,0.5)`;
/** A desktop screen too short for the whole rail: its slots shrink to fit. */
export const SHORT_SCREEN = "@media (min-width: 62em) and (max-height: 820px)";

export const TILE_RING_OFF = "0 2px 8px rgba(44,24,49,0.35)";

/** The small caps line: slot eyebrows, tile badges, counts. */
export const Eyebrow = (props: BoxProps) => (
  <Box
    as="span"
    fontFamily="ArchivoNarrow"
    fontSize="12px"
    fontWeight={600}
    letterSpacing="0.08em"
    textTransform="uppercase"
    {...props}
  />
);

/** A badge in a tile's corner ("Pro", "You", "Them"). */
export const TileBadge = ({ children, ...rest }: BoxProps) => (
  <Eyebrow
    position="absolute"
    top="6px"
    px="7px"
    py="2px"
    borderRadius="4px"
    bg="brand.accent"
    color="brand.surfaceDim"
    fontWeight={700}
    {...rest}
  >
    {children}
  </Eyebrow>
);

/** The strip along a tile's bottom edge ("On the table", a refusal reason). */
export const TileChip = ({ children, ...rest }: BoxProps) => (
  <Eyebrow
    position="absolute"
    left="6px"
    right="6px"
    bottom="6px"
    p="4px 6px"
    borderRadius="4px"
    bg="brand.surfaceDim"
    color="brand.highlight"
    letterSpacing="0.06em"
    textAlign="center"
    {...rest}
  >
    {children}
  </Eyebrow>
);

/** A filter chip with its count, e.g. "Pro boards 14". */
export const FilterChip = ({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) => (
  <Box
    as="button"
    type="button"
    aria-pressed={active}
    onClick={onClick}
    flexShrink={0}
    minH="44px"
    px={{ base: "13px", lg: "16px" }}
    borderRadius="999px"
    border="1.5px solid"
    borderColor="brand.secondary"
    bg={active ? "brand.secondary" : "transparent"}
    color={active ? "brand.highlight" : "brand.secondary"}
    fontSize="14px"
    fontWeight={600}
    _focusVisible={focusRing}
  >
    {label} {count}
  </Box>
);

/**
 * A gallery section's heading: title, count, one line about it, an action.
 * The line shares the heading's row where there is room (`xl`), unless it is
 * `long`; otherwise it runs under it.
 */
export const SectionHead = ({
  title,
  count,
  sub,
  long,
  action,
}: {
  title: string;
  count?: number;
  sub?: React.ReactNode;
  long?: boolean;
  action?: React.ReactNode;
}) => (
  <Flex align="baseline" columnGap="10px" flexWrap="wrap">
    <Text as="h2" fontSize="18px" fontWeight={700}>
      {title}
    </Text>
    {count !== undefined && (
      <Text
        as="span"
        fontFamily="ArchivoNarrow"
        fontSize="14px"
        fontWeight={700}
      >
        {count}
      </Text>
    )}
    {sub && (
      <Text
        order={{ base: 1, xl: long ? 1 : 0 }}
        flex={{ base: "1 0 100%", xl: long ? "1 0 100%" : "1 1 0" }}
        fontSize="13px"
        lineHeight={1.4}
      >
        {sub}
      </Text>
    )}
    {action && <Box ml="auto">{action}</Box>}
  </Flex>
);

/**
 * A deck's cardback, or what `SelectedDeckContainer` falls back to when it
 * has none: the deck's highlight colour and its initials.
 */
export const Cardback = ({
  deck,
  greyed,
  ...rest
}: { deck: DeckImportType; greyed?: boolean } & BoxProps) => {
  const look = deck.deck_data?.appearance;
  return (
    <Flex
      as="span"
      align="center"
      justify="center"
      overflow="hidden"
      flexShrink={0}
      bg={
        greyed
          ? "brand.surfaceDim"
          : (look?.highlightColour ?? "brand.secondary")
      }
      {...rest}
    >
      {look?.cardbackUrl ? (
        <Image
          src={look.cardbackUrl}
          alt=""
          loading="lazy"
          w="100%"
          h="100%"
          objectFit="cover"
          {...(greyed ? { filter: "grayscale(1)", opacity: 0.4 } : {})}
        />
      ) : (
        <Box
          as="span"
          fontFamily="monospace"
          fontSize="1.5em"
          color={look?.borderColour ?? "brand.primary"}
          opacity={greyed ? 0.5 : 1}
        >
          {deck.name.substring(0, 2)}
        </Box>
      )}
    </Flex>
  );
};
