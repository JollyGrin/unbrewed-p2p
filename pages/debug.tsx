import { Navbar } from "@/components/Navbar";
import { LS_KEY } from "@/lib/hooks";
import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { toast } from "react-hot-toast";

export default function DebugPage() {
  function clearDecks() {
    localStorage.removeItem(LS_KEY.DECKS);
    toast.success("Decks cleared");
  }

  function clearMaps() {
    localStorage.removeItem(LS_KEY.MAP_LIST);
    toast.success("Maps cleared");
  }
  return (
    <Box h="100vh" bg="brand.secondary" color="brand.primary">
      <Navbar />
      <VStack pt="3rem">
        <Text fontSize="2rem" fontWeight={700}>
          Debug Screen
        </Text>
        <Text>
          99% of the time, isses with the app come from a corrupted localStorage
          of your deck or map data.
        </Text>
        <HStack gap="1rem">
          <Button onClick={clearDecks}>Clear Deck Storage</Button>
          <Button onClick={clearMaps}>Clear Map Storage</Button>
        </HStack>
      </VStack>
    </Box>
  );
}
