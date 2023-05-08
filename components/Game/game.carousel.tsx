//@ts-nocheck
import { mockDeck } from "@/_mocks_/deck";
import React, { useState } from "react";
import AliceCarousel from "react-alice-carousel";
import "react-alice-carousel/lib/alice-carousel.css";
import { CardFactory } from "../CardFactory/card.factory";
import { Box, Flex } from "@chakra-ui/react";
import { DeckImportCardType, DeckImportType } from "../DeckPool/deck-import.type";

const handleDragStart = (e) => e.preventDefault();

const { cards } = mockDeck.deck_data;


export const cardItemMapper = (cards: DeckImportCardType[], props) =>
  cards.map((card, index) => (
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

const defaultCardItems = cards.map((card, index) => (
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
