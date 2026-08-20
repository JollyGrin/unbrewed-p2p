import { MapCard } from "@/components/Bag/Map/MapCard";
import DEFAULT_MAPS from "@/components/Bag/Map/MapModal/defaultMaps.json";
import { MapData } from "@/lib/hooks";
import { useBagMaps } from "@/lib/bag/useBag";
import { DEFAULT_MAP_URL } from "@/lib/maps/defaultMap";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Collapse,
  Flex,
  Grid,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Skeleton,
  Tag,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "use-debounce";

/** Source buckets the segmented filter offers, in display order. */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "official", label: "Official" },
  { key: "legacy", label: "Legacy" },
  { key: "community", label: "Community" },
  { key: "mine", label: "My maps" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/** A map plus the bucket it belongs to (local maps carry no `source`). */
type MapEntry = { map: MapData; source: FilterKey };

export const MapModal = (props: { isOpen: boolean; onClose: () => void }) => {
  const { query, push } = useRouter();
  const { data: localMaps } = useBagMaps();

  const queryUrl = query?.mapUrl as string | undefined;

  // Selection is deliberately local. `mapUrl` in the router query is the sync
  // channel — WebGameProvider broadcasts every change to the whole room — so
  // browsing the gallery must not touch it. Only "Set Map" pushes.
  const [selectedUrl, setSelectedUrl] = useState(queryUrl || DEFAULT_MAP_URL);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showCustom, setShowCustom] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [debouncedCustomUrl] = useDebounce(customUrl, 300);
  const [loaded, setLoaded] = useState(false);

  const selectedRef = useRef<HTMLDivElement>(null);

  // My maps first, then the built-ins. A local map that shadows a built-in URL
  // wins so it isn't rendered twice (and React keys stay unique).
  const entries = useMemo<MapEntry[]>(() => {
    const seen = new Set<string>();
    const out: MapEntry[] = [];
    for (const map of localMaps) {
      if (seen.has(map.imgUrl)) continue;
      seen.add(map.imgUrl);
      out.push({ map, source: "mine" });
    }
    for (const map of DEFAULT_MAPS as MapData[]) {
      if (seen.has(map.imgUrl)) continue;
      seen.add(map.imgUrl);
      const source = map.source as FilterKey | undefined;
      out.push({ map, source: source ?? "legacy" });
    }
    return out;
  }, [localMaps]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter(({ map, source }) => {
      if (filter !== "all" && source !== filter) return false;
      if (!needle) return true;
      const haystack = `${map.meta?.title ?? ""} ${map.meta?.author ?? ""}`;
      return haystack.toLowerCase().includes(needle);
    });
  }, [entries, filter, search]);

  const selectedMap = entries.find((e) => e.map.imgUrl === selectedUrl)?.map;

  // Re-seed from the live map every time the modal opens, so reopening after a
  // remote change starts from what's actually on the board.
  useEffect(() => {
    if (!props.isOpen) return;
    setSelectedUrl(queryUrl || DEFAULT_MAP_URL);
    setSearch("");
    setFilter("all");
    setShowCustom(false);
    setCustomUrl("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen]);

  // Bring the currently-set map into view once the grid has mounted.
  useEffect(() => {
    if (!props.isOpen) return;
    const frame = requestAnimationFrame(() =>
      selectedRef.current?.scrollIntoView({ block: "center" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [props.isOpen]);

  // Typing a custom URL selects it, so the preview and "Set Map" both follow
  // the same path as a gallery pick.
  useEffect(() => {
    if (!debouncedCustomUrl) return;
    setSelectedUrl(debouncedCustomUrl);
  }, [debouncedCustomUrl]);

  // Show the skeleton again whenever the preview target changes, so the prior
  // map doesn't linger while the new one loads.
  useEffect(() => setLoaded(false), [selectedUrl]);

  const setMap = () => {
    if (!selectedUrl) return;
    push({ query: { ...query, mapUrl: selectedUrl } });
    props.onClose();
  };

  const resetToDefault = () => {
    const { mapUrl, ...rest } = query;
    setSelectedUrl(DEFAULT_MAP_URL);
    push({ query: { ...rest } });
    props.onClose();
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      size={{ base: "full", md: "6xl" }}
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent bg="brand.parchment" borderRadius={{ base: 0, md: "1rem" }}>
        <ModalHeader>Change the Map</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex gap="0.75rem" align="center" flexWrap="wrap" pb="0.75rem">
            <InputGroup maxW="16rem" size="sm">
              <InputLeftElement pointerEvents="none">
                <SearchIcon opacity={0.5} />
              </InputLeftElement>
              <Input
                placeholder="search maps…"
                aria-label="Search maps"
                borderRadius="0.4rem"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>

            <Flex gap="0.25rem" flexWrap="wrap">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={filter === f.key ? "solid" : "ghost"}
                  bg={filter === f.key ? "brand.accent" : undefined}
                  color={filter === f.key ? "brand.surfaceDim" : undefined}
                  _hover={
                    filter === f.key ? { bg: "brand.accentDeep" } : undefined
                  }
                  fontFamily="SpaceGrotesk"
                  fontSize="0.8rem"
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </Flex>
          </Flex>

          <Grid
            templateColumns={{ base: "1fr", md: "minmax(0, 1fr) 20rem" }}
            gap="1rem"
            alignItems="start"
          >
            <Box minW={0}>
              {visible.length === 0 ? (
                <Text opacity={0.7} py="2rem" textAlign="center">
                  No maps match that search.
                </Text>
              ) : (
                <Grid
                  templateColumns={{
                    base: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(3, minmax(0, 1fr))",
                  }}
                  gap="0.6rem"
                  // The grid scrolls on its own so 76 cards never push the
                  // custom-URL disclosure (and the footer) out of reach.
                  maxH={{ base: "55vh", md: "55vh" }}
                  overflowY="auto"
                  pr="0.25rem"
                >
                  {visible.map(({ map, source }) => {
                    const isSelected = map.imgUrl === selectedUrl;
                    return (
                      <MapCard
                        key={map.imgUrl}
                        ref={isSelected ? selectedRef : undefined}
                        map={map}
                        isSelected={isSelected}
                        onSelect={() => setSelectedUrl(map.imgUrl)}
                        badge={
                          isSelected
                            ? map.imgUrl === DEFAULT_MAP_URL && !queryUrl
                              ? "Default"
                              : "Selected"
                            : undefined
                        }
                        corner={
                          source === "mine" ? (
                            <Tag
                              size="sm"
                              bg="rgba(20, 8, 24, 0.6)"
                              color="#FAEBD7"
                            >
                              my map
                            </Tag>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </Grid>
              )}

              <Box mt="1rem">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={
                    showCustom ? <ChevronDownIcon /> : <ChevronRightIcon />
                  }
                  fontFamily="SpaceGrotesk"
                  onClick={() => setShowCustom((prev) => !prev)}
                >
                  Use a custom image URL
                </Button>
                <Collapse in={showCustom} animateOpacity unmountOnExit>
                  <Box pt="0.5rem" pl="0.25rem">
                    <Input
                      placeholder="https://someurl.com/map.svg"
                      aria-label="Custom map image URL"
                      maxW="28rem"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                    />
                    <Text mt="4px" fontSize="0.75rem" opacity={0.7}>
                      Recommended 1200x1000
                    </Text>
                    {debouncedCustomUrl && (
                      <Image
                        mt="0.5rem"
                        alt="custom map preview"
                        src={debouncedCustomUrl}
                        maxH="10rem"
                        borderRadius="0.5rem"
                        objectFit="contain"
                      />
                    )}
                  </Box>
                </Collapse>
              </Box>
            </Box>

            {/* Desktop preview pane. On mobile this collapses to the footer strip. */}
            <Box display={{ base: "none", md: "block" }}>
              <Box position="relative" minH="12rem">
                {!loaded && (
                  <Skeleton position="absolute" inset="0" borderRadius="0.5rem" />
                )}
                <Image
                  key={selectedUrl}
                  alt="Selected map preview"
                  src={selectedUrl}
                  w="100%"
                  maxH="22rem"
                  objectFit="contain"
                  borderRadius="0.5rem"
                  opacity={loaded ? 1 : 0}
                  transition="opacity 0.2s ease-in"
                  onLoad={() => setLoaded(true)}
                  onError={() => setLoaded(true)}
                />
              </Box>
              <Text mt="0.5rem" fontWeight={700} fontSize="1.1rem">
                {selectedMap?.meta?.title ?? "Custom map"}
              </Text>
              {selectedMap?.meta?.author && (
                <Text fontSize="0.85rem" opacity={0.8}>
                  by{" "}
                  {selectedMap.meta.url ? (
                    <Link href={selectedMap.meta.url} target="_blank">
                      <Text as="span" textDecoration="underline">
                        {selectedMap.meta.author}
                      </Text>
                    </Link>
                  ) : (
                    selectedMap.meta.author
                  )}
                </Text>
              )}
            </Box>
          </Grid>
        </ModalBody>

        <ModalFooter flexDir="column" alignItems="stretch" gap="0.5rem">
          <Flex
            display={{ base: "flex", md: "none" }}
            align="center"
            gap="0.5rem"
          >
            <Image
              alt=""
              src={selectedMap?.thumbUrl ?? selectedUrl}
              w="3.5rem"
              h="2.5rem"
              objectFit="cover"
              borderRadius="0.35rem"
              flexShrink={0}
            />
            <Text fontWeight={700} fontSize="0.9rem" noOfLines={1}>
              {selectedMap?.meta?.title ?? "Custom map"}
            </Text>
          </Flex>

          <Text fontSize="0.75rem" opacity={0.7}>
            Changing the map updates it for everyone in the game.
          </Text>

          <Flex gap="1rem" justify="flex-end">
            <Button variant="ghost" onClick={resetToDefault}>
              Reset to default
            </Button>
            <Button
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              onClick={setMap}
            >
              Set Map
            </Button>
          </Flex>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
