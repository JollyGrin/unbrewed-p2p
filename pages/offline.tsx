import { useLocalDeckStorage } from "@/lib/hooks";
import { Box } from "@chakra-ui/react";

const Offline = () => {
  const { star, decks } = useLocalDeckStorage();
  const deck = decks?.find((deck) => deck.id === star);

  return (
    <Box h="100vh" bg="brand.primary">
      dhjska
    </Box>
  );
};

export default Offline;
