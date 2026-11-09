import { useState } from "react";
import {
  Button,
  Flex,
  IconButton,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
} from "@chakra-ui/react";
import {
  FaChevronDown,
  FaChevronLeft,
  FaCopy,
  FaEdit,
  FaEllipsisV,
  FaImage,
  FaLink,
  FaTrash,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { GiPawn } from "@/components/Icons/gi";
import { shareUrl } from "@/lib/account/bagCloud";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { applyHeroCardFlag } from "@/components/Positions/heroCardTokens";
import { DeckCards } from "./DeckCards";
import { EditHeroModal } from "./EditHeroInfo";
import { EditCardbackModal } from "./EditCardback";
import { EditSavedTokensModal } from "./EditSavedTokens";

/** Matches the house dropdown (components/Account/AccountChip.tsx). */
const menuItemStyles = {
  bg: "transparent",
  fontFamily: "ArchivoNarrow",
  fontSize: "0.95rem",
  py: "0.6rem",
  _hover: { bg: "brand.surface" },
  _focus: { bg: "brand.surface" },
} as const;

const menuListStyles = {
  bg: "brand.surfaceDim",
  borderColor: "brand.accent",
  color: "brand.primary",
  minW: "13rem",
  py: "0.25rem",
} as const;

type EditKind = "hero" | "cardback" | "tokens";

/**
 * "Edit deck" (#1538): the deck's card list with hero info, cardback, tokens,
 * share link, copy JSON and toss — a full-height screen with its own way
 * back, on every breakpoint (the #816 list/detail swap). Desktop (#1579):
 * back, name, an Edit menu, Share, and an overflow with Copy JSON and Toss.
 * On a phone one overflow menu carries the same items in the same order.
 */
export const DeckDetail = ({
  deck,
  onBack,
  updateDeck,
  onToss,
  cloudId,
}: {
  deck: DeckImportType;
  onBack: () => void;
  updateDeck: (updated: DeckImportType) => Promise<void> | void;
  onToss: () => void;
  cloudId?: string;
}) => {
  const [, copy] = useCopyToClipboard();
  // The mobile menu's edit modals live out here, not inside the menu, so
  // closing the menu on click doesn't take the modal down with it.
  const [editing, setEditing] = useState<EditKind | null>(null);
  const [confirmingToss, setConfirmingToss] = useState(false);
  const isImageDeck = !!deck.tags?.includes("image-deck");
  const tokenCount = deck.savedTokens?.length ?? 0;
  const closeEdit = () => setEditing(null);

  const copyJson = () => {
    copy(JSON.stringify(deck));
    toast.success("Copied JSON for: " + deck.name);
  };

  // account decks only: a device deck has no server-side row to link to (#644)
  const copyShareLink = () => {
    if (!cloudId) return;
    copy(shareUrl("decks", cloudId));
    toast.success("Share link copied");
  };

  const editItems = (
    <>
      {isImageDeck && (
        <MenuItem {...menuItemStyles} icon={<FaEdit />} onClick={() => setEditing("hero")}>
          Edit hero info
        </MenuItem>
      )}
      <MenuItem {...menuItemStyles} icon={<FaImage />} onClick={() => setEditing("cardback")}>
        Edit cardback
      </MenuItem>
      <MenuItem {...menuItemStyles} icon={<GiPawn />} onClick={() => setEditing("tokens")}>
        Tokens{tokenCount > 0 ? ` (${tokenCount})` : ""}
      </MenuItem>
    </>
  );
  const copyJsonItem = (
    <MenuItem {...menuItemStyles} icon={<FaCopy />} onClick={copyJson}>
      Copy JSON
    </MenuItem>
  );
  const tossItem = (
    <MenuItem
      {...menuItemStyles}
      color="brand.danger"
      icon={<FaTrash />}
      onClick={() => setConfirmingToss(true)}
    >
      Toss from bag
    </MenuItem>
  );

  const toggleCharacterCard = async (cardIndex: number) => {
    const cards = deck.deck_data.cards.map((card, i) =>
      i === cardIndex ? { ...card, isCharacterCard: !card.isCharacterCard } : card,
    );
    // Flagging a card hero/rule also puts it on the table (issue #474), and
    // unflagging takes it back off. Only this transition seeds — nothing
    // re-derives the loadout from the flags on load, so a token the user
    // deleted in EditSavedTokens stays deleted.
    const toggled = cards[cardIndex];
    await updateDeck({
      ...deck,
      deck_data: { ...deck.deck_data, cards },
      savedTokens: applyHeroCardFlag(deck.savedTokens ?? [], toggled, !!toggled.isCharacterCard),
    });
  };

  return (
    /*
      `flex: 1 0 auto`, never a fixed height: the panel grows with the card
      list, so the purple runs the full height of a long deck instead of
      stopping at the viewport and leaving the last rows on the page colour.
    */
    <Flex direction="column" bg="brand.secondary" minH="100%" flex="1 0 auto">
      {/* Mobile (#816): back + name + an overflow menu for everything secondary. */}
      <Flex
        display={{ base: "flex", md: "none" }}
        align="center"
        gap="0.25rem"
        px="0.5rem"
        py="0.4rem"
        position="sticky"
        top={0}
        zIndex={20}
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
          onClick={onBack}
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
          {deck.name}
        </Text>
        <Menu placement="bottom-end" autoSelect={false} isLazy>
          <MenuButton
            as={IconButton}
            aria-label="More deck actions"
            icon={<FaEllipsisV />}
            variant="ghost"
            color="brand.primary"
            _hover={{ bg: "rgba(255,255,255,0.08)" }}
            _active={{ bg: "rgba(255,255,255,0.12)" }}
          />
          <MenuList {...menuListStyles}>
            {editItems}
            {cloudId && (
              <MenuItem {...menuItemStyles} icon={<FaLink />} onClick={copyShareLink}>
                Share link
              </MenuItem>
            )}
            {copyJsonItem}
            <MenuDivider borderColor="whiteAlpha.300" />
            {tossItem}
          </MenuList>
        </Menu>
      </Flex>
      {editing === "hero" && (
        <EditHeroModal deck={deck} onSave={updateDeck} isOpen onClose={closeEdit} />
      )}
      {editing === "cardback" && (
        <EditCardbackModal deck={deck} onSave={updateDeck} isOpen onClose={closeEdit} />
      )}
      {editing === "tokens" && (
        <EditSavedTokensModal deck={deck} onSave={updateDeck} isOpen onClose={closeEdit} />
      )}

      {/* Desktop (md+): one action row. */}
      <Flex
        display={{ base: "none", md: "flex" }}
        p="0.75rem"
        gap="0.5rem"
        flexWrap="wrap"
        align="center"
        // Above the card grid (a hovered card lifts to z 10) and opaque, so the
        // cards scroll under the row, never over it.
        position="sticky"
        top={0}
        zIndex={20}
        bg="brand.secondary"
        boxShadow="0 2px 8px rgba(20, 8, 24, 0.35)"
        borderBottom="1px solid rgba(255,255,255,0.08)"
      >
        <Button
          size="sm"
          variant="ghost"
          color="brand.primary"
          leftIcon={<FaChevronLeft size="0.7rem" />}
          onClick={onBack}
        >
          Your bag
        </Button>
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
          {deck.name}
        </Text>
        <Menu placement="bottom-end" autoSelect={false} isLazy>
          <MenuButton
            as={Button}
            size="sm"
            variant="outline"
            color="brand.primary"
            borderColor="rgba(255,255,255,0.25)"
            _hover={{ bg: "rgba(255,255,255,0.08)" }}
            _active={{ bg: "rgba(255,255,255,0.12)" }}
            leftIcon={<FaEdit size="0.7rem" />}
            rightIcon={<FaChevronDown size="0.6rem" />}
          >
            Edit
          </MenuButton>
          <MenuList {...menuListStyles}>{editItems}</MenuList>
        </Menu>
        {/* Same gate as ShareItemButton: only an account deck has a row to link to. */}
        {cloudId && (
          <Button
            size="sm"
            variant="outline"
            color="brand.primary"
            borderColor="rgba(255,255,255,0.25)"
            _hover={{ bg: "rgba(255,255,255,0.08)" }}
            leftIcon={<FaLink size="0.7rem" />}
            onClick={copyShareLink}
          >
            Share
          </Button>
        )}
        <Menu placement="bottom-end" autoSelect={false} isLazy>
          <MenuButton
            as={IconButton}
            aria-label="More deck actions"
            icon={<FaEllipsisV />}
            size="sm"
            variant="ghost"
            color="brand.primary"
            _hover={{ bg: "rgba(255,255,255,0.08)" }}
            _active={{ bg: "rgba(255,255,255,0.12)" }}
          />
          <MenuList {...menuListStyles}>
            {copyJsonItem}
            <MenuDivider borderColor="whiteAlpha.300" />
            {tossItem}
          </MenuList>
        </Menu>
      </Flex>
      {/* The menu's "Toss from bag" asks here, where there is room for the answer. */}
      {confirmingToss && (
        <Flex
          position="sticky"
          top={{ base: "3.1rem", md: "3.6rem" }}
          zIndex={19}
          p="0.75rem"
          gap="0.5rem"
          align="center"
          flexWrap="wrap"
          bg="#5C3A4B"
          color="brand.primary"
          borderBottom="1px solid rgba(72, 40, 79, 0.12)"
          fontSize="0.9rem"
        >
          <Text fontWeight={700}>Toss {deck.name} from your bag?</Text>
          <Button
            size="sm"
            bg="brand.danger"
            color="white"
            _hover={{ opacity: 0.9 }}
            onClick={() => {
              setConfirmingToss(false);
              onToss();
            }}
          >
            Yes, toss it
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmingToss(false)}>
            Cancel
          </Button>
        </Flex>
      )}

      <DeckCards
        decks={[deck]}
        selectedDeckId={deck.id}
        onToggleCharacterCard={toggleCharacterCard}
      />
    </Flex>
  );
};
