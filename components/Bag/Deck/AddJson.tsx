import {
  Box,
  Flex,
  Text,
  Textarea,
  HStack,
  Button,
  FormLabel,
  Input,
} from "@chakra-ui/react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalDeckStorage } from "@/lib/hooks";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useJsonCheck } from "@/lib/hooks/useJsonCheck";
import { SubToggle } from "@/components/Bag/AddDeckHub/SubToggle";

/**
 * Import a raw deck JSON, either pasted as text or fetched from a URL.
 * Rendered bare inside AddDeckHub's focused view.
 */
export const AddJson = ({
  onAdded,
}: {
  onAdded?: (deckId: string) => void;
}) => {
  const { pushDeck } = useLocalDeckStorage();
  const [mode, setMode] = useState<"text" | "url">("text");

  const [json, setJson] = useState<string>("");
  const [url, setUrl] = useState<string>();
  const { data: isJsonValid } = useJsonCheck(json);

  const { data: urlData, isFetching } = useQuery(
    ["urlData", url],
    async () => await axios.get(url ?? ""),
    { enabled: !!url },
  );

  const addDeck = (raw: unknown) => {
    try {
      const deck = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!deck?.id || !deck?.deck_data) {
        toast.error("That JSON isn't a deck (needs an id and deck_data)");
        return;
      }
      pushDeck(deck);
      toast.success(`${deck.name ?? "Deck"} added to your bag`);
      onAdded?.(deck.id);
    } catch {
      toast.error("Couldn't read that JSON");
    }
  };

  return (
    <Flex direction="column" color="brand.secondary">
      <Text fontSize="0.9rem" opacity={0.85} mb="0.75rem">
        Already have a deck&apos;s raw JSON? Paste it in, or point us at a URL
        that returns it.
      </Text>

      <SubToggle
        value={mode}
        onChange={(v) => setMode(v as "text" | "url")}
        options={[
          { value: "text", label: "Paste text" },
          { value: "url", label: "From URL" },
        ]}
      />

      <Box mt="0.75rem">
        {mode === "text" ? (
          <>
            <HStack mb="0.5rem" fontSize="0.85rem">
              <Box
                boxSize="0.85rem"
                borderRadius="full"
                bg={isJsonValid ? "brand.positive" : "brand.danger"}
              />
              <Text>{isJsonValid ? "Valid JSON" : "Not valid JSON yet"}</Text>
            </HStack>
            <Textarea
              bg="white"
              fontSize="0.65rem"
              h="120px"
              placeholder="Paste the deck JSON here…"
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
            <FormLabel fontSize="0.7rem" mt="0.35rem" opacity={0.7}>
              We only check that it&apos;s valid JSON, not that the contents
              are a real deck.
            </FormLabel>
            <Button
              mt="0.25rem"
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              isDisabled={!isJsonValid}
              onClick={() => addDeck(json)}
            >
              Add deck
            </Button>
          </>
        ) : (
          <>
            <Input
              bg="white"
              size="sm"
              placeholder="https://example.com/my-deck.json"
              onChange={(e) => setUrl(e.target.value)}
              value={url ?? ""}
            />
            <Button
              mt="0.6rem"
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              isLoading={isFetching}
              isDisabled={!urlData?.data}
              onClick={() => addDeck(urlData?.data)}
            >
              Add deck from URL
            </Button>
          </>
        )}
      </Box>
    </Flex>
  );
};
