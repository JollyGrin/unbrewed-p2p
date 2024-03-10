import { BoardCanvas } from "@/components/BoardCanvas";
import { PositionType } from "@/components/Positions/position.type";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";

const initData: PositionType[] = [
  { id: "hero", x: 200, y: 500 },
  { id: "sidekick", x: 200, y: 300 },
  { id: "enemey", x: 200, y: 400 },
];

const BoardPage = () => {
  const [board, setBoard] = useState<`${string}.svg`>("jpark.svg");
  const [dynamicData, setDynamicData] = useState<PositionType[]>(initData);
  return (
    <Box bg="darkgoldenrod" h="100vh" p={2}>
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
                }),
              )
            }
          >
            hero +10 y
          </Button>
        </Flex>
      </Flex>
      <Box h={"600px"} w={"100%"}>
        board disabled, use game
        {/* <BoardCanvas src={board} data={dynamicData} move={setDynamicData} /> */}
      </Box>
    </Box>
  );
};

export default BoardPage;
