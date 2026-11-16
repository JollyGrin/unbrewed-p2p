/**
 * "Look at their hand, return up to N cards" answered in one step (issue #1691 —
 * POMNI's *The Funny One!*). Shows the revealed hand as real card faces: tap a
 * card to select it, tap again to drop it, then one button confirms the whole
 * choice ("Return none" / "Return 1 card" / "Return 2 cards"). The faces are the
 * same `CardFace` the hand uses, so hover (desktop) and press-and-hold (touch)
 * still open the large preview; a plain tap only toggles.
 *
 * Selection lives here; the page keys the component by promptId, so a new prompt
 * always starts empty. Sending the answers is the caller's job (`onConfirm`).
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";
import type { CardInstanceId } from "@/lib/pro/protocol";
import type { ResolveCard } from "@/lib/pro/useProCardArt";
import { CardFace } from "./ProHand";

export const multiPickConfirmLabel = (n: number) =>
  n === 0 ? "Return none" : `Return ${n} card${n === 1 ? "" : "s"}`;

export const CardMultiPick = ({
  cards,
  max,
  counts,
  resolveCard,
  labelFor,
  onConfirm,
}: {
  /** the revealed hand, in reveal order */
  cards: CardInstanceId[];
  /** the most cards that may be selected */
  max: number;
  /** the counts the prompt accepts; confirm is disabled on any other */
  counts: number[];
  resolveCard: ResolveCard;
  labelFor: (card: CardInstanceId) => string;
  onConfirm: (selected: CardInstanceId[]) => void;
}) => {
  const [selected, setSelected] = useState<CardInstanceId[]>([]);
  const full = selected.length >= max;
  const toggle = (card: CardInstanceId) =>
    setSelected((prev) => {
      if (prev.includes(card)) return prev.filter((c) => c !== card);
      return prev.length >= max ? prev : [...prev, card];
    });
  return (
    <Box data-testid="card-multi-pick">
      <Text fontSize="0.85rem" mb="0.5rem" color="brand.parchment">
        Tap up to {max} card{max === 1 ? "" : "s"} to return. {selected.length} / {max} selected.
      </Text>
      <Flex gap="0.5rem" flexWrap="wrap" mb="0.6rem">
        {cards.map((card) => {
          const on = selected.includes(card);
          const blocked = full && !on;
          return (
            <Box
              key={card}
              as="button"
              type="button"
              position="relative"
              w="5rem"
              sx={{ aspectRatio: "63 / 88", "@media (max-width: 420px)": { w: "4.25rem" } }}
              borderRadius="0.35rem"
              transition="transform 0.1s, box-shadow 0.1s, opacity 0.1s"
              transform={on ? "translateY(-4px)" : undefined}
              boxShadow={on ? "0 0 0 3px var(--chakra-colors-brand-accent)" : undefined}
              opacity={blocked ? 0.45 : 1}
              cursor={blocked ? "not-allowed" : "pointer"}
              aria-pressed={on}
              aria-disabled={blocked}
              aria-label={labelFor(card)}
              onClick={() => toggle(card)}
            >
              <CardFace card={resolveCard(card)} fallback={labelFor(card)} />
              {on && (
                <Flex
                  position="absolute"
                  top="-0.4rem"
                  right="-0.4rem"
                  w="1.3rem"
                  h="1.3rem"
                  borderRadius="50%"
                  bg="brand.accent"
                  color="brand.surfaceDim"
                  fontSize="0.8rem"
                  fontWeight="bold"
                  alignItems="center"
                  justifyContent="center"
                  pointerEvents="none"
                  aria-hidden
                >
                  ✓
                </Flex>
              )}
            </Box>
          );
        })}
      </Flex>
      <Button
        bg="brand.accent"
        color="brand.surfaceDim"
        _hover={{ bg: "brand.accentDeep" }}
        _active={{ bg: "brand.accentDeep" }}
        size="sm"
        isDisabled={!counts.includes(selected.length)}
        onClick={() => onConfirm(selected)}
      >
        {multiPickConfirmLabel(selected.length)}
      </Button>
    </Box>
  );
};
