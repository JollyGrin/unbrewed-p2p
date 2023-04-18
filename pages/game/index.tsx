import { Box, Button, Spinner, Text, Textarea } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useState } from "react";
import { FaBeer, FaAddressBook } from "react-icons/fa";
import axios from "axios";
import { useDebounce } from "use-debounce";
import { mockDeck } from "@/_mocks_/deck";
import Pool from "@/lib/classes/Pool";

const P2PContainer = () => {
  const router = useRouter();
  const slug = router.query;

  const [deckData, setDeckData] = useState<string>("");
  const [deckDataDebounced] = useDebounce(deckData, 300);

  const { data, isLoading } = useQuery(["myData"], async () => {
    try {
      const result = await axios.get(
        "https://booth.innkeeper.link/api/booths/future"
      );
      console.log({ result });
      return result;
    } catch (err) {
      console.error(err);
    }
  });

  console.log({ data });
  return (
    <Box>
      <Text>{JSON.stringify(slug)}</Text>
      {isLoading && <Spinner />}
      {data && <Text>{JSON.stringify(data.data)}</Text>}
      <Button onClick={() => setDeckData(JSON.stringify(mockDeck))}>
        Set mock Deck
      </Button>
      <Box pt={3}>
        <Textarea
          onChange={(e) => {
            console.log("hi", e.target.value);
            setDeckData(e.target.value);
          }}
        />
      </Box>
      <Text>{JSON.stringify(deckDataDebounced)}</Text>
    </Box>
  );
};

export default P2PContainer;
