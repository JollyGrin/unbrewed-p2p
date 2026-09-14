import { ReactNode, useState } from "react";
import Link from "next/link";
import {
  Box,
  Button,
  ButtonProps,
  Flex,
  FlexProps,
  Grid,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useBagDecks } from "@/lib/bag/useBag";
import { useAccount } from "@/lib/account/useAccount";
import { useStorageBreakdown } from "@/lib/storage/breakdown";
import { applyHeroCardFlag } from "@/components/Positions/heroCardTokens";

import {
  FaChevronLeft,
  FaChevronRight,
  FaCopy,
  FaEdit,
  FaEllipsisV,
  FaImage,
  FaLink,
  FaPlus,
  FaStar,
  FaTrash,
} from "react-icons/fa";
import { GiPawn } from "react-icons/gi";

import { AddDeckHub } from "@/components/Bag/AddDeckHub";
import { BagSourceChip, ShareItemButton } from "@/components/Bag/Account";
import { shareUrl } from "@/lib/account/bagCloud";
import { DeckStats } from "./Stats";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { toast } from "react-hot-toast";
import { DeckCards } from "./DeckCards";
import { EditHeroInfo, EditHeroModal } from "./EditHeroInfo";
import { EditCardback, EditCardbackModal } from "./EditCardback";
import { EditSavedTokens, EditSavedTokensModal } from "./EditSavedTokens";

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

  /*
    Below `md` the rail and the detail pane are a master-detail SWAP, not two
    stacked rows sharing one fixed box (#816): the rail is the "list" screen,
    and picking a deck or "Add" steps into a full-height detail screen with
    its own back affordance. On desktop both panes always show and this flag
    has no visual effect. An empty bag has nothing to list, so it opens
    straight onto the add panel — that's where /irl's "Open your bag" lands.
  */
  const [mobileDetail, setMobileDetail] = useState(false);
  const count = decks?.length ?? 0;
  const showDetail = mobileDetail || (!isLoading && count === 0);

  const openDeck = (id: string) => {
    setSelectedDeckId(id);
    setMobileDetail(true);
  };
  const openAdd = () => {
    setSelectedDeckId(undefined);
    setMobileDetail(true);
  };
  const backToRail = () => setMobileDetail(false);

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
    /*
      Mobile: this column is the ONE scroll container — stats scroll away and
      the visible pane flows at its natural height, so there are no nested
      scroll boxes. Desktop keeps the fixed shell with a scroll box per pane.
    */
    <Flex
      direction="column"
      h="100%"
      minH={0}
      overflowY={{ base: "auto", md: "visible" }}
    >
      <Box bg="brand.primary" flexShrink={0}>
        <DeckStats
          length={count}
          storage={storage}
          isSignedIn={account.status === "signed-in"}
        />
      </Box>

      <Grid
        // minmax(0, …) so a wide card row can't push the phone column (and its
        // sticky action bars) past the viewport
        templateColumns={{ base: "minmax(0, 1fr)", md: "260px 1fr" }}
        flex={{ base: "1 0 auto", md: "1" }}
        minH={{ base: "auto", md: 0 }}
        overflow={{ base: "visible", md: "hidden" }}
      >
        <DeckRail
          display={{ base: showDetail ? "none" : "flex", md: "flex" }}
          decks={decks}
          isLoading={isLoading}
          sourceOf={sourceOf}
          star={star}
          selectedDeckId={selectedDeckId}
          onSelect={openDeck}
          onAddDeck={openAdd}
          onClearAll={clearDecks}
        />

        <Flex
          display={{ base: showDetail ? "flex" : "none", md: "flex" }}
          direction="column"
          bg="brand.secondary"
          overflowY={{ base: "visible", md: "auto" }}
          minH={0}
          minW={0}
        >
          {selectedDeck ? (
            <>
              <DeckActions
                deck={selectedDeck}
                selectedDeckId={selectedDeckId}
                setSelectedDeckId={setSelectedDeckId}
                onBackToRail={backToRail}
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
              <MobilePrimaryBar
                deck={selectedDeck}
                onUse={() => {
                  setStar(selectedDeck.id);
                  toast.success(`${selectedDeck.name} is now your active deck`);
                }}
              />
            </>
          ) : (
            <Box p={{ base: "1rem", md: "1.5rem" }}>
              {count > 0 && (
                <MobileBackButton onClick={backToRail} mb="0.75rem">
                  Your bag ({count})
                </MobileBackButton>
              )}
              <AddDeckHub
                deckIds={decks?.map((deck) => deck.id)}
                pushDeck={pushDeck}
                setStar={setStar}
                star={star}
                onDeckAdded={openDeck}
              />
            </Box>
          )}
        </Flex>
      </Grid>
    </Flex>
  );
};

