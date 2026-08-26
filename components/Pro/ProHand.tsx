/**
 * Pro hand — real card faces (sandbox `Card` renderer) with server-driven
 * affordances. A card is playable iff the server offered an action carrying
 * its instance id; one action = click plays it, several = a small menu.
 * Zero rules logic: unplayable cards are simply inert.
 */
import { ReactNode } from "react";
import { Box, Flex, Menu, MenuButton, MenuItem, MenuList, Tag, Text } from "@chakra-ui/react";
import { Card } from "@/components/CardFactory/Card";
import { useCardPreview } from "@/components/Pro/CardPreview";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { Action, CardInstanceId } from "@/lib/pro/protocol";
import { HAND_CARD_W_FAN, HAND_DRAWER_CARD_MAX } from "@/lib/pro/mobileLayout";
import { ResolveCard } from "@/lib/pro/useProCardArt";

export interface HandCardAction {
  action: Action;
  label: string;
}

export interface ProHandProps {
  hand: CardInstanceId[];
  resolveCard: ResolveCard;
  /** text fallback while art loads / when a title doesn't match */
  labelFor: (instance: CardInstanceId) => string;
  actionsFor: (instance: CardInstanceId) => HandCardAction[];
  onAction: (action: Action) => void;
  /**
   * How the hand is laid out (issue #708).
   *
   * "fan" is the desktop dock-over-the-bottom-edge fan: overlapping cards,
   * centered, lifting on hover. The two mobile layouts show the same cards with
   * the same affordances and the same long-press preview: "wrap" fills the hand
   * drawer, laying the WHOLE hand out at once across `columns` (Dean's rule —
   * see `handDrawerLayout`), and "strip" is the horizontal scroller used by the
   * landscape rail and as the drawer's fallback for an oversized hand.
   */
  variant?: "fan" | "strip" | "wrap";
  /** card width override; defaults to the fan's 8.5rem */
  cardWidth?: string;
  /** "wrap" only: how many cards per row, so the whole hand fits two rows */
  columns?: number;
}

const CARD_W = HAND_CARD_W_FAN;

export const CardFace = ({
  card,
  fallback,
}: {
  card: DeckImportCardType | null;
  fallback: string;
}) => {
  // Hover / press / focus preview (issue #167). No-op outside a
  // CardPreviewProvider or for a hidden card, so this stays inert in
  // lobby/replay surfaces and never previews a face-down opponent card.
  const preview = useCardPreview(card);
  return card ? (
    <Box
      w="100%"
      h="100%"
      outline="none"
      _focusVisible={{ boxShadow: "0 0 0 2px var(--chakra-colors-brand-accent)", borderRadius: "0.5rem" }}
      {...preview}
    >
      <Card card={card} />
    </Box>
  ) : (
    <Flex
      w="100%"
      h="100%"
      bg="brand.surface"
      border="1px solid"
      borderColor="whiteAlpha.300"
      borderRadius="0.5rem"
      alignItems="center"
      justifyContent="center"
      p="0.5rem"
    >
      <Text fontSize="0.8rem" textAlign="center" color="brand.parchment">
        {fallback}
      </Text>
    </Flex>
  );
};

