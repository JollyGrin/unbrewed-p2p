import { mockDeck } from "@/_mocks_/deck";
import { BoardCanvas, Circle } from "@/components/BoardCanvas";
import { CardFactory } from "@/components/CardFactory/card.factory";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";

const initData: Circle[] = [
  { id: "hero", x: 200, y: 500, r: 10 },
  { id: "sidekick", x: 200, y: 300, r: 10 },
  { id: "enemey", x: 200, y: 400, r: 10 },
];

const BoardPage = () => {
  const [board, setBoard] = useState<`${string}.svg`>("jpark.svg");
  const [dynamicData, setDynamicData] = useState<Circle[]>(initData);
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
        <Flex minH={"4rem"} gap={"10px"} p={1}>
          <Button onClick={() => setBoard("jpark.svg")}>Jurassic</Button>
          <Button onClick={() => setBoard("sarpeoon.svg")}>Sarpeoon</Button>
          <Button
            onClick={() =>
              setDynamicData(
                dynamicData.map((circle) => {
                  if (circle.id !== "hero") return circle;
                  return {
                    ...circle,
                    y: circle.y + 10,
                  };
                })
              )
            }
          >
            hero +10 y
          </Button>
        </Flex>
      </Flex>
      <BoardCanvas src={board} data={dynamicData} move={setDynamicData} />
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