/** A mobile-only "← …" affordance back to the deck rail. */
const MobileBackButton = ({
  onClick,
  children,
  ...rest
}: { onClick: () => void; children: ReactNode } & ButtonProps) => (
  <Button
    display={{ base: "inline-flex", md: "none" }}
    size="sm"
    variant="ghost"
    color="brand.primary"
    px="0.5rem"
    ml="-0.5rem"
    leftIcon={<FaChevronLeft size="0.75rem" />}
    _hover={{ bg: "rgba(255,255,255,0.08)" }}
    onClick={onClick}
    {...rest}
  >
    {children}
  </Button>
);

const DeckRail = ({
  display,
  decks,
  isLoading,
  sourceOf,
  star,
  selectedDeckId,
  onSelect,
  onAddDeck,
  onClearAll,
}: {
  display: FlexProps["display"];
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
      display={display}
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

      <Box
        flex={{ base: "1 0 auto", md: "1" }}
        overflowY={{ base: "visible", md: "auto" }}
        minH={{ base: "auto", md: 0 }}
      >
        {isLoading && count === 0 ? (
          /*
            An account bag arrives one round trip after mount. Showing the empty
            state in the meantime would tell a signed-in player their decks are
            gone, so the rail waits instead of flashing (#644). Anything already
            on the device is rendered immediately, spinner or not.
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
      // a thumb-sized row on the mobile list screen
      p={{ base: "0.75rem", md: "0.5rem 0.75rem" }}
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
      {/* on mobile a row opens a screen, so it says so */}
      <Box display={{ base: "block", md: "none" }} opacity={0.4} flexShrink={0}>
        <FaChevronRight size="0.7rem" />
      </Box>
    </HStack>
  );
};

/** Matches the house dropdown (components/Account/AccountChip.tsx). */
const menuItemStyles = {
  bg: "transparent",
  fontFamily: "ArchivoNarrow",
  fontSize: "0.95rem",
  py: "0.6rem",
  _hover: { bg: "brand.surface" },
  _focus: { bg: "brand.surface" },
} as const;

type EditKind = "hero" | "cardback" | "tokens";

const DeckActions = ({
  deck,
  selectedDeckId,
  setSelectedDeckId,
  onBackToRail,
  removeDeckbyId,
  setStar,
  updateDeck,
  cloudIdOf,
}: {
  deck?: DeckImportType;
  selectedDeckId?: string;
  setSelectedDeckId: (id?: string) => void;
  onBackToRail: () => void;
  removeDeckbyId: (id: string) => Promise<void> | void;
  setStar: (id: string) => void;
  updateDeck: (updated: DeckImportType) => Promise<void> | void;
  cloudIdOf: (id: string) => string | undefined;
}) => {
  const [, copy] = useCopyToClipboard();
  // The mobile menu's edit modals live out here, not inside the menu, so
  // closing the menu on click doesn't take the modal down with it.
  const [editing, setEditing] = useState<EditKind | null>(null);
  if (!selectedDeckId) return null;
  const isImageDeck = deck?.tags?.includes("image-deck");
  const cloudId = deck ? cloudIdOf(deck.id) : undefined;
  const tokenCount = deck?.savedTokens?.length ?? 0;
  const closeEdit = () => setEditing(null);

  const copyJson = () => {
    copy(JSON.stringify(deck));
    toast.success("Copied JSON for: " + deck?.name);
  };
  const toss = () => {
    setSelectedDeckId(undefined);
    onBackToRail();
    removeDeckbyId(selectedDeckId);
    toast.success(`Tossed ${deck?.name} from your bag`);
  };

  return (
    <>
      {/*
        Mobile (#816): back + name + an overflow menu for everything
        secondary. The two primary actions sit in MobilePrimaryBar at the
        foot of the screen instead of wrapping here at equal weight.
      */}
      <Flex
        display={{ base: "flex", md: "none" }}
        align="center"
        gap="0.25rem"
        px="0.5rem"
        py="0.4rem"
        position="sticky"
        top={0}
        zIndex={2}
        bg="brand.secondary"
        borderBottom="1px solid rgba(255,255,255,0.08)"
      >
        <IconButton
          aria-label="Back to your bag"
          icon={<FaChevronLeft />}
          variant="ghost"
          color="brand.primary"
          _hover={{ bg: "rgba(255,255,255,0.08)" }}
          _active={{ bg: "rgba(255,255,255,0.12)" }}
          onClick={onBackToRail}
        />
        <Text
          as="h2"
          flex="1"
          minW={0}
          noOfLines={1}
          fontFamily="BebasNeueRegular"
          fontSize="1.5rem"
          letterSpacing="0.03em"
          lineHeight={1.1}
          color="brand.primary"
        >
          {deck?.name}
        </Text>
        <Menu placement="bottom-end" autoSelect={false}>
          <MenuButton
            as={IconButton}
            aria-label="More deck actions"
            icon={<FaEllipsisV />}
            variant="ghost"
            color="brand.primary"
            _hover={{ bg: "rgba(255,255,255,0.08)" }}
            _active={{ bg: "rgba(255,255,255,0.12)" }}
          />
          <MenuList
            bg="brand.surfaceDim"
            borderColor="brand.accent"
            color="brand.primary"
            minW="13rem"
            py="0.25rem"
          >
            {isImageDeck && (
              <MenuItem
                {...menuItemStyles}
                icon={<FaEdit />}
                onClick={() => setEditing("hero")}
              >
                Edit hero info
              </MenuItem>
            )}
            <MenuItem
              {...menuItemStyles}
              icon={<FaImage />}
              onClick={() => setEditing("cardback")}
            >
              Edit cardback
            </MenuItem>
            <MenuItem
              {...menuItemStyles}
              icon={<GiPawn />}
              onClick={() => setEditing("tokens")}
            >
              Tokens{tokenCount > 0 ? ` (${tokenCount})` : ""}
            </MenuItem>
            {/* same rule as the desktop ShareItemButton: account decks only */}
            {cloudId && (
              <MenuItem
                {...menuItemStyles}
                icon={<FaLink />}
                onClick={() => {
                  copy(shareUrl("decks", cloudId));
                  toast.success("Share link copied");
                }}
              >
                Share link
              </MenuItem>
            )}
            <MenuItem {...menuItemStyles} icon={<FaCopy />} onClick={copyJson}>
              Copy JSON
            </MenuItem>
            <MenuDivider borderColor="whiteAlpha.300" />
            <MenuItem
              {...menuItemStyles}
              color="brand.danger"
              icon={<FaTrash />}
              onClick={toss}
            >
              Toss from bag
            </MenuItem>
          </MenuList>
        </Menu>
      </Flex>
      {deck && editing === "hero" && (
        <EditHeroModal deck={deck} onSave={updateDeck} isOpen onClose={closeEdit} />
      )}
      {deck && editing === "cardback" && (
        <EditCardbackModal deck={deck} onSave={updateDeck} isOpen onClose={closeEdit} />
      )}
      {deck && editing === "tokens" && (
        <EditSavedTokensModal deck={deck} onSave={updateDeck} isOpen onClose={closeEdit} />
      )}

      {/* Desktop (md+): the original single action row. */}
      <DesktopDeckActions
        deck={deck}
        selectedDeckId={selectedDeckId}
        setSelectedDeckId={setSelectedDeckId}
        setStar={setStar}
        updateDeck={updateDeck}
        cloudId={cloudId}
        isImageDeck={!!isImageDeck}
        onCopyJson={copyJson}
        onToss={toss}
      />
    </>
  );
};

/**
 * Mobile foot bar for a bagged deck (#816): the two actions a phone player
 * came here for, full width and thumb-reachable. It sticks to the bottom of
 * the scroll, and `mt="auto"` floors it when the deck's card list is short.
 */
const MobilePrimaryBar = ({
  deck,
  onUse,
}: {
  deck: DeckImportType;
  onUse: () => void;
}) => (
  <Flex
    display={{ base: "flex", md: "none" }}
    gap="0.5rem"
    mt="auto"
    position="sticky"
    bottom={0}
    zIndex={2}
    bg="brand.secondary"
    borderTop="1px solid rgba(255,255,255,0.08)"
    boxShadow="0 -6px 16px rgba(20, 8, 24, 0.35)"
    px="0.75rem"
    pt="0.6rem"
    pb="calc(0.6rem + env(safe-area-inset-bottom, 0px))"
  >
    <Button
      flex="1"
      h="2.75rem"
      px="0.5rem"
      fontSize="0.9rem"
      bg="brand.primary"
      color="brand.secondary"
      _hover={{ bg: "brand.highlight" }}
      onClick={onUse}
    >
      ★ Use this deck
    </Button>
    {/* IRL Mode (#798): the phone as a deck tray at a real table */}
    <Button
      flex="1"
      h="2.75rem"
      px="0.5rem"
      fontSize="0.9rem"
      bg="brand.accent"
      color="brand.surfaceDim"
      _hover={{ bg: "brand.accentDeep" }}
      as={Link}
      href={{ pathname: "/irl", query: { deckId: deck.id } }}
    >
      Playtest in person
    </Button>
  </Flex>
);

const DesktopDeckActions = ({
  deck,
  selectedDeckId,
  setSelectedDeckId,
  setStar,
  updateDeck,
  cloudId,
  isImageDeck,
  onCopyJson,
  onToss,
}: {
  deck?: DeckImportType;
  selectedDeckId: string;
  setSelectedDeckId: (id?: string) => void;
  setStar: (id: string) => void;
  updateDeck: (updated: DeckImportType) => Promise<void> | void;
  cloudId?: string;
  isImageDeck: boolean;
  onCopyJson: () => void;
  onToss: () => void;
}) => {
  return (
    <Flex
      display={{ base: "none", md: "flex" }}
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
      <ShareItemButton kind="decks" cloudId={cloudId} />
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
      {/* IRL Mode (#798): the phone as a deck tray at a real table */}
      <Button
        size="sm"
        variant="outline"
        color="brand.primary"
        borderColor="rgba(255,255,255,0.25)"
        _hover={{ bg: "rgba(255,255,255,0.08)" }}
        as={Link}
        href={{ pathname: "/irl", query: { deckId: selectedDeckId } }}
      >
        Playtest in person
      </Button>
      <Button
        size="sm"
        variant="outline"
        color="brand.primary"
        borderColor="rgba(255,255,255,0.25)"
        _hover={{ bg: "rgba(255,255,255,0.08)" }}
        onClick={onCopyJson}
      >
        Copy JSON
      </Button>
      <Button
        size="sm"
        bg="brand.danger"
        color="white"
        _hover={{ opacity: 0.9 }}
        onClick={onToss}
      >
        Toss
      </Button>
    </Flex>
  );
};
