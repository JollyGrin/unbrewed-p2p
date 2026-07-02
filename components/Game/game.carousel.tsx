import React, { CSSProperties } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Card } from "../CardFactory/Card";
import { DeckImportCardType } from "../DeckPool/deck-import.type";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { PopoverCardActions } from "./card-actions.popover";

const CARD_WIDTH = 150;
const CARD_HEIGHT = 200;
/** widest the fan is allowed to spread before cards overlap tighter */
const MAX_FAN_WIDTH = 950;

const handleDragStart = (e: React.DragEvent) => {
  e.preventDefault();
};

type CardWrapperProps = {
  cards: DeckImportCardType[] | undefined;
  functions: {
    discardFn: (index: number) => void;
    commitFn: (index: number) => void;
    boostFn: (index: number) => void;
    deckCardFn: (index: number) => void;
    deckCardBottomFn: (index: number) => void;
  };
};

/**
 * Hand of cards fanned in an arc, floating over the board like a
 * physical hand held at the table edge.
 */
export const HandFan: React.FC<CardWrapperProps> = ({ cards, functions }) => {
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
    <FanContainer style={{ width: `${fanWidth}px` }}>
      {cards.map((card, index) => {
        const offset = index - mid;
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
            style={fanVars}
          >
            <Card card={card} />
            <Flex className="actions">
              <Text title="Commit" onClick={() => functions.commitFn(index)}>
                +
              </Text>
              <Text title="Discard" onClick={() => functions.discardFn(index)}>
                –
              </Text>
              <PopoverCardActions
                actions={[
                  { text: "Boost", fn: () => functions.boostFn(index) },
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

const FanCard = styled(Box)`
  position: absolute;
  width: ${CARD_WIDTH}px;
  height: ${CARD_HEIGHT}px;
  pointer-events: auto;
  transform-origin: bottom center;
  bottom: var(--droop);
  z-index: var(--z);
  transform: rotate(var(--rot));
  will-change: transform;
  transition:
    transform 0.15s cubic-bezier(0.2, 0.9, 0.3, 1.15),
    bottom 0.15s ease;
  filter: drop-shadow(0 4px 8px rgba(20, 8, 24, 0.45));

  &:hover {
    bottom: 0;
    z-index: 300;
    transform: translateY(-${CARD_HEIGHT * 0.55}px) scale(1.85);
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
  }
`;
