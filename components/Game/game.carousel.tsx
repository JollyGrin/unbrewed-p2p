import React, { CSSProperties, useRef, useState } from "react";
import { Box, Flex } from "@chakra-ui/react";
import { Card } from "../CardFactory/Card";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { PopoverCardActions } from "./card-actions.popover";
import { getBoardSvg } from "../BoardCanvas/boardTransform";

const CARD_WIDTH = 150;
const CARD_HEIGHT = 200;
/** widest the fan is allowed to spread before cards overlap tighter */
const MAX_FAN_WIDTH = 950;
/** pointer travel (px) before a press on a card becomes a drag-to-table */
const DRAG_THRESHOLD = 12;

const handleDragStart = (e: React.DragEvent) => {
  e.preventDefault();
};

type CardWrapperProps = {
  cards: DeckImportCardType[] | undefined;
  functions: {
    discardFn: (index: number) => void;
    /**
     * @deprecated Commit-modal flow — superseded by dragging cards to the
     * table (face-down by default). Kept wired so the modal machinery still
     * works, but no UI triggers it since the fan's "+" button was hidden.
     */
    commitFn: (index: number) => void;
    boostFn: (index: number) => void;
    deckCardFn: (index: number) => void;
    deckCardBottomFn: (index: number) => void;
    /** Play hand[index] onto the table — absent offline (no board). */
    playFn?: (
      index: number,
      opts?: { faceDown?: boolean; screenPos?: { x: number; y: number } },
    ) => void;
    /** Give hand[index] to another player (escrow transfer). */
    giveFn?: (index: number, to: string) => void;
  };
  /** Other players in the room, for the "Give card to…" actions. */
  opponents?: string[];
};

/**
 * Hand of cards fanned in an arc, floating over the board like a
 * physical hand held at the table edge.
 *
 * Cards can be dragged out of the fan and dropped on the board to play
 * them to the table: a fixed-position ghost follows the pointer, and the
 * drop lands only if it releases over the board svg (checked with
 * elementFromPoint, so drops onto other UI just cancel).
 */
