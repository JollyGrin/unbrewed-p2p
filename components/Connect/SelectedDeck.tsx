import { Flex, Select, Spinner, Tag, Text } from "@chakra-ui/react";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import Link from "next/link";

type Props = {
  isLoading?: boolean;
  error?: boolean;
  /**
   * Deck state is owned by ConnectPage: `useLocalDeckStorage` instances don't
   * sync after mount, so the tile, the switcher and the Connect button's
   * `hasDeck` gate all have to read from the same one.
   */
  starredDeck?: DeckImportType;
  decks?: DeckImportType[];
  setStar: (id: string) => void;
};

export const SelectedDeckContainer = (props: Props) => {
  const { isLoading, error, starredDeck, decks, setStar } = props;
  return (
    <Flex
      flexDir={"column"}
      w="100%"
      justifyContent={"center"}
      alignItems={"center"}
      gap={3}
    >
      {starredDeck === undefined && isLoading ? (
        <>
          <Flex
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
            gap={3}
          >
            <Spinner size="lg" color="brand.primary" />
            <Text
              color="brand.primary"
              fontSize="0.85rem"
              px={4}
              textAlign="center"
            >
              Importing your deck…
            </Text>
          </Flex>
          <Text color="brand.secondary" fontSize="0.85rem" opacity={0.7}>
            Fetching the deck from your invite link
          </Text>
        </>
      ) : starredDeck === undefined && error ? (
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
            borderColor="tomato"
            boxShadow="inset 0 0 20px rgba(0,0,0,0.35)"
            borderRadius="0.5rem"
            flexDir={"column"}
            gap={2}
            cursor="pointer"
            transition="all 0.25s ease-in-out"
          >
            <Text
              color="tomato"
              fontSize="0.85rem"
              px={4}
              textAlign="center"
              fontWeight={700}
            >
              Couldn&apos;t load that deck
            </Text>
            <Text
              color="brand.primary"
              fontSize="0.8rem"
              px={4}
              textAlign="center"
            >
              Pick one from your bag instead
            </Text>
          </Flex>
          <Text color="brand.secondary" fontSize="0.85rem" opacity={0.7}>
            No deck selected yet
          </Text>
        </>
      ) : starredDeck === undefined ? (
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
          {/* Decks but no star — e.g. the starred one was deleted in /bag.
              Let them pick here rather than sending them back. */}
          {!!decks?.length && (
            <Select
              aria-label="Choose your deck"
              w="100%"
              maxW="380px"
              bg="white"
              focusBorderColor="brand.secondary"
              value=""
              onChange={(e) => setStar(e.target.value)}
            >
              <option value="" disabled>
                Pick a deck…
              </option>
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </Select>
          )}
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
          {/* Swap decks without a round trip through /bag */}
          <Select
            aria-label="Choose your deck"
            w="100%"
            maxW="380px"
            bg="white"
            focusBorderColor="brand.secondary"
            value={starredDeck.id}
            onChange={(e) => setStar(e.target.value)}
          >
            {decks?.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </Select>
          <Text
            as={Link}
            href="/bag"
            fontSize="0.8rem"
            color="brand.secondary"
            opacity={0.7}
            textDecoration="underline"
            _hover={{ opacity: 1 }}
          >
            ＋ Add more decks in your bag
          </Text>
        </>
      )}
    </Flex>
  );
};
