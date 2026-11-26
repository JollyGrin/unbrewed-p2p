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
 *
 * The instruction ("Click up to 2 cards…") is the PROMPT's heading, not a line in
 * here (issue #1703): the page puts `multiPickInstruction` where the engine's
 * "how many?" question would stand, and this component keeps only the running
 * count beside its button. On mount it scrolls itself into view, so the cards and
 * the button are on screen even when the dock or sheet was scrolled elsewhere.
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type { CardInstanceId } from "@/lib/pro/protocol";
import type { ResolveCard } from "@/lib/pro/useProCardArt";
import { CardFace } from "./ProHand";

export const multiPickConfirmLabel = (n: number) =>
  n === 0 ? "Return none" : `Return ${n} card${n === 1 ? "" : "s"}`;

/**
 * The prompt heading while the picker is up. `whose` is the possessive of the hand's
 * owner ("the opponent's", "P3's"). Written for a mouse; the page runs it through
 * `touchCopy` on a phone.
 */
export const multiPickInstruction = (max: number, whose: string) =>
  `Click up to ${max} card${max === 1 ? "" : "s"} from ${whose} hand to return to their deck`;

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
  // Bring the whole picker into view once, when it opens. "nearest" is a no-op when
  // it already is, and shows the first row when the picker is taller than its panel.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, []);
  return (
    <Box data-testid="card-multi-pick" ref={root}>
      {/* As many columns as fit, each at least a phone-sized card: three across in
          the desktop dock, four in the phone sheet, so a 7-card hand is 3 / 2 rows. */}
      <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(4.25rem, 1fr))" gap="0.5rem" mb="0.6rem">
        {cards.map((card) => {
          const on = selected.includes(card);
          const blocked = full && !on;
          return (
            <Box
              key={card}
              as="button"
              type="button"
              position="relative"
              w="100%"
              maxW="6.5rem"
              sx={{ aspectRatio: "63 / 88" }}
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
      </Box>
      <Flex alignItems="center" gap="0.6rem" flexWrap="wrap">
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
        <Text fontSize="0.8rem" color="brand.parchment" opacity={0.85} data-testid="card-multi-pick-count">
          {selected.length} / {max} selected
        </Text>
      </Flex>
    </Box>
  );
};
