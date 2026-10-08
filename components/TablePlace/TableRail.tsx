import {
  Box,
  Flex,
  Image,
  Link,
  ListItem,
  OrderedList,
  Spinner,
  Text,
  type BoxProps,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { forwardRef } from "react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import type { TableMapOption } from "@/lib/tableplace/mapList";
import {
  NO_TABLE_IMAGES,
  seatLines,
  type DeckPreview,
} from "@/lib/tableplace/preview";
import { colors } from "@/styles/style";
import {
  Cardback,
  Eyebrow,
  focusRing,
  SHORT_SCREEN,
  type TableTab,
} from "./galleryParts";

const IDLE_BORDER = "rgba(231,204,152,0.28)";
const SLOT_BG = "rgba(241,224,193,0.07)";
/** The board's edge, then the shadow it throws on the table. */
const BOARD_SHADOW = `0 14px 0 -1px ${colors.brand.surfaceDim}, 0 30px 30px rgba(0,0,0,0.45)`;

/** Shown on the rail only: the strip's cells have no room for them. */
const railOnly = { base: "none", lg: "block" };

/** The map's kind, as the rail says it under the map's name. */
export const mapKindLine = (map: Pick<TableMapOption, "group" | "spaces">) =>
  map.group === "pro"
    ? "Pro board · figures snap to spaces"
    : map.spaces
      ? "Figures snap to spaces"
      : "Image only · place figures freely";

const Plus = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** One of the rail's three buttons; below `lg` a cell of the strip. */
const Slot = ({
  tab,
  active,
  onTab,
  children,
  ...rest
}: {
  tab: TableTab;
  active: boolean;
  onTab: (tab: TableTab) => void;
} & BoxProps) => (
  <Flex
    as="button"
    type="button"
    aria-pressed={active}
    onClick={() => onTab(tab)}
    w="100%"
    minW={0}
    minH="44px"
    borderRadius={{ base: "10px", lg: "12px" }}
    border="2px solid"
    borderColor={active ? "brand.accent" : IDLE_BORDER}
    color="brand.highlight"
    _focusVisible={focusRing}
    data-testid={`slot-${tab}`}
    {...rest}
  >
    {children}
  </Flex>
);

/** A slot's words: the eyebrow (short on the strip), the name, the lines under it. */
const SlotText = ({
  short,
  long,
  name,
  lines = [],
  ...rest
}: {
  short: string;
  long: string;
  name: string;
  lines?: string[];
} & BoxProps) => (
  <Flex as="span" flexDir="column" gap="3px" minW={0} maxW="100%" {...rest}>
    <Eyebrow color="brand.primary">
      <Box as="span" display={{ base: "inline", lg: "none" }}>
        {short}
      </Box>
      <Box as="span" display={{ base: "none", lg: "inline" }}>
        {long}
      </Box>
    </Eyebrow>
    <Text
      as="span"
      fontSize={{ base: "13px", lg: "19px" }}
      fontWeight={700}
      lineHeight={{ base: 1.2, lg: 1.15 }}
      wordBreak="break-word"
      noOfLines={3}
      data-testid="slot-name"
    >
      {name}
    </Text>
    {lines.filter(Boolean).map((line) => (
      <Box
        as="span"
        key={line}
        display={railOnly}
        fontSize="13px"
        color="brand.primary"
      >
        {line}
      </Box>
    ))}
  </Flex>
);

const thumb = {
  w: { base: "46px", lg: "64px" },
  h: { base: "64px", lg: "90px" },
  borderRadius: { base: "4px", lg: "6px" },
  sx: { [SHORT_SCREEN]: { width: "46px", height: "64px" } },
};

export type SeatState = "loading" | "failed";

const DeckSlot = ({
  seat,
  active,
  onTab,
  deck,
  preview,
  state,
  order,
}: {
  seat: "you" | "them";
  active: boolean;
  onTab: (tab: TableTab) => void;
  deck?: DeckImportType;
  preview?: DeckPreview;
  state?: SeatState;
  order: BoxProps["order"];
}) => {
  const you = seat === "you";
  const empty =
    state === "loading"
      ? you
        ? ["Importing your deck…", "Fetching the deck from your invite link"]
        : ["Loading their deck…", "Fetching the deck from that link"]
      : state === "failed"
        ? ["Couldn't load that deck", "Pick one from your bag instead"]
        : you
          ? ["Pick your deck", "Anything table-ready in your bag"]
          : ["Pick their deck", "Anything in your bag, or paste a link"];
  return (
    <Slot
      tab={seat}
      active={active}
      onTab={onTab}
      order={order}
      flexDir={{ base: "column", lg: "row" }}
      alignItems="center"
      gap={{ base: "4px", lg: "14px" }}
      p={{ base: "8px 4px", lg: "10px" }}
      bg={SLOT_BG}
    >
      {deck && preview ? (
        <Cardback deck={deck} {...thumb} />
      ) : (
        <Flex
          as="span"
          {...thumb}
          flexShrink={0}
          align="center"
          justify="center"
          border="2px dashed"
          borderColor={state === "failed" ? "brand.danger" : "brand.primary"}
          color="brand.primary"
        >
          {state === "loading" ? <Spinner size="sm" /> : <Plus />}
        </Flex>
      )}
      <SlotText
        short={you ? "You" : "Them"}
        long={you ? "Your side · your deck" : "Across the table · their deck"}
        name={deck && preview ? preview.deckName : empty[0]}
        lines={deck && preview ? seatLines(preview) : [empty[1]]}
        alignItems={{ base: "center", lg: "flex-start" }}
        textAlign={{ base: "center", lg: "left" }}
      />
    </Slot>
  );
};

const mapBox = {
  display: "block",
  w: { base: "85px", lg: "236px" },
  h: { base: "64px", lg: "177px" },
  borderRadius: { base: "4px", lg: "8px" },
  transform: { base: "none", lg: "rotateX(50deg)" },
  transformOrigin: "center 40%",
  sx: { [SHORT_SCREEN]: { width: "152px", height: "114px" } },
};

const MapSlot = ({
  active,
  onTab,
  map,
  mapCount,
  order,
}: {
  active: boolean;
  onTab: (tab: TableTab) => void;
  map?: TableMapOption;
  mapCount: number;
  order: BoxProps["order"];
}) => (
  <Slot
    tab="map"
    active={active}
    onTab={onTab}
    order={order}
    flexDir="column"
    alignItems="center"
    gap={{ base: "4px", lg: "2px" }}
    p={{ base: "8px 4px", lg: "0 10px 12px" }}
    bg={{ base: SLOT_BG, lg: "transparent" }}
  >
    {/* The board lies on the table: tilted away from you, with an edge. */}
    <Box
      as="span"
      display="block"
      h={{ base: "64px", lg: "158px" }}
      sx={{
        perspective: { base: "none", lg: "600px" },
        [SHORT_SCREEN]: { height: "100px" },
      }}
    >
      {map ? (
        <Image
          src={map.thumbUrl ?? map.imgUrl}
          alt=""
          objectFit="cover"
          boxShadow={{ base: "none", lg: BOARD_SHADOW }}
          {...mapBox}
        />
      ) : (
        <Box
          as="span"
          border={{ base: "2px dashed", lg: "3px dashed" }}
          borderColor="brand.primary"
          {...mapBox}
        />
      )}
    </Box>
    <SlotText
      short="Map"
      long="The table"
      name={map ? map.label : "Pick a map"}
      lines={[
        map ? mapKindLine(map) : `Pro boards first, ${mapCount} to choose from`,
      ]}
      alignItems="center"
      textAlign="center"
    />
  </Slot>
);

/** A line under a slot. On the strip it runs under all three cells. */
const SlotNote = (props: BoxProps) => (
  <Box
    gridColumn="1 / -1"
    px="4px"
    fontSize="13px"
    lineHeight={1.4}
    color="brand.highlight"
    {...props}
  />
);

/** Why a seat's deck can't go on the table, and how to bring it in so it can. */
export const SeatRefusal = ({
  seat,
  preview,
  ...rest
}: { seat: "you" | "them"; preview: DeckPreview } & BoxProps) =>
  preview.refused ? (
    <SlotNote {...rest}>
      <Text color="brand.danger" fontWeight={600} role="alert">
        {seat === "you" ? "Your deck" : "Their deck"} can&apos;t go on the
        table: {preview.refused}
      </Text>
      {preview.refused === NO_TABLE_IMAGES && (
        <Box as="details" mt="2px" data-testid="tts-how">
          <Text
            as="summary"
            cursor="pointer"
            fontWeight={600}
            py={{ base: "13px", lg: "2px" }}
          >
            How?
          </Text>
          <OrderedList mt="0.25rem" ml="1.25rem" spacing="0.15rem">
            <ListItem>
              On unmatched.cards, open the deck in the editor and use its{" "}
              <b>TTS JSON</b> tab to export it for Tabletop Simulator.
            </ListItem>
            <ListItem>
              In your{" "}
              <Link as={NextLink} href="/bag" textDecoration="underline">
                bag
              </Link>
              , add it with <b>Import from The Unmatched Club</b> (it takes any
              TTS export).
            </ListItem>
            <ListItem>Pick that deck here.</ListItem>
          </OrderedList>
        </Box>
      )}
    </SlotNote>
  ) : null;

type Seat = { deck?: DeckImportType; preview?: DeckPreview; state?: SeatState };
type TableRailProps = {
  tab: TableTab;
  onTab: (tab: TableTab) => void;
  your: Seat;
  their: Seat;
  map?: TableMapOption;
  mapCount: number;
  /** The picked map's image couldn't be loaded. */
  mapFailed: boolean;
} & BoxProps;

/**
 * The table being built: their deck across it, the map on it, your deck on
 * your side. Each slot opens its gallery. Below `lg` it is a three-cell strip
 * (You · Map · Them) and the page's tab control.
 */
export const TableRail = forwardRef<HTMLDivElement, TableRailProps>(
  ({ tab, onTab, your, their, map, mapCount, mapFailed, ...rest }, ref) => (
    <Box
      ref={ref}
      display="grid"
      gridTemplateColumns={{
        base: "repeat(3, minmax(0, 1fr))",
        lg: "minmax(0, 1fr)",
      }}
      gap={{ base: "6px", lg: "10px" }}
      p={{ base: "8px", lg: "14px" }}
      bg="brand.surface"
      borderRadius={{ base: "14px", lg: "18px" }}
      role="group"
      aria-label="Your table"
      {...rest}
    >
      <DeckSlot
        seat="them"
        active={tab === "them"}
        onTab={onTab}
        {...their}
        order={{ base: 3, lg: 1 }}
      />
      {their.preview && (
        <SeatRefusal
          seat="them"
          preview={their.preview}
          order={{ base: 6, lg: 2 }}
        />
      )}

      <MapSlot
        active={tab === "map"}
        onTab={onTab}
        map={map}
        mapCount={mapCount}
        order={{ base: 2, lg: 3 }}
      />
      {map?.labsSlug && !map.layout && (
        <SlotNote order={{ base: 5, lg: 4 }} data-testid="map-no-layout">
          This map came from Unmatched Labs before we kept its spaces, so
          figures won&apos;t snap to them. Import the set again from Labs to get
          snapping spaces.
        </SlotNote>
      )}
      {mapFailed && (
        <SlotNote
          order={{ base: 5, lg: 4 }}
          color="brand.danger"
          fontWeight={600}
          role="alert"
        >
          Couldn&apos;t load this map&apos;s image. Pick another.
        </SlotNote>
      )}

      <DeckSlot
        seat="you"
        active={tab === "you"}
        onTab={onTab}
        {...your}
        order={{ base: 1, lg: 5 }}
      />
      {your.preview && (
        <SeatRefusal
          seat="you"
          preview={your.preview}
          order={{ base: 4, lg: 6 }}
        />
      )}
    </Box>
  ),
);
TableRail.displayName = "TableRail";
