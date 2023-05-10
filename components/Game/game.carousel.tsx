//@ts-nocheck
import { mockDeck } from "@/_mocks_/deck";
import React, { useState } from "react";
import AliceCarousel from "react-alice-carousel";
import "react-alice-carousel/lib/alice-carousel.css";
import { CardFactory } from "../CardFactory/card.factory";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import {
  DeckImportCardType,
  DeckImportType,
} from "../DeckPool/deck-import.type";
import styled from "@emotion/styled";

const handleDragStart = (e) => {
  console.log({ e });
  e.preventDefault();
};

const { cards: mockCards } = mockDeck.deck_data;

type CardWrapperProps = {
  cards: DeckImportCardType[];
  functions: {
    discardFn: (index: number) => PoolType;
  };
};
export const cardItemMapper = ({ cards, functions }: CardWrapperProps) => {
  return cards.map((card, index) => {
    return (
      <CardWrapper
        key={index + card.title}
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
          {/* <Text>+</Text> */}
          <Text onClick={() => functions.discardFn(index)}>-</Text>
        </Flex>
      </CardWrapper>
    );
  });
};

const CardWrapper = styled(Flex)`
  height: 200px;
  width: 150px;
  margin: 0.5rem 0;
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

    & * {
      font-size: 0.8rem;
      margin-top: 0.1rem;
      padding: 0.1rem 0.5rem;
      border-radius: 10rem;
      background-color: antiquewhite;
      transform: translateY(-0.9rem);
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
