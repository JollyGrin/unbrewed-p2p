import { Flex, Tag, Text } from "@chakra-ui/react";

import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import Link from "next/link";

export const SelectedDeckContainer = () => {
  const { starredDeck } = useLocalDeckStorage();
  return (
    <Flex
      flexDir={"column"}
      w="100%"
      justifyContent={"center"}
      alignItems={"center"}
      gap={3}
    >
      {starredDeck === undefined ? (
        <>
          <Flex
            as={Link}
            href={"/bag"}
            role="group"
            w="200px"
            h="300px"
            justifyContent="center"
            alignItems="center"
            bg="brand.secondary"
            border="0.25rem dashed"
            borderColor="brand.primary"
            boxShadow="inset 0 0 20px rgba(0,0,0,0.35)"
            borderRadius="0.5rem"
            flexDir={"column"}
            gap={2}
            cursor="pointer"
            transition="all 0.25s ease-in-out"
            _hover={{ borderColor: "brand.highlight", transform: "translateY(-2px)" }}
          >
            <Text
              fontSize="5xl"
              lineHeight="1"
              color="brand.primary"
              _groupHover={{ color: "brand.highlight" }}
            >
              +
            </Text>
            <Text
              color="brand.primary"
              fontSize="0.85rem"
              px={4}
              textAlign="center"
            >
              Star a deck in your bag
            </Text>
          </Flex>
          <Text color="brand.secondary" fontSize="0.85rem" opacity={0.7}>
            No deck selected yet
          </Text>
        </>
      ) : (
        <>
          <Flex
            as={Link}
            href="/bag"
            w="200px"
            h="300px"
            bg={starredDeck.deck_data.appearance.highlightColour}
            bgImage={starredDeck.deck_data?.appearance?.cardbackUrl}
            bgSize="cover"
            bgPosition="center"
            border={`0.25rem solid ${starredDeck.deck_data.appearance.borderColour}`}
            justifyContent="center"
            alignItems="center"
            boxShadow="0 0 5px rgba(0,0,0,0.5)"
            borderRadius={5}
            flexDir={"column"}
            transition="all 0.35s ease-in-out"
            _hover={{
              boxShadow: "0 0 10px rgba(0,0,0,0.55)",
              filter: "saturate(1.1)",
            }}
            cursor="pointer"
          >
            <Text
              display={
                starredDeck?.deck_data?.appearance?.cardbackUrl
                  ? "none"
                  : "inline"
              }
              fontSize="4xl"
              fontFamily={"monospace"}
              color={starredDeck.deck_data.appearance.borderColour}
              _hover={{ color: "gold" }}
            >
              {starredDeck.name.substring(0, 2)}
            </Text>
          </Flex>
          <Tag
            p={2}
            fontFamily={"monospace"}
            fontSize={"1.1rem"}
            bg="brand.secondary"
            color="brand.primary"
          >
            {starredDeck.name}
          </Tag>
        </>
      )}
    </Flex>
  );
};
