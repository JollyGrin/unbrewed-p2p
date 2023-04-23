//@ts-nocheck
import { mockDeck } from "@/_mocks_/deck";
import React, { useState } from "react";
import AliceCarousel from "react-alice-carousel";
import "react-alice-carousel/lib/alice-carousel.css";
import { CardFactory } from "../CardFactory/card.factory";
import { Box, Flex } from "@chakra-ui/react";

const handleDragStart = (e) => e.preventDefault();

const { cards } = mockDeck.deck_data;

const cardItems = cards.map((card) => (
  <Flex
    h={"200px"}
    w={"150px"}
    my={5}
    onDragStart={handleDragStart}
    // justifyContent={"center"}
  >
    <CardFactory card={card} />
  </Flex>
));

export const Carousel = () => {
  return (
    <AliceCarousel
      mouseTracking
      disableDotsControls
      disableButtonsControls
      items={cardItems}
      autoWidth="100%"
    />
  );
};
