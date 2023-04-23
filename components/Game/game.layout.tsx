import { Box, Flex } from "@chakra-ui/react";
import { ReactNode } from "react";

type GameBoardLayoutType = {
  children: ReactNode;
};
export const GameLayout = ({ children }: GameBoardLayoutType) => {
  return (
    <Flex
      bg="antiquewhite"
      h={"100svh"}
      flexDir="column"
      justifyContent="space-between"
    >
      {children}
    </Flex>
  );
};
