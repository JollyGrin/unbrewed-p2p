import { mockDeck } from "@/_mocks_/deck";
import { BoardCanvas } from "@/components/BoardCanvas";
import { CardFactory } from "@/components/CardFactory/card.factory";
import { Box, Flex, Text } from "@chakra-ui/react";

const BoardPage = () => {
  return (
    <Box bg="darkgoldenrod" h="100vh">
      <Flex
        flexDir={"column"}
        justifyContent="center"
        alignItems="center"
        w="100%"
        height={"5rem"}
      >
        <Text fontSize={"2rem"}>Unbrewed New Game</Text>
      </Flex>
      <BoardCanvas />
      <Flex
        h={"250px"}
        gap={"25px"}
        p={"0 2rem"}
        transform={"translateY(-50px)"}
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
