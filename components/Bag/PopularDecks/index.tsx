import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Button,
  Flex,
  Grid,
  Input,
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
import { BagDeckView } from "@/lib/bag/useBag";
import { failureReason, trackDeckAddFailed } from "@/lib/deckAnalytics";

type Shelf = "all" | "pro";

/**
 * The one deck browser (#1538 round 4, "Browse decks"): the most-liked
 * community decks on unmatched.cards plus every deck we've made playable in
 * Pro, in one grid. Pro decks first (badged), then the rest by likes. Lab
 * decks show with the caution badge the top-decks comment describes;
 * reflavored decks stay `?debug`-only. Clicking a tile downloads the deck,
 * saves it to the bag and stars it, ready to play. The five old "starter"
 * decks are all in this list by id, so that shelf is gone.
 *
 * Only this component filters and orders; the shared constant is read as is
 * by the Pro landing, the hero preview and tournaments.
 */
export const PopularDecks = (props: {
  deckIds?: string[];
  star?: string;
  pushDeck: BagDeckView["pushDeck"];
  setStar: (id: string) => void;
}) => {
  const [loadingId, setLoadingId] = useState<string>();
  const [shelf, setShelf] = useState<Shelf>("all");
  const [query, setQuery] = useState("");
  const router = useRouter();
  const debug = router.query.debug !== undefined;

  const visibleDecks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return POPULAR_DECKS.filter((deck) => debug || deck.tier !== "reflavored")
      .filter((deck) => shelf === "all" || EVERGREEN_DECK_IDS.has(deck.id))
      .filter(
        (deck) =>
          !needle ||
          deck.name.toLowerCase().includes(needle) ||
          deck.hero.toLowerCase().includes(needle) ||
          deck.author.toLowerCase().includes(needle),
      )
      .sort(byProThenLikes);
  }, [debug, shelf, query]);
  const proCount = POPULAR_DECKS.filter(
    (deck) => EVERGREEN_DECK_IDS.has(deck.id) && (debug || deck.tier !== "reflavored"),
  ).length;

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
      const deck = await fetchDeckById(meta.id).catch((err) => {
        trackDeckAddFailed("popular", failureReason(err));
        throw err;
      });
      // storage full — already toasted
      if (!(await props.pushDeck(deck, { source: "popular" }))) return;
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
      <Text fontSize="0.85rem" mb="0.6rem" opacity={0.8}>
        Every deck we&apos;ve made playable in Pro, then the community&apos;s most-liked
        decks on unmatched.cards. Pick one and you&apos;re ready to play.
      </Text>
      <Flex gap="0.5rem" align="center" flexWrap="wrap" mb="0.75rem">
        <Flex role="radiogroup" aria-label="Which decks" gap="0.3rem">
          <Chip on={shelf === "all"} onClick={() => setShelf("all")}>
            All
          </Chip>
          <Chip on={shelf === "pro"} onClick={() => setShelf("pro")}>
            Pro · {proCount}
          </Chip>
        </Flex>
        <Input
          aria-label="Search decks"
          placeholder="Search by name or author"
          size="sm"
          bg="white"
          borderColor="rgba(72, 40, 79, 0.25)"
          borderRadius="full"
          maxW="16rem"
          flex="1"
          minW="10rem"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Flex>
      <Grid
        templateColumns="repeat(auto-fill, minmax(150px, 1fr))"
        gap="0.5rem"
        data-testid="deck-browser"
      >
        {visibleDecks.map((deck) => (
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
      {visibleDecks.length === 0 && (
        <Text fontSize="0.85rem" opacity={0.75} mt="0.25rem">
          No deck matches &ldquo;{query.trim()}&rdquo; here. Paste its link or code in the
          box above instead.
        </Text>
      )}
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

/** Pro decks first, then by likes; ties keep the constant's order. */
const byProThenLikes = (a: PopularDeckMeta, b: PopularDeckMeta): number => {
  const pro = Number(EVERGREEN_DECK_IDS.has(b.id)) - Number(EVERGREEN_DECK_IDS.has(a.id));
  if (pro !== 0) return pro;
  return b.likes - a.likes;
};

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <Button
    role="radio"
    aria-checked={on}
    size="xs"
    h="1.75rem"
    px="0.7rem"
    borderRadius="full"
    fontSize="0.78rem"
    border="1.5px solid"
    borderColor={on ? "brand.secondary" : "rgba(72, 40, 79, 0.35)"}
    bg={on ? "brand.secondary" : "white"}
    color={on ? "brand.parchment" : "brand.secondary"}
    _hover={{ bg: on ? "brand.secondary" : "rgba(72, 40, 79, 0.08)" }}
    onClick={onClick}
  >
    {children}
  </Button>
);

const Badge = ({ tone, children }: { tone: "pro" | "lab"; children: string }) => (
  <Text
    as="span"
    fontSize="0.55rem"
    fontWeight={800}
    letterSpacing="0.08em"
    textTransform="uppercase"
    lineHeight={1}
    px="0.4rem"
    py="0.2rem"
    borderRadius="full"
    bg={tone === "pro" ? "brand.accent" : "brand.danger"}
    color={tone === "pro" ? "brand.surfaceDim" : "white"}
    boxShadow="0 1px 2px rgba(0,0,0,0.4)"
  >
    {children}
  </Text>
);

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
  const isPro = EVERGREEN_DECK_IDS.has(deck.id);
  const isLab = deck.tier === "lab";
  const frozenAt = isPro ? frozenAtForDeck(deck.id) : null;
  const baseLabel = isStarred
    ? "Your active deck"
    : `by ${deck.author} — click to ${isSaved ? "play" : "add & play"}`;
  const label = [
    baseLabel,
    isPro ? "playable in Pro with rules enforced" : "",
    frozenAt ? `rules version frozen ${frozenAt}` : "",
    isLab ? "lab deck: playable, but its balance and mechanics aren't final" : "",
  ]
    .filter(Boolean)
    .join(" — ");
  return (
    <Tooltip label={label}>
      <Flex
        onClick={onClick}
        role="button"
        aria-label={`${deck.name}${isPro ? " (Pro)" : ""}${isLab ? " (Lab)" : ""}`}
        data-deck-id={deck.id}
        data-pro={isPro || undefined}
        data-lab={isLab || undefined}
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
        {(isPro || isLab) && (
          <Flex position="absolute" top="0.4rem" left="0.4rem" gap="0.25rem">
            {isPro && <Badge tone="pro">Pro</Badge>}
            {isLab && <Badge tone="lab">Lab</Badge>}
          </Flex>
        )}
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
