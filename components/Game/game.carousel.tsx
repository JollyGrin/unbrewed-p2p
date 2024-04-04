//@ts-nocheck
import { mockDeck } from "@/_mocks_/deck";
import React, { useEffect, useRef, useState } from "react";
import AliceCarousel from "react-alice-carousel";
import "react-alice-carousel/lib/alice-carousel.css";
import { CardFactory } from "../CardFactory/card.factory";
import {
  Box,
  Button,
  Flex,
  Popover,
  Select,
  Skeleton,
  Spacer,
  Text,
} from "@chakra-ui/react";
import {
  DeckImportCardType,
  DeckImportType,
} from "../DeckPool/deck-import.type";
import styled from "@emotion/styled";
import { CarouselTray } from "./game.styles";
import { PoolType } from "../DeckPool/PoolFns";
import { PopoverCardActions } from "./card-actions.popover";

const handleDragStart = (e) => {
  e.preventDefault();
};

const { cards: mockCards } = mockDeck.deck_data;

type CardWrapperProps = {
  cards: DeckImportCardType[] | undefined;
  functions: {
    discardFn: (index: number) => void;
    commitFn: (index: number) => PoolType;
    boostFn: (index: number) => PoolType;
    deckCardFn: (index: number) => PoolType;
    deckCardBottomFn: (index: number) => PoolType;
  };
};

export const cardItemMapper = ({ cards, functions }: CardWrapperProps) => {
  return cards.map((card, index) => {
    return (
      <Box key={index + card.title}>
        <CardWrapper
          flexDir={"column"}
          onDragStart={handleDragStart}
          transition="all 0.25s ease-in-out"
          _hover={{
            transform: "scale(1.7) translateY(-35px)",
            position: "relative",
            zIndex: "200",
            filter: "saturate(2)",
          }}
        >
          <CardFactory card={card} />
          <Flex className="hoveritem">
            <Text onClick={() => functions.discardFn(index)}>-</Text>
          </Flex>
        </CardWrapper>
      </Box>
    );
  });
};

export const HandCardItems: React.FC<CardWrapperProps> = ({
  cards,
  functions,
}) => {
  const carouselRef = useRef();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setStartX(e.pageX - carouselRef.current!.offsetLeft);
    setScrollLeft(carouselRef.current!.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - carouselRef.current!.offsetLeft;
    const walk = (x - startX) * 1; // Adjust the drag speed here
    carouselRef.current!.scrollLeft = scrollLeft - walk;
  };

  return (
    <CarouselTray
      ref={carouselRef}
      className="flex-container"
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      <Spacer />
      <Flex opacity={0}>
        {/* HACK: hover makes first card go outside screen, width doesn't adjust */}
        xxxxxxxxxxx
      </Flex>
      {cards ? (
        cards
          ?.filter((card) => !!card?.title)
          ?.map((card, index) => (
            <Box key={index + card.title}>
              <CardWrapper
                flexDir={"column"}
                onDragStart={handleDragStart}
                transition="all 0.25s ease-in-out"
                _hover={{
                  transform: "scale(2) translateY(-40px)",
                  position: "relative",
                  zIndex: "200",
                  filter: "saturate(2)",
                }}
              >
                <CardFactory card={card} />
                <Flex className="hoveritem">
                  <Text onClick={() => functions.commitFn(index)}>+</Text>
                  <Text onClick={() => functions.discardFn(index)}>-</Text>
                  <PopoverCardActions
                    actions={[
                      {
                        text: "Boost",
                        fn: () => functions.boostFn(index),
                      },
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
              </CardWrapper>
            </Box>
          ))
      ) : (
        <Skeleton h="240px" />
      )}
      <Box w="2rem" />
      {cards?.length === 0 && <Skeleton h="240px" />}
    </CarouselTray>
  );
};

const CardWrapper = styled(Flex)`
  height: 200px;
  width: 150px;
  margin: 0.3rem 0;
  align-items: center;
  justify-content: center;
  transition: all 0.25s ease-in-out;

  &:hover {
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  }

  .hoveritem {
    display: none;
    cursor: pointer;
    user-select: none;

    > p {
      font-size: 0.8rem;
      margin-top: 0.1rem;
      padding: 0.1rem 0.5rem;
      border-radius: 10rem;
      background-color: antiquewhite;
      transform: translateY(-0.9rem) translateX(-0.8rem);
    }
  }

  &:active .hoveritem,
  &:hover .hoveritem {
    display: flex;
    gap: 1rem;
  }
`;

export const deckItemMapper = (deck: DeckImportType, props) =>
  deck?.deck_data?.cards.map((card, index) => (
    <Flex
      key={index + card.title}
      h={"200px"}
      w={"150px"}
      onDragStart={handleDragStart}
      {...props}
    >
      <CardFactory card={card} />
    </Flex>
  ));

const defaultCardItems = mockCards.map((card, index) => (
  <Flex
    key={index + card.title}
    h={"200px"}
    w={"150px"}
    my={5}
    onDragStart={handleDragStart}
    // justifyContent={"center"}
  >
    <CardFactory card={card} />
  </Flex>
));

export const Carousel = ({ items = defaultCardItems }) => {
  return (
    <AliceCarousel
      mouseTracking
      disableDotsControls
      disableButtonsControls
      items={items}
      autoWidth="100%"
    />
  );
};
