import { BoardCanvas } from "@/components/BoardCanvas";
import { Carousel } from "@/components/Game/game.carousel";
import { GameLayout } from "@/components/Game/game.layout";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useState } from "react";

const GamePage = () => {
  const router = useRouter();
  const slug = router.query;
  const [showStats, setShowStats] = useState<boolean>(false);

  return (
    <GameLayout>
      <Flex bg="purple" p={3} w="100%" justifyContent="space-between">
        <Text fontFamily={"SpaceGrotesk"} fontSize={"3rem"} color="white">
          Game
        </Text>
        {showStats && <Box h={"300px"} />}
        <Button
          onClick={() => {
            setShowStats(!showStats);
          }}
        >
          big
        </Button>
      </Flex>
      <Box h={"100%"}>
        <BoardCanvas src="jpark.svg" move={() => {}} />
      </Box>
      <Box bg="purple" w="100%" alignItems="end">
        <Carousel />
      </Box>
    </GameLayout>
  );
};

export default GamePage;
