import { mockDeck } from "@/_mocks_/deck";
import { BoardCanvas } from "@/components/BoardCanvas";
import { CardFactory } from "@/components/CardFactory/card.factory";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";

const BoardPage = () => {
  const [board, setBoard] = useState<`${string}.svg`>("jpark.svg");
  return (
    <Box bg="darkgoldenrod" h="100vh">
      <Flex
        flexDir={"column"}
        justifyContent="center"
        alignItems="center"
        w="100%"
        height={"10%"}
        minH={"5rem"}
      >
        <Text fontSize={"2rem"}>Unbrewed New Game</Text>
        <Flex minH={"4rem"}>
          <Button onClick={() => setBoard("jpark.svg")}>Jurassic</Button>
          <Button onClick={() => setBoard("sarpeoon.svg")}>Sarpeoon</Button>
        </Flex>
      </Flex>
      <BoardCanvas src={board} />
      <Flex
        h={"20%"}
        gap={"25px"}
        p={"0 2rem"}
        marginBottom={"-100px"}
        transform={"translateY(-100px)"}
        justifyContent={"center"}
        overflowX={"hidden"}
      >
        <CardFactory card={mockDeck.deck_data.cards[0]} />
        <CardFactory card={mockDeck.deck_data.cards[1]} />
        <CardFactory card={mockDeck.deck_data.cards[2]} />
        <CardFactory card={mockDeck.deck_data.cards[3]} />
      </Flex>
    </Box>
  );
};

export default BoardPage;