export const HandFan: React.FC<CardWrapperProps> = ({
  cards,
  functions,
  opponents,
}) => {
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const positionGhost = (el: HTMLDivElement | null, x: number, y: number) => {
    if (!el) return;
    el.style.transform = `translate(${x - CARD_WIDTH / 2}px, ${
      y - CARD_HEIGHT / 2
    }px)`;
  };

  const onCardPointerDown = (e: React.PointerEvent, index: number) => {
    if (!functions.playFn) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // presses on the hover action buttons stay clicks, never drags
    if ((e.target as Element).closest?.(".actions")) return;

    const start = { x: e.clientX, y: e.clientY };
    let active = false;

    const onMove = (ev: PointerEvent) => {
      lastPointer.current = { x: ev.clientX, y: ev.clientY };
      if (
        !active &&
        Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_THRESHOLD
      ) {
        active = true;
        setDragIndex(index);
      }
      if (active) positionGhost(ghostRef.current, ev.clientX, ev.clientY);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      lastPointer.current = null;
      setDragIndex(null);
    };

    const onUp = (ev: PointerEvent) => {
      const wasActive = active;
      cleanup();
      if (!wasActive) return;
      // ghost is pointer-events:none, so this hits whatever is underneath
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const svg = getBoardSvg();
      if (svg && el && svg.contains(el)) {
        functions.playFn?.(index, {
          screenPos: { x: ev.clientX, y: ev.clientY },
        });
      }
    };
    const onCancel = () => cleanup();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  if (!cards) return null;
  if (cards.length === 0) return <EmptyHandHint />;

  const count = cards.length;
  const mid = (count - 1) / 2;
  const spacing =
    count > 1
      ? Math.min(CARD_WIDTH * 0.72, (MAX_FAN_WIDTH - CARD_WIDTH) / (count - 1))
      : 0;
  const fanWidth = spacing * (count - 1) + CARD_WIDTH;
  const tiltPerCard = Math.min(4, 26 / count);

  return (
    <>
      <FanContainer style={{ width: `${fanWidth}px` }}>
        {cards.map((card, index) => {
          const offset = index - mid;
          // outer cards droop DOWN for a natural fan; hover fully compensates
          // (see FanCard .lift) so drooped cards still lift into full view
          const droop = Math.abs(offset) ** 2 * spacing * 0.045;
          // hover styling is pure CSS (see FanCard) so pointing at a card
          // never re-renders the fan
          const fanVars = {
            left: `${index * spacing}px`,
            "--rot": `${offset * tiltPerCard}deg`,
            "--droop": `${-droop}px`,
            "--z": index,
          } as CSSProperties;
          return (
            <FanCard
              key={index + card.title}
              onDragStart={handleDragStart}
              onPointerDown={(e: React.PointerEvent) =>
                onCardPointerDown(e, index)
              }
              data-dragging={dragIndex != null}
              data-drag-source={dragIndex === index}
              style={fanVars}
            >
              <Box className="lift">
                <Card card={card} />
              </Box>
              {/* The +(commit) / –(discard) buttons are hidden: playing a
                  card is now drag-to-table, and discard lives in the menu.
                  commitFn stays wired (deprecated) for the commit modal. */}
              <Flex className="actions">
                <PopoverCardActions
                  actions={[
                    { text: "Discard", fn: () => functions.discardFn(index) },
                    ...(functions.playFn
                      ? [
                          {
                            text: "Place on table",
                            fn: () => functions.playFn?.(index),
                          },
                          {
                            text: "Place face-up on table",
                            fn: () =>
                              functions.playFn?.(index, { faceDown: false }),
                          },
                        ]
                      : []),
                    ...(functions.giveFn
                      ? (opponents ?? []).map((name) => ({
                          text: `Give card to ${name}`,
                          fn: () => functions.giveFn?.(index, name),
                        }))
                      : []),
                    {
                      text: "Place top of deck",
                      fn: () => functions.deckCardFn(index),
                    },
                    {
                      text: "Place bottom of deck",
                      fn: () => functions.deckCardBottomFn(index),
                    },
                  ]}
                />
              </Flex>
            </FanCard>
          );
        })}
      </FanContainer>
      {dragIndex != null && cards[dragIndex] && (
        <DragGhost
          ref={(el: HTMLDivElement | null) => {
            ghostRef.current = el;
            if (el && lastPointer.current)
              positionGhost(el, lastPointer.current.x, lastPointer.current.y);
          }}
        >
          <Card card={cards[dragIndex]} />
        </DragGhost>
      )}
    </>
  );
};

const EmptyHandHint = () => (
  <Flex
    position="fixed"
    bottom="1.25rem"
    left="50%"
    transform="translateX(-50%)"
    px="1.25rem"
    py="0.4rem"
    alignItems="center"
    border="1px dashed rgba(231, 204, 152, 0.45)"
    borderRadius="10rem"
    color="rgba(231, 204, 152, 0.75)"
    bg="rgba(44, 24, 49, 0.6)"
    fontFamily={fonts.SpaceGrotesk}
    fontSize="0.85rem"
    userSelect="none"
    zIndex={200}
  >
    No cards in hand — draw one
  </Flex>
);

const FanContainer = styled(Box)`
  position: fixed;
  bottom: -${CARD_HEIGHT * 0.18}px;
  left: 50%;
  transform: translateX(-50%);
  height: ${CARD_HEIGHT}px;
  pointer-events: none;
  z-index: 200;
`;

/** Card following the pointer during a drag-to-table. Positioned via
 * transform from pointer events; fixed + pointer-events:none so
 * elementFromPoint at drop sees the board underneath it. */
const DragGhost = styled(Box)`
  position: fixed;
  top: 0;
  left: 0;
  width: ${CARD_WIDTH}px;
  height: ${CARD_HEIGHT}px;
  pointer-events: none;
  z-index: 400;
  opacity: 0.85;
  filter: drop-shadow(0 10px 18px rgba(20, 8, 24, 0.55));
`;

const FanCard = styled(Box)`
  position: absolute;
  width: ${CARD_WIDTH}px;
  height: ${CARD_HEIGHT}px;
  pointer-events: auto;
  /* the fan never scrolls — let pointer drags own touch gestures too */
  touch-action: none;
  transform-origin: bottom center;
  bottom: var(--droop);
  z-index: var(--z);
  /* FanCard only rotates and never changes position/size — it is the
     stationary hover hit-target, so it never moves out from under the
     pointer (which is what caused the scale/lift twitch). */
  transform: rotate(var(--rot));
  filter: drop-shadow(0 4px 8px rgba(20, 8, 24, 0.45));

  /* The visual lift/scale lives on an inner layer that ignores the
     pointer, so growing it never changes what is being hovered. */
  .lift {
    width: 100%;
    height: 100%;
    pointer-events: none;
    transform-origin: bottom center;
    will-change: transform;
    transition: transform 0.15s cubic-bezier(0.2, 0.9, 0.3, 1.15);
  }

  &:hover {
    z-index: 300;
  }

  &:hover .lift {
    /* Counter-rotate first so the card straightens to upright (edge cards
       no longer pop up tilted/cropped); with the parent rotation cancelled
       the translate/scale act in screen space, so it rises straight up.
       Adding var(--droop) makes every card converge to the SAME lifted
       height regardless of how far it droops at rest. */
    transform: rotate(calc(-1 * var(--rot)))
      translateY(calc(var(--droop) - ${CARD_HEIGHT * 0.55}px))
      scale(1.85);
  }

  .actions {
    display: none;
    position: absolute;
    bottom: -0.55rem;
    left: 50%;
    transform: translateX(-50%);
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;

    > p {
      font-size: 0.8rem;
      line-height: 1;
      padding: 0.2rem 0.55rem;
      border-radius: 10rem;
      background-color: ${colors.brand.primary};
      color: ${colors.brand.surfaceDim};
      font-weight: 700;
      box-shadow: 0 1px 3px rgba(20, 8, 24, 0.4);
      transition: background-color 0.15s;

      &:hover {
        background-color: ${colors.brand.highlight};
      }
    }
  }

  &:hover .actions {
    display: flex;
    /* ride up with the lifted card so the buttons land just below its
       bottom edge and stay on-screen + clickable (no scale, full size);
       counter-rotate too so they sit level under the upright card */
    transform: rotate(calc(-1 * var(--rot))) translateX(-50%)
      translateY(calc(var(--droop) - ${CARD_HEIGHT * 0.55}px));
  }

  /* while any card is being dragged to the table the fan goes quiet: no
     hover lift or action buttons fighting the ghost for attention */
  &[data-dragging="true"]:hover .lift {
    transform: none;
  }
  &[data-dragging="true"]:hover .actions {
    display: none;
  }
  &[data-drag-source="true"] {
    opacity: 0.35;
  }
`;
