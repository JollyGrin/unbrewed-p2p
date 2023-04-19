import { mockDeck } from "@/_mocks_/deck";
import CardTemplate from "@/components/CardTemplate/CardTemplate";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { Box, Flex, Grid, Tag, Text } from "@chakra-ui/react";

const CardPage = () => {
  const card = mockDeck.deck_data.cards[4];
  return (
    <>
      <Grid
        gridTemplateRows={"1fr 5fr 2fr"}
        gap="10px"
        h="100vh"
        w="100%"
        bg={"saddlebrown"}
      >
        <Box bg="sienna" w="100%" h="100%">
          <Text fontFamily={"BebasNeueRegular"} fontSize={"30px"}>
            Testing
          </Text>
        </Box>
        <Flex
          bg="tan"
          w="100%"
          h="100%"
          justifyContent={"center"}
          alignItems={"center"}
        >
          <Card card={card} />
        </Flex>
        <Flex flexWrap={"wrap"}>
          {Object.entries(card).map((value) => (
            <Flex
              display={value[1] ? "flex" : "none"}
              border={"1px solid black"}
              margin={1}
            >
              <Tag bg="gray">{value[0]}:</Tag>
              <Tag>{value[1]}</Tag>
            </Flex>
          ))}
        </Flex>
      </Grid>
    </>
  );
};

const Card: React.FC<{ card: DeckImportCardType }> = ({ card }) => {
  return (
    <Box w="300px" h="auto">
      {
        //@ts-ignore
        <CardTemplate card={card} />
      }
    </Box>
  );
};

export default CardPage;
