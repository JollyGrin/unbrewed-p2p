import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useBagDecks } from "@/lib/bag/useBag";
import { useAccount } from "@/lib/account/useAccount";
import { useStorageBreakdown } from "@/lib/storage/breakdown";
import { applyHeroCardFlag } from "@/components/Positions/heroCardTokens";

import { FaPlus, FaStar } from "react-icons/fa";

import { AddDeckHub } from "@/components/Bag/AddDeckHub";
import { BagSourceChip, ShareItemButton } from "@/components/Bag/Account";
import { DeckStats } from "./Stats";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { toast } from "react-hot-toast";
import { DeckCards } from "./DeckCards";
import { EditHeroInfo } from "./EditHeroInfo";
import { EditCardback } from "./EditCardback";
import { EditSavedTokens } from "./EditSavedTokens";

export const BagDecks = () => {
  const {
    decks,
    pushDeck,
    removeDeckbyId,
    updateDeck,
    setStar,
    star,
    clearDecks,
    isLoading,
    sourceOf,
    cloudIdOf,
  } = useBagDecks();
  const storage = useStorageBreakdown();
  const account = useAccount();

  const [selectedDeckId, setSelectedDeckId] = useState<string>();
  const selectedDeck = decks?.find((deck) => deck.id === selectedDeckId);

  const toggleCharacterCard = async (cardIndex: number) => {
    if (!selectedDeck) return;
    const cards = selectedDeck.deck_data.cards.map((card, i) =>
      i === cardIndex
        ? { ...card, isCharacterCard: !card.isCharacterCard }
        : card,
    );
    // Flagging a card hero/rule also puts it on the table (issue #474), and
    // unflagging takes it back off. Only this transition seeds — nothing
    // re-derives the loadout from the flags on load, so a token the user
    // deleted in EditSavedTokens stays deleted.
    const toggled = cards[cardIndex];
    await updateDeck({
      ...selectedDeck,
      deck_data: { ...selectedDeck.deck_data, cards },
      savedTokens: applyHeroCardFlag(
        selectedDeck.savedTokens ?? [],
        toggled,
        !!toggled.isCharacterCard,
      ),
    });
  };

  return (
    <Flex direction="column" h="100%" minH={0}>
      <Box bg="brand.primary" flexShrink={0}>
        <DeckStats
          length={decks?.length ?? 0}
          storage={storage}
          isSignedIn={account.status === "signed-in"}
        />
      </Box>

      <Grid
        templateColumns={{ base: "1fr", md: "260px 1fr" }}
        flex="1"
        minH={0}
        overflow="hidden"
      >
        <DeckRail
          decks={decks}
          isLoading={isLoading}
          sourceOf={sourceOf}
          star={star}
          selectedDeckId={selectedDeckId}
          onSelect={setSelectedDeckId}
          onAddDeck={() => setSelectedDeckId(undefined)}
          onClearAll={clearDecks}
        />

        <Box bg="brand.secondary" overflowY="auto" minH={0}>
          {selectedDeck ? (
            <>
              <DeckActions
                deck={selectedDeck}
                selectedDeckId={selectedDeckId}
                setSelectedDeckId={setSelectedDeckId}
                setStar={setStar}
                removeDeckbyId={removeDeckbyId}
                updateDeck={updateDeck}
                cloudIdOf={cloudIdOf}
              />
              <DeckCards
                decks={decks}
                selectedDeckId={selectedDeckId}
                onToggleCharacterCard={toggleCharacterCard}
              />
            </>
          ) : (
            <Box p={{ base: "1rem", md: "1.5rem" }}>
              <AddDeckHub
                deckIds={decks?.map((deck) => deck.id)}
                pushDeck={pushDeck}
                setStar={setStar}
                star={star}
                onDeckAdded={setSelectedDeckId}
              />
            </Box>
          )}
        </Box>
      </Grid>
    </Flex>
  );
};

