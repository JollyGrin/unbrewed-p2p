import { Flex, Text } from "@chakra-ui/react";

export const DeckSlot = ({
  abbrev,
  id,
  setSelectedDeck,
  isSelected,
  star,
}: {
  abbrev: string;
  id: string;
  setSelectedDeck: any;
  star: string;
  isSelected: boolean;
}) => {
  const isStarred = star === id;
  return (
    <Flex
      m={2}
      bg={`rgba(0,0,0,0.${isSelected ? 50 : 25})`}
      w="100px"
      height="100px"
      borderRadius={5}
      justifyContent={"center"}
      alignItems={"center"}
      userSelect={"none"}
      cursor={"pointer"}
    >
      {abbrev && (
        <Flex
          bg="brand.secondary"
          h="85%"
          w="85%"
          borderRadius={"inherit"}
          border={isStarred ? "5px solid gold" : ""}
          p={2}
          color="antiquewhite"
          justifyContent={"center"}
          alignItems={"center"}
          onClick={(e) => {
            e.preventDefault();
            setSelectedDeck(id);
          }}
        >
          <Text fontWeight={700} fontSize={"1.5rem"}>
            {abbrev}
          </Text>
        </Flex>
      )}
    </Flex>
  );
};
