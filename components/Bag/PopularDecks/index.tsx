import { useState } from "react";
import {
  Box,
  Flex,
  Grid,
  Link,
  Spinner,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { FaHeart, FaStar } from "react-icons/fa";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  POPULAR_DECKS,
  PopularDeckMeta,
} from "@/lib/constants/top-decks";
// evergreen (Pro rule-enforced) decks resolve from the committed snapshot
// first; everything else stays live-API-first with snapshot fallback
import { EVERGREEN_DECK_IDS, fetchDeckById } from "@/lib/evergreenDecks";
import { frozenAtForDeck } from "@/lib/pro/evergreenManifest";

/**
 * One-click deck picker: the most-liked community decks on
 * unmatched.cards. Clicking a tile downloads the deck, saves it to the
 * bag and stars it, ready to play.
 */
export const PopularDecks = (props: {
  deckIds?: string[];
  star?: string;
  pushDeck: (deck: DeckImportType) => void;
  setStar: (id: string) => void;
}) => {
  const [loadingId, setLoadingId] = useState<string>();

  const pickDeck = async (meta: PopularDeckMeta) => {
    if (loadingId) return;
    // already in the bag → just make it the active deck
    if (props.deckIds?.includes(meta.id)) {
      props.setStar(meta.id);
      toast.success(`${meta.name} is ready to play`);
      return;
    }
    setLoadingId(meta.id);
    try {
      const deck = await fetchDeckById(meta.id);
      props.pushDeck(deck);
      props.setStar(deck.id);
      toast.success(`${meta.name} saved & ready to play`);
    } catch (err) {
      console.error(err);
      toast.error(`Couldn't fetch ${meta.name} — try again in a moment`);
    } finally {
      setLoadingId(undefined);
    }
  };

  return (
    <Box>
      <Text fontSize="0.85rem" mb="0.75rem" opacity={0.8}>
        The community&apos;s most-liked decks — pick one and you&apos;re ready
        to play.
      </Text>
      <Grid
        templateColumns="repeat(auto-fill, minmax(150px, 1fr))"
        gap="0.5rem"
      >
        {POPULAR_DECKS.map((deck) => (
          <DeckTile
            key={deck.id}
            deck={deck}
            isLoading={loadingId === deck.id}
            isStarred={props.star === deck.id}
            isSaved={props.deckIds?.includes(deck.id) ?? false}
            onClick={() => pickDeck(deck)}
          />
        ))}
      </Grid>
      <Text fontSize="0.8rem" mt="0.75rem" opacity={0.8}>
        Want more? Browse 23,000+ decks at{" "}
        <Link
          href="https://unmatched.cards/decks"
          isExternal
          textDecoration="underline"
        >
          unmatched.cards/decks
        </Link>{" "}
        — open a deck and paste its code (the part after{" "}
        <code>/decks/</code> in the URL) into the box below.
      </Text>
    </Box>
  );
};

const DeckTile = ({
  deck,
  isLoading,
  isSaved,
  isStarred,
  onClick,
}: {
  deck: PopularDeckMeta;
  isLoading: boolean;
  isSaved: boolean;
  isStarred: boolean;
  onClick: () => void;
}) => {
  const frozenAt = EVERGREEN_DECK_IDS.has(deck.id) ? frozenAtForDeck(deck.id) : null;
  const baseLabel = isStarred
    ? "Your active deck"
    : `by ${deck.author} — click to ${isSaved ? "play" : "add & play"}`;
  const label = frozenAt
    ? `${baseLabel} — rules version frozen ${frozenAt}`
    : baseLabel;
  return (
    <Tooltip label={label}>
      <Flex
        onClick={onClick}
        flexDir="column"
        justifyContent="flex-end"
        h="5.5rem"
        p="0.5rem"
        borderRadius="0.5rem"
        border="2px solid"
        borderColor={isStarred ? "brand.accent" : "rgba(72, 40, 79, 0.25)"}
        cursor="pointer"
        userSelect="none"
        position="relative"
        overflow="hidden"
        transition="all 0.15s ease-in-out"
        _hover={{
          transform: "translateY(-2px)",
          boxShadow: "0 6px 14px rgba(20, 8, 24, 0.35)",
        }}
        bg={deck.highlightColour}
        bgImage={deck.cardbackUrl ? `url(${deck.cardbackUrl})` : undefined}
        bgSize="cover"
        bgPos="center"
      >
        <Box
          position="absolute"
          inset="0"
          bg="linear-gradient(180deg, rgba(20,8,24,0) 20%, rgba(20,8,24,0.85) 100%)"
        />
        <Flex position="relative" justifyContent="space-between" alignItems="end">
          <Text
            color="#FAEBD7"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            fontSize="0.8rem"
            lineHeight="1.15"
            noOfLines={2}
            textShadow="0 1px 2px rgba(0,0,0,0.8)"
          >
            {deck.name}
          </Text>
          <Flex alignItems="center" gap="0.25rem" color="#FAEBD7" pl="0.25rem">
            {isLoading ? (
              <Spinner size="xs" />
            ) : isStarred ? (
              <FaStar color="#E0A82E" size="0.8rem" />
            ) : (
              <>
                <FaHeart size="0.6rem" />
                <Text fontSize="0.7rem">{deck.likes}</Text>
              </>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Tooltip>
  );
};