const DeckRail = ({
  decks,
  isLoading,
  sourceOf,
  star,
  selectedDeckId,
  onSelect,
  onAddDeck,
  onClearAll,
}: {
  decks?: DeckImportType[];
  isLoading: boolean;
  sourceOf: (id: string) => "device" | "cloud";
  star?: string;
  selectedDeckId?: string;
  onSelect: (id: string) => void;
  onAddDeck: () => void;
  onClearAll: () => Promise<void> | void;
}) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const count = decks?.length ?? 0;

  return (
    <Flex
      direction="column"
      bg="white"
      minH={0}
      borderRight="1px solid rgba(72, 40, 79, 0.15)"
    >
      <Flex
        align="center"
        justify="space-between"
        p="0.75rem"
        borderBottom="1px solid rgba(72, 40, 79, 0.12)"
        flexShrink={0}
      >
        <Box>
          <Text
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            color="brand.secondary"
            lineHeight={1}
          >
            Your bag
          </Text>
          <Text fontSize="0.72rem" opacity={0.6}>
            {count} {count === 1 ? "deck" : "decks"}
          </Text>
        </Box>
        <Button
          size="sm"
          leftIcon={<FaPlus size="0.7rem" />}
          bg="brand.accent"
          color="brand.surfaceDim"
          _hover={{ bg: "brand.accentDeep" }}
          onClick={onAddDeck}
          isActive={!selectedDeckId}
        >
          Add
        </Button>
      </Flex>

      <Box flex="1" overflowY="auto" minH={0}>
        {isLoading ? (
          /*
            An account bag arrives one round trip after mount. Showing the empty
            state in the meantime would tell a signed-in player their decks are
            gone, so the rail waits instead of flashing (#644).
          */
          <Flex align="center" justify="center" gap="0.5rem" p="1.5rem 1rem">
            <Spinner size="sm" color="brand.secondary" />
            <Text fontSize="0.8rem" opacity={0.7}>
              Loading your bag…
            </Text>
          </Flex>
        ) : count === 0 ? (
          <Flex
            direction="column"
            align="center"
            gap="0.4rem"
            textAlign="center"
            p="1.5rem 1rem"
            opacity={0.7}
          >
            <Text fontSize="1.6rem">🎒</Text>
            <Text fontSize="0.8rem">
              Your bag is empty. Hit <b>Add</b> to bring in your first deck.
            </Text>
          </Flex>
        ) : (
          decks?.map((deck) => (
            <DeckListItem
              key={deck.id + deck.version_id}
              deck={deck}
              source={sourceOf(deck.id)}
              isStarred={star === deck.id}
              isSelected={selectedDeckId === deck.id}
              onSelect={onSelect}
            />
          ))
        )}
      </Box>

      {count > 0 && (
        <Box
          p="0.6rem"
          borderTop="1px solid rgba(72, 40, 79, 0.12)"
          flexShrink={0}
        >
          {confirmClear ? (
            <HStack>
              <Button
                size="xs"
                bg="brand.danger"
                color="white"
                _hover={{ opacity: 0.9 }}
                onClick={() => {
                  onClearAll();
                  setConfirmClear(false);
                  toast.success("Cleared your bag");
                }}
              >
                Clear all {count}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </Button>
            </HStack>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              color="brand.danger"
              opacity={0.75}
              _hover={{ opacity: 1, bg: "rgba(255, 99, 71, 0.1)" }}
              onClick={() => setConfirmClear(true)}
            >
              Clear bag
            </Button>
          )}
        </Box>
      )}
    </Flex>
  );
};

