import { FC } from "react";
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { Card } from "../CardFactory/Card";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import { cardTokenHeight } from "./position.type";

export const PEEK_WIDTH = 220;
export const PEEK_HEIGHT = cardTokenHeight(PEEK_WIDTH);
const GAP = 14;
const MARGIN = 8;
/**
 * The strip along the bottom of the screen where the hand fan is drawn (its
 * cards show 164px) — the peek keeps out of it, so the previewed card is never
 * mixed in with the hand.
 */
export const HAND_RESERVE = 176;

/** Where the peek anchors — the hovered token's viewport rect. */
export type PeekAnchor = Pick<DOMRect, "top" | "bottom" | "left" | "width">;

/**
 * Top-left of the peek for a token at `anchor`: above it; else below, if that
 * clears the hand; else beside it (right, then left); else as low as the hand
 * allows, over the token itself (the peek ignores the pointer).
 */
export const peekPosition = (
  anchor: PeekAnchor,
  viewport: { width: number; height: number },
  reserveBottom = HAND_RESERVE,
): { x: number; y: number } => {
  const cx = anchor.left + anchor.width / 2;
  const centredX = Math.min(
    Math.max(cx - PEEK_WIDTH / 2, MARGIN),
    Math.max(MARGIN, viewport.width - PEEK_WIDTH - MARGIN),
  );
  const floor = Math.max(MARGIN, viewport.height - reserveBottom - PEEK_HEIGHT);
  const above = anchor.top - PEEK_HEIGHT - GAP;
  if (above >= MARGIN) return { x: centredX, y: Math.min(above, floor) };
  const below = anchor.bottom + GAP;
  if (below <= floor) return { x: centredX, y: below };
  const besideY = Math.min(
    Math.max((anchor.top + anchor.bottom) / 2 - PEEK_HEIGHT / 2, MARGIN),
    floor,
  );
  const right = anchor.left + anchor.width + GAP;
  if (right + PEEK_WIDTH <= viewport.width - MARGIN)
    return { x: right, y: besideY };
  const left = anchor.left - GAP - PEEK_WIDTH;
  if (left >= MARGIN) return { x: left, y: besideY };
  return { x: centredX, y: floor };
};

/**
 * Owner-only preview of a face-down card token, floating above the hovered
 * token (below it when there's no room). Pointer-events:none so it never
 * steals the hover that summoned it.
 */
export const CardPeek: FC<{ card: DeckImportCardType; anchor: PeekAnchor }> = ({
  card,
  anchor,
}) => {
  const { x, y } = peekPosition(anchor, {
    width: window.innerWidth,
    height: window.innerHeight,
  });

  return (
    <Box
      data-card-peek
      position="fixed"
      left={`${x}px`}
      top={`${y}px`}
      w={`${PEEK_WIDTH}px`}
      h={`${PEEK_HEIGHT}px`}
      zIndex={260}
      pointerEvents="none"
    >
      <Rise>
        <Card card={card} />
      </Rise>
    </Box>
  );
};

const rise = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

const Rise = styled(Box)`
  width: 100%;
  height: 100%;
  animation: ${rise} 0.16s ease-out;
  filter: drop-shadow(0 14px 28px rgba(20, 8, 24, 0.55));
`;
