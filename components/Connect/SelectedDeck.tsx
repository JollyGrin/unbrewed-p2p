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
            w="100px"
            h="100px"
            justifyContent="center"
            alignItems="center"
            bg="saddlebrown"
            boxShadow="inset 0 0 10px black"
            borderRadius={5}
            flexDir={"column"}
          >
            <Link href={"/bag"}>
              <Text
                fontSize="6xl"
                color="goldenrod"
                cursor="pointer"
                _hover={{ color: "gold" }}
              >
                +
              </Text>
            </Link>
          </Flex>
          <Text>
            No deck selected! <br /> Star a deck from your bag
          </Text>
        </>
      ) : (
        <>
          <Flex
            w="100px"
            h="100px"
            bg={starredDeck.deck_data.appearance.highlightColour}
            bgImage={starredDeck.deck_data?.appearance?.cardbackUrl}
            bgSize="125%"
            bgPosition="center"
            border={`0.5rem solid ${starredDeck.deck_data.appearance.borderColour}`}
            justifyContent="center"
            alignItems="center"
            boxShadow="0 0 10px rgba(0,0,0,0.5)"
            borderRadius={5}
            flexDir={"column"}
            transition="all 0.25s ease-in-out"
            _hover={{ boxShadow: "0 0 20px rgba(0,0,0,0.55)" }}
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
          <Tag p={2} fontFamily={"monospace"} fontSize={"1.1rem"}>
            {starredDeck.name}
          </Tag>
        </>
      )}
    </Flex>
  );
};
