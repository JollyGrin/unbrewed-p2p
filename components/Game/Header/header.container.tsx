import { Flex } from "@chakra-ui/react";
import { StatTag } from "../game.styles";

export const HeaderContainer = () => {
  return (
    <Flex
      bg="purple"
      p={3}
      w="100%"
      justifyContent="space-between"
      alignItems="center"
      gap={"10px"}
      minH={"10svh"}
    >
      <Flex gap={2} maxHeight={"2.5rem"}>
        <StatTag>
          <div className="number">16</div>
          Thrall ⚔️
        </StatTag>
        <StatTag opacity={0.8}>
          <div className="number">x4</div>
          Totem ⚔️
        </StatTag>

        <StatTag>
          <div className="number">12</div>
          Robin Hood 🏹
        </StatTag>
      </Flex>
    </Flex>
  );
};
