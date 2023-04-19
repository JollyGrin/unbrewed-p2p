import { mockDeck } from "@/_mocks_/deck";
import { CardFactory } from "@/components/CardTemplate/card.factory";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { Box, Button, Flex, Grid, Tag, Text } from "@chakra-ui/react";
import { useState } from "react";

const CardPage = () => {
  const [cardIndex, setCardIndex] = useState<number>(0);
  const card = mockDeck.deck_data.cards[cardIndex];
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
          {cardIndex < mockDeck.deck_data.cards.length - 1 && (
            <Button onClick={() => setCardIndex(cardIndex + 1)}>+</Button>
          )}
          {cardIndex > 0 && (
            <Button onClick={() => setCardIndex(cardIndex - 1)}>-</Button>
          )}
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
          {card &&
            Object.entries(card).map((value) => (
              <Flex
                key={value[0]}
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
      <CardFactory card={card} />
    </Box>
  );
};

export default CardPage;
