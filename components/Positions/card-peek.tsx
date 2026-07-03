import { FC } from "react";
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { Card } from "../CardFactory/Card";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import { cardTokenHeight } from "./position.type";

const PEEK_WIDTH = 220;
const PEEK_HEIGHT = cardTokenHeight(PEEK_WIDTH);
const GAP = 14;
const MARGIN = 8;

/** Where the peek anchors — the hovered token's viewport rect. */
export type PeekAnchor = Pick<DOMRect, "top" | "bottom" | "left" | "width">;

/**
 * Owner-only preview of a face-down card token, floating above the hovered
 * token (below it when there's no room). Pointer-events:none so it never
 * steals the hover that summoned it.
 */
export const CardPeek: FC<{ card: DeckImportCardType; anchor: PeekAnchor }> = ({
  card,
  anchor,
}) => {
  const cx = anchor.left + anchor.width / 2;
  const x = Math.min(
    Math.max(cx - PEEK_WIDTH / 2, MARGIN),
    window.innerWidth - PEEK_WIDTH - MARGIN,
  );
  const above = anchor.top - PEEK_HEIGHT - GAP;
  const y = above >= MARGIN ? above : anchor.bottom + GAP;

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
