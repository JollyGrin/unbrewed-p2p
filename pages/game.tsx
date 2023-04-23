import { BoardCanvas } from "@/components/BoardCanvas";
import { Carousel } from "@/components/Game/game.carousel";
import { GameLayout } from "@/components/Game/game.layout";
import { TriangleDownIcon, TriangleUpIcon } from "@chakra-ui/icons";
import { Box, Button, Flex, Tag, Text } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useState } from "react";

const GamePage = () => {
  const router = useRouter();
  const slug = router.query;
  const [showStats, setShowStats] = useState<boolean>(false);
  const stats = { showStats, setShowStats };

  return (
    <GameLayout>
      <HeaderContainer {...stats} />
      <BoardContainer />
      <HandContainer />
    </GameLayout>
  );
};

export default GamePage;

const HeaderContainer = ({
  showStats,
  setShowStats,
}: {
  showStats: boolean;
  setShowStats: (e: boolean) => void;
}) => {
  return (
    <Flex
      bg="purple"
      p={3}
      w="100%"
      justifyContent="space-between"
      gap={"10px"}
    >
      <Tag fontFamily={"SpaceGrotesk"} fontSize={"1rem"} bg="antiquewhite">
        Game
      </Tag>
      {showStats && <Box h={"300px"} />}
      <Button
        fontSize="12px"
        onClick={() => {
          setShowStats(!showStats);
        }}
      >
        {!showStats ? <TriangleDownIcon /> : <TriangleUpIcon />}
      </Button>
    </Flex>
  );
};

const BoardContainer = () => {
  return (
    <Box h={"100%"}>
      <BoardCanvas src="jpark.svg" move={() => {}} />
    </Box>
  );
};

const HandContainer = () => {
  return (
    <Box bg="purple" w="100%" alignItems="end">
      <Carousel />
    </Box>
  );
};
