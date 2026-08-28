/**
 * Map-preview modal — an inspect affordance on the board picker (/pro/game
 * stage row). A small magnifier button in each map card's corner opens this
 * instead of committing to the pick, so a creator can read the board closely
 * before choosing it (issue #316).
 *
 * Shows the board title, the full-size board image (aspect-correct from
 * `meta.imageWidth`/`meta.imageHeight` when present), optional format badges,
 * and — when the map JSON carries them — the attribution fields the catalog
 * already ships on `ProMapDef.meta`: `source`, `license`, `set`. Absent fields
 * are simply omitted; we never fabricate attribution.
 */
import { Box, Flex, Image, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Tag, Text } from "@chakra-ui/react";
import type { MapCatalogEntry } from "@/lib/pro/mapCatalog";
import { FORMAT_BADGE, eligibleFormats } from "@/lib/pro/mapCatalog";
import { ItemBadge } from "./ItemBadge";
import { itemBadgeTitle } from "@/lib/pro/itemInfo";

export interface MapPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** the catalog entry to preview, or null when nothing is open */
  entry: MapCatalogEntry | null;
}

export const MapPreviewModal = ({ isOpen, onClose, entry }: MapPreviewModalProps) => {
  const meta = entry?.map.meta;
  const imageUrl = meta?.imageUrl || entry?.thumbnailUrl;
  const aspectRatio =
    meta?.imageWidth && meta?.imageHeight ? `${meta.imageWidth} / ${meta.imageHeight}` : "16 / 10";

  // Attribution — only the fields actually present on the map JSON.
  const attribution: { label: string; value: string }[] = [];
  if (meta?.set) attribution.push({ label: "Set", value: meta.set });
  if (meta?.source) attribution.push({ label: "Source", value: meta.source });
  if (meta?.license) attribution.push({ label: "License", value: meta.license });

  const formats = entry ? eligibleFormats(entry.map) : [];
  // 🎁 items (#725): boards that print battlefield items say so beside their
  // format pills. Wedding Crashers (#727) is the first catalog board to print
  // them; any later item board lights the tag up automatically.
  const items = entry?.map.items ?? [];
  const hasItems = items.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered scrollBehavior="inside">
      <ModalOverlay bg="rgba(20, 8, 24, 0.7)" />
      <ModalContent bg="brand.surface" color="brand.parchment">
        <ModalHeader>
          <Flex align="center" gap="0.75rem" flexWrap="wrap" pr="2rem">
            <Text
              fontFamily="BebasNeueRegular"
              fontSize="1.5rem"
              letterSpacing="0.03em"
              lineHeight={1.1}
            >
              {entry?.title ?? "Board"}
            </Text>
            {formats.map((f) => (
              <Tag key={f} size="sm" bg="whiteAlpha.200" color="brand.parchment" fontWeight={700}>
                {FORMAT_BADGE[f]}
              </Tag>
            ))}
            {hasItems && (
              <Tag
                size="sm"
                bg="whiteAlpha.200"
                color="brand.parchment"
                fontWeight={700}
                title="This board prints battlefield items — the creator can switch them off"
              >
                🎁 items
              </Tag>
            )}
          </Flex>
        </ModalHeader>
        <ModalCloseButton zIndex={2} />
        <ModalBody pb="1.5rem">
          {imageUrl ? (
            <Box
              borderRadius="0.6rem"
              overflow="hidden"
              border="1px solid"
              borderColor="whiteAlpha.200"
              bg="rgba(0,0,0,0.35)"
            >
              <Image
                src={imageUrl}
                alt={`${entry?.title ?? "Board"} — full board image`}
                w="100%"
                sx={{ aspectRatio }}
                objectFit="contain"
              />
            </Box>
          ) : (
            <Text opacity={0.6} fontSize="0.85rem">
              No image available for this board.
            </Text>
          )}

          {/* Items are open information (p2p #731): a player reads what the
              board's items do HERE, before creating a room — same badge glyph
              the board will draw, same effect text the dock and the tap-to-
              inspect popover will print (lib/pro/itemInfo). */}
          {hasItems && (
            <Box mt="1rem">
              <Text
                fontFamily="SpaceGrotesk"
                fontSize="0.72rem"
                letterSpacing="0.06em"
                textTransform="uppercase"
                opacity={0.7}
                mb="0.4rem"
              >
                🎁 Battlefield items
              </Text>
              <Flex direction="column" gap="0.4rem" fontSize="0.85rem">
                {items.map((it) => (
                  <Flex key={it.id} align="flex-start" gap="0.5rem">
                    <Box boxSize="1.1rem" flexShrink={0} mt="0.1rem" title={itemBadgeTitle(it)}>
                      <ItemBadge kind={it.kind} />
                    </Box>
                    <Text lineHeight={1.35}>{itemBadgeTitle(it)}</Text>
                  </Flex>
                ))}
              </Flex>
            </Box>
          )}

          {attribution.length > 0 && (
            <Flex direction="column" gap="0.2rem" mt="1rem" fontSize="0.8rem" opacity={0.85}>
              {attribution.map((a) => (
                <Text key={a.label}>
                  <Text as="span" color="brand.accent" fontWeight={600}>
                    {a.label}:
                  </Text>{" "}
                  {a.value}
                </Text>
              ))}
            </Flex>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
