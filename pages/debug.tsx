import { Navbar } from "@/components/Navbar";
import { PageSeo } from "@/components/Helmet/Head";
import { clearDeviceCopy, stores } from "@/lib/bag/bagStore";
import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { toast } from "react-hot-toast";

export default function DebugPage() {
  // Only this browser's copy — an account bag is not what a corrupted
  // localStorage means, and blowing it away from a debug screen would be a
  // very bad surprise (#644).
  function clearDecks() {
    clearDeviceCopy(stores.decks);
    toast.success("Decks cleared from this browser");
  }

  function clearMaps() {
    clearDeviceCopy(stores.maps);
    toast.success("Maps cleared from this browser");
  }
  return (
    <Box h="100vh" bg="brand.secondary" color="brand.primary">
      <PageSeo path="/debug" title="Debug — Unbrewed" noindex />
      <Navbar />
      <VStack pt="3rem">
        <Text fontSize="2rem" fontWeight={700}>
          Debug Screen
        </Text>
        <Text>
          99% of the time, isses with the app come from a corrupted localStorage
          of your deck or map data. This clears only what this browser is
          holding; anything saved to your account is untouched.
        </Text>
        <HStack gap="1rem">
          <Button onClick={clearDecks}>Clear Deck Storage</Button>
          <Button onClick={clearMaps}>Clear Map Storage</Button>
        </HStack>
      </VStack>
    </Box>
  );
}