const DeckListItem = ({
  deck,
  source,
  isStarred,
  isSelected,
  onSelect,
}: {
  deck: DeckImportType;
  source: "device" | "cloud";
  isStarred: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  return (
    <HStack
      p="0.5rem 0.75rem"
      bg={isSelected ? "rgba(72, 40, 79, 0.12)" : "transparent"}
      borderLeft="3px solid"
      borderColor={isSelected ? "brand.secondary" : "transparent"}
      cursor="pointer"
      transition="background 0.12s ease-out"
      _hover={{ bg: "rgba(72, 40, 79, 0.06)" }}
      onClick={() => onSelect(deck.id)}
    >
      <Box
        h="2rem"
        w="1.5rem"
        flexShrink={0}
        borderRadius="0.25rem"
        bg={deck?.deck_data?.appearance?.highlightColour ?? "grey"}
        bgImg={deck?.deck_data?.appearance?.cardbackUrl}
        bgPos="center"
        bgSize="cover"
        boxShadow="inset 0 0 0 1px rgba(0,0,0,0.15)"
      />
      <Text
        flex="1"
        fontSize="0.88rem"
        noOfLines={1}
        color="brand.secondary"
        fontWeight={isSelected ? 700 : 500}
      >
        {deck.name}
      </Text>
      <BagSourceChip source={source} />
      {isStarred && (
        <FaStar
          color="#E0A82E"
          style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))" }}
        />
      )}
    </HStack>
  );
};

const DeckActions = ({
  deck,
  selectedDeckId,
  setSelectedDeckId,
  removeDeckbyId,
  setStar,
  updateDeck,
  cloudIdOf,
}: {
  deck?: DeckImportType;
  selectedDeckId?: string;
  setSelectedDeckId: (id?: string) => void;
  removeDeckbyId: (id: string) => Promise<void> | void;
  setStar: (id: string) => void;
  updateDeck: (updated: DeckImportType) => Promise<void> | void;
  cloudIdOf: (id: string) => string | undefined;
}) => {
  const [, copy] = useCopyToClipboard();
  if (!selectedDeckId) return null;
  const isImageDeck = deck?.tags?.includes("image-deck");

  return (
    <Flex
      p="0.75rem"
      gap="0.5rem"
      flexWrap="wrap"
      justifyContent="end"
      position="sticky"
      top={0}
      zIndex={1}
      bg="brand.secondary"
      borderBottom="1px solid rgba(255,255,255,0.08)"
    >
      <Button size="sm" variant="ghost" color="brand.primary" onClick={() => setSelectedDeckId(undefined)}>
        ← Back
      </Button>
      {isImageDeck && deck && (
        <EditHeroInfo deck={deck} onSave={updateDeck} />
      )}
      {deck && <EditCardback deck={deck} onSave={updateDeck} />}
      {deck && <EditSavedTokens deck={deck} onSave={updateDeck} />}
      {/*
        Share link for a deck that lives in the account (#644). A device deck
        has no server-side row to link to, so the button isn't offered — which
        is also why a guest's action bar is unchanged.
      */}
      {deck && <ShareItemButton kind="decks" cloudId={cloudIdOf(deck.id)} />}
      <Button
        size="sm"
        bg="brand.accent"
        color="brand.surfaceDim"
        _hover={{ bg: "brand.accentDeep" }}
        onClick={() => {
          setStar(selectedDeckId);
          toast.success(`${deck?.name} is now your active deck`);
        }}
      >
        ★ Use this deck
      </Button>
      <Button
        size="sm"
        variant="outline"
        color="brand.primary"
        borderColor="rgba(255,255,255,0.25)"
        _hover={{ bg: "rgba(255,255,255,0.08)" }}
        onClick={() => {
          copy(JSON.stringify(deck));
          toast.success("Copied JSON for: " + deck?.name);
        }}
      >
        Copy JSON
      </Button>
      <Button
        size="sm"
        bg="brand.danger"
        color="white"
        _hover={{ opacity: 0.9 }}
        onClick={() => {
          setSelectedDeckId(undefined);
          removeDeckbyId(selectedDeckId);
          toast.success(`Tossed ${deck?.name} from your bag`);
        }}
      >
        Toss
      </Button>
    </Flex>
  );
};
