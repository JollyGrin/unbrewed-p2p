import { MapData } from "@/lib/hooks";
import { LinkIcon } from "@chakra-ui/icons";
import { Box, Flex, Image, Tag, Text } from "@chakra-ui/react";
import Link from "next/link";
import { ReactNode, forwardRef } from "react";

export type MapCardProps = {
  map: MapData;
  isSelected?: boolean;
  onSelect?: () => void;
  /** Pill rendered top-left, e.g. "Selected" or "Default". */
  badge?: ReactNode;
  /** Slot rendered top-right, e.g. the "built-in" tag or a remove button. */
  corner?: ReactNode;
  /** Card footprint. Defaults to filling the grid cell it is placed in. */
  w?: string | Record<string, string>;
  h?: string | Record<string, string>;
};

/**
 * The map thumbnail card shared by the /bag map shelf and the in-game
 * "Change the Map" gallery. The image is a real <img> rather than a CSS
 * background so 76+ cards can lazy-load as the grid scrolls.
 */
export const MapCard = forwardRef<HTMLDivElement, MapCardProps>(
  function MapCard(props, ref) {
    const { map, isSelected, onSelect, badge, corner } = props;
    return (
      <Box
        ref={ref}
        w={props.w ?? "100%"}
        h={props.h ?? "160px"}
        bg="brand.highlight"
        borderRadius="0.5rem"
        border="3px solid"
        borderColor={isSelected ? "brand.accent" : "transparent"}
        boxShadow="0 2px 8px rgba(20, 8, 24, 0.3)"
        position="relative"
        overflow="hidden"
        cursor={onSelect ? "pointer" : "default"}
        transition="transform 0.15s ease-out"
        _hover={onSelect ? { transform: "translateY(-2px)" } : undefined}
        onClick={onSelect}
      >
        <Image
          alt={map?.meta?.title ?? "map"}
          src={map?.thumbUrl ?? map?.imgUrl}
          loading="lazy"
          position="absolute"
          inset="0"
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition="center"
        />

        <Flex
          position="absolute"
          bottom="0"
          w="100%"
          p="0.35rem 0.5rem"
          bg="linear-gradient(180deg, rgba(20,8,24,0) 0%, rgba(20,8,24,0.85) 100%)"
          justifyContent="space-between"
          alignItems="end"
          color="#FAEBD7"
        >
          <Box minW={0}>
            <Text fontWeight={700} fontSize="0.85rem" lineHeight={1.2}>
              {map?.meta?.title ?? "Untitled map"}
            </Text>
            {map?.meta?.author && (
              <Text fontSize="0.7rem" opacity={0.8}>
                by {map.meta.author}
              </Text>
            )}
          </Box>
          {map?.meta?.url && (
            <Link
              href={map.meta.url}
              target="_blank"
              onClick={(e) => e.stopPropagation()}
            >
              <LinkIcon />
            </Link>
          )}
        </Flex>

        {badge && (
          <Tag
            position="absolute"
            top="0.35rem"
            left="0.35rem"
            size="sm"
            bg="brand.accent"
            color="brand.surfaceDim"
          >
            {badge}
          </Tag>
        )}

        {corner && (
          <Box position="absolute" top="0.35rem" right="0.35rem">
            {corner}
          </Box>
        )}
      </Box>
    );
  },
);