export const ProHand = ({
  hand,
  resolveCard,
  labelFor,
  actionsFor,
  onAction,
  variant = "fan",
  cardWidth,
  columns = 3,
}: ProHandProps) => {
  const strip = variant === "strip";
  const wrap = variant === "wrap";
  // A wrapped row divides the drawer's width evenly (capped below, so a
  // two-card hand does not become two posters); the other layouts take a fixed
  // width.
  const cardW = wrap ? `calc((100% - ${columns - 1} * 0.5rem) / ${columns})` : cardWidth ?? CARD_W;

  const renderCard = (instance: CardInstanceId, i: number): ReactNode => {
    const card = resolveCard(instance);
    const actions = actionsFor(instance);
    const playable = actions.length > 0;
    const frame = (
      <Box
        w={wrap ? "100%" : cardW}
        maxW={wrap ? HAND_DRAWER_CARD_MAX : undefined}
        sx={{ aspectRatio: "63 / 88", ...(strip ? { scrollSnapAlign: "center" } : {}) }}
        ml={strip || wrap ? 0 : i === 0 ? 0 : `calc(${cardW} * -0.25)`}
        position="relative"
        transition="transform 0.15s ease, filter 0.15s ease"
        cursor={playable ? "pointer" : "default"}
        filter={playable ? "none" : "grayscale(0.4) brightness(0.75)"}
        // The lift is a mouse affordance; on a touch layout it would only shove
        // a card under the drawer edge on a stray hover.
        _hover={strip || wrap ? undefined : { transform: "translateY(-1.25rem)", zIndex: 10 }}
        zIndex={strip || wrap ? undefined : i}
        borderRadius="0.5rem"
        boxShadow={playable ? "0 0 0 2px #E0A82E, 0 4px 10px rgba(0,0,0,0.5)" : "0 2px 6px rgba(0,0,0,0.4)"}
      >
        <CardFace card={card} fallback={labelFor(instance)} />
        {playable && (
          <Tag
            position="absolute"
            bottom={wrap ? "0.3rem" : "-0.5rem"}
            left="50%"
            transform="translateX(-50%)"
            size="sm"
            bg="brand.accent"
            color="brand.surfaceDim"
            whiteSpace="nowrap"
            maxW="94%"
            overflow="hidden"
            sx={{ textOverflow: "ellipsis", display: "block" }}
          >
            {actions.length === 1 ? actions[0].label : "choose…"}
          </Tag>
        )}
      </Box>
    );

    const cell = wrap
      ? { flex: `0 1 ${cardW}`, display: "flex", justifyContent: "center", minW: 0 }
      : { flexShrink: strip ? 0 : undefined };

    if (!playable)
      return (
        <Box key={instance} {...cell}>
          {frame}
        </Box>
      );
    if (actions.length === 1)
      return (
        <Box key={instance} {...cell} onClick={() => onAction(actions[0].action)}>
          {frame}
        </Box>
      );
    return (
      <Menu key={instance} placement="top">
        <MenuButton as={Box} {...cell}>
          {frame}
        </MenuButton>
        <MenuList bg="brand.surface" borderColor="whiteAlpha.300" minW="10rem">
          {actions.map((a) => (
            <MenuItem
              key={a.label}
              bg="brand.surface"
              color="brand.parchment"
              _hover={{ bg: "whiteAlpha.300" }}
              onClick={() => onAction(a.action)}
            >
              {a.label}
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    );
  };

  if (hand.length === 0)
    return (
      <Text
        opacity={0.5}
        fontSize="0.9rem"
        textAlign="center"
        py={strip || wrap ? "0.75rem" : undefined}
      >
        hand is empty
      </Text>
    );

  if (wrap)
    return (
      <Flex justifyContent="center" alignItems="flex-start" flexWrap="wrap" gap="0.5rem">
        {hand.map(renderCard)}
      </Flex>
    );

  return (
    <Flex
      justifyContent={strip ? "flex-start" : "center"}
      alignItems="flex-end"
      gap="0"
      pb={strip ? "0.75rem" : "0.5rem"}
      // Momentum scroll with room for the play tag under the last card, and a
      // right-edge fade that says "there is more hand over here". `pan-x` keeps
      // the gesture on the scroller so it never becomes a board pan.
      {...(strip
        ? {
            px: "0.5rem",
            pt: "0.4rem",
            overflowX: "auto" as const,
            overflowY: "hidden" as const,
            sx: {
              touchAction: "pan-x",
              WebkitOverflowScrolling: "touch",
              scrollSnapType: "x proximity",
              "::-webkit-scrollbar": { display: "none" },
              scrollbarWidth: "none",
              maskImage:
                "linear-gradient(to right, #000 0, #000 calc(100% - 1.5rem), transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, #000 0, #000 calc(100% - 1.5rem), transparent 100%)",
            },
          }
        : {})}
    >
      {hand.map(renderCard)}
    </Flex>
  );
};
