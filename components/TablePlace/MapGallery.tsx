import { Box, Flex, Image, Input, SimpleGrid, Text } from "@chakra-ui/react";
import { useState } from "react";
import {
  groupMapList,
  isSpacesMap,
  MAP_GROUPS,
  type MapGroup,
  type TableMapOption,
} from "@/lib/tableplace/mapList";
import {
  FilterChip,
  focusRing,
  SectionHead,
  TILE_RING_OFF,
  TILE_RING_ON,
  TileBadge,
  TileChip,
} from "./galleryParts";

type Filter = "all" | "pro" | "spaces" | "image";

/** Tiles per row, and so how many a collapsed group shows. */
const COLUMNS = { base: 3, md: 4, xl: 5 };
const ROW = COLUMNS.xl;

const isPro = (m: TableMapOption) => m.group === "pro";
const FILTERS: {
  id: Filter;
  label: string;
  test: (m: TableMapOption) => boolean;
}[] = [
  { id: "all", label: "All", test: () => true },
  { id: "pro", label: "Pro boards", test: isPro },
  {
    id: "spaces",
    label: "Snaps to spaces",
    test: (m) => !isPro(m) && isSpacesMap(m),
  },
  {
    id: "image",
    label: "Image only",
    test: (m) => !isPro(m) && !isSpacesMap(m),
  },
];

const GROUPS: Record<MapGroup, { title: string; sub?: string; folds?: true }> =
  {
    pro: {
      title: "Pro boards",
      sub: "The boards Unbrewed Pro plays on. Figures snap to spaces.",
    },
    bag: {
      title: "From your bag",
      sub: "Maps you imported, including the one a Labs deck came with.",
    },
    spaces: {
      title: "Snaps to spaces",
      sub: "Official and community boards with mapped spaces.",
      folds: true,
    },
    image: {
      title: "Image only",
      sub: "No mapped spaces. Figures go wherever you put them.",
      folds: true,
    },
  };

const MapTile = ({
  map,
  selected,
  deckMap,
  onPick,
}: {
  map: TableMapOption;
  selected: boolean;
  deckMap: boolean;
  onPick: () => void;
}) => (
  <Flex
    as="button"
    type="button"
    flexDir="column"
    gap="6px"
    minW={0}
    textAlign="left"
    color="brand.secondary"
    borderRadius="8px"
    aria-pressed={selected}
    onClick={onPick}
    _focusVisible={focusRing}
    data-testid="map-tile"
    data-url={map.imgUrl}
  >
    <Box
      as="span"
      position="relative"
      display="block"
      w="100%"
      borderRadius="8px"
      overflow="hidden"
      bg="brand.primary"
      boxShadow={selected ? TILE_RING_ON : TILE_RING_OFF}
      sx={{ aspectRatio: "4 / 3" }}
    >
      <Image
        src={map.thumbUrl ?? map.imgUrl}
        alt=""
        loading="lazy"
        w="100%"
        h="100%"
        objectFit="cover"
      />
      {isPro(map) && <TileBadge left="6px">Pro</TileBadge>}
      {selected && <TileChip>On the table</TileChip>}
    </Box>
    <Box
      as="span"
      fontSize="14px"
      fontWeight={700}
      lineHeight={1.2}
      wordBreak="break-word"
    >
      {map.label}
    </Box>
    {deckMap && (
      <Box as="span" fontSize="12.5px" data-testid="deck-map-mark">
        Your deck&apos;s map
      </Box>
    )}
  </Flex>
);

/** Tab 3: every map as a tile, the Pro boards first. */
export const MapGallery = ({
  maps,
  selectedUrl,
  deckMapUrl,
  onPick,
}: {
  maps: TableMapOption[];
  selectedUrl: string;
  /** The starred deck's own map, marked on its tile. */
  deckMapUrl?: string;
  onPick: (imgUrl: string) => void;
}) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Partial<Record<MapGroup, boolean>>>({});

  const term = search.trim().toLowerCase();
  const passes = FILTERS.find((f) => f.id === filter)!.test;
  const shown = maps.filter(
    (m) => passes(m) && (!term || m.label.toLowerCase().includes(term)),
  );
  const groups = groupMapList(shown);
  // Narrowing the list is asking to see all of what's left.
  const narrowed = filter !== "all" || !!term;

  return (
    <Flex flexDir="column" gap="18px">
      <Flex
        align="center"
        justify="space-between"
        gap="8px 16px"
        flexWrap="wrap"
      >
        <Flex gap="8px" flexWrap="wrap" role="group" aria-label="Filter maps">
          {FILTERS.map((f) => (
            <FilterChip
              key={f.id}
              label={f.label}
              count={maps.filter(f.test).length}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
            />
          ))}
        </Flex>
        <Input
          type="search"
          aria-label="Search maps"
          placeholder={`Search ${maps.length} maps`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          w={{ base: "100%", md: "200px" }}
          h="44px"
          px="14px"
          bg="white"
          color="brand.surfaceDim"
          border="1.5px solid"
          borderColor="brand.secondary"
          borderRadius="999px"
          fontSize="14px"
          data-testid="map-search"
        />
      </Flex>

      {shown.length === 0 && (
        <Text data-testid="map-none">
          {term ? `No maps match “${search.trim()}”.` : "No maps here."}
        </Text>
      )}

      {MAP_GROUPS.map((id) => {
        const all = groups[id];
        if (all.length === 0) return null;
        const { title, sub, folds } = GROUPS[id];
        const folded = !!folds && !narrowed && !open[id];
        // A folded group is one row; the map on the table stays in it.
        const at = all.findIndex((m) => m.imgUrl === selectedUrl);
        const row =
          at >= ROW ? [all[at], ...all.slice(0, ROW - 1)] : all.slice(0, ROW);
        return (
          <Flex key={id} flexDir="column" gap="10px" data-testid={`maps-${id}`}>
            <SectionHead
              title={title}
              count={all.length}
              sub={sub}
              action={
                folds &&
                !narrowed && (
                  <Box
                    as="button"
                    type="button"
                    aria-expanded={!folded}
                    onClick={() => setOpen({ ...open, [id]: folded })}
                    // nothing to unfold when the whole group fits the row
                    display={{
                      base: all.length > COLUMNS.base ? "block" : "none",
                      md: all.length > COLUMNS.md ? "block" : "none",
                      xl: all.length > COLUMNS.xl ? "block" : "none",
                    }}
                    minH="44px"
                    fontSize="13px"
                    fontWeight={700}
                    textDecoration="underline"
                    color="brand.secondary"
                    _focusVisible={focusRing}
                    data-testid={`maps-${id}-toggle`}
                  >
                    {folded ? `Show all ${all.length}` : "Show fewer"}
                  </Box>
                )
              }
            />
            <SimpleGrid
              columns={COLUMNS}
              spacingX={{ base: "10px", lg: "14px" }}
              spacingY="14px"
              sx={
                folded
                  ? {
                      [`& > :nth-of-type(n+${COLUMNS.base + 1})`]: {
                        display: { base: "none", md: "flex" },
                      },
                      [`& > :nth-of-type(n+${COLUMNS.md + 1})`]: {
                        display: { base: "none", xl: "flex" },
                      },
                    }
                  : undefined
              }
            >
              {(folded ? row : all).map((m) => (
                <MapTile
                  key={m.imgUrl}
                  map={m}
                  selected={m.imgUrl === selectedUrl}
                  deckMap={m.imgUrl === deckMapUrl}
                  onPick={() => onPick(m.imgUrl)}
                />
              ))}
            </SimpleGrid>
          </Flex>
        );
      })}
    </Flex>
  );
};
