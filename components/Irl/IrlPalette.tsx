import { Box, Flex, Input, Text } from "@chakra-ui/react";
import { useState } from "react";
import {
  DeckCommand,
  buildDeckCommands,
} from "@/components/Game/CommandMenu/deckCommands";
import { useGameMenus } from "@/components/Game/GameMenus/game-menus";
import { useProLayout } from "@/lib/pro/useProLayout";
import { useIrlGame } from "./irlGame";
import {
  CloseButton,
  DarkButton,
  EmptyNote,
  IrlSheet,
  SAFE_BOTTOM,
  TopBar,
} from "./irl.ui";

const GROUP_ORDER: DeckCommand["group"][] = ["Deck", "Hand", "Discard", "Game"];

/**
 * Command palette for IRL Mode (issue #798 §1.5): the SAME entries as the
 * sandbox's ⌘K palette (buildDeckCommands), with `roll`, `openTokenLibrary`
 * and `boostFromDeck` left out so every dice / token / board entry vanishes.
 * A tappable list rather than the keyboard-first CommandMenu, which has no
 * touch trigger and always builds the dice entries; ⌘K still opens it.
 */
export const IrlPalette = ({
  onClose,
  onOpenDeck,
  onOpenDiscard,
  onOpenScry,
}: {
  onClose: () => void;
  onOpenDeck: () => void;
  onOpenDiscard: () => void;
  onOpenScry: () => void;
}) => {
  const { pool, act } = useIrlGame();
  const menus = useGameMenus();
  const { mobile } = useProLayout();
  const [query, setQuery] = useState("");

  const commands = buildDeckCommands({
    act,
    openScry: onOpenScry,
    openModal: (type) => {
      if (type === "deck") onOpenDeck();
      if (type === "discard") onOpenDiscard();
    },
    newGame: menus?.openNewGame,
    changeDeck: menus?.openChangeDeck,
  });
  const needle = query.trim().toLowerCase();
  const matches = commands.filter(
    (command) =>
      !needle ||
      command.label.toLowerCase().includes(needle) ||
      command.keywords?.toLowerCase().includes(needle),
  );

  return (
    <IrlSheet label="All actions" zIndex={1080}>
      <TopBar
        title="All actions"
        sub="every deck move, by name"
        onBack={onClose}
        right={<CloseButton onClick={onClose} />}
      />
      <Box px="12px" pb="8px" flexShrink={0}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — draw, shuffle, discard…"
          aria-label="Search actions"
          autoFocus={!mobile}
          h="44px"
          bg="brand.parchment"
          color="brand.surfaceDim"
          borderRadius="12px"
          _placeholder={{ color: "rgba(44, 24, 49, 0.5)" }}
        />
      </Box>
      <Flex direction="column" gap="12px" flex="1" minH={0} overflowY="auto" px="12px" pb={SAFE_BOTTOM}>
        {matches.length === 0 && <EmptyNote>No action matches “{query}”</EmptyNote>}
        {GROUP_ORDER.map((group) => {
          const entries = matches.filter((command) => command.group === group);
          if (!entries.length) return null;
          return (
            <Flex key={group} direction="column" gap="6px">
              <Text fontSize="10px" fontWeight={700} letterSpacing="0.12em" textTransform="uppercase" color="rgba(231, 204, 152, 0.55)">
                {group}
              </Text>
              {entries.map((command) => (
                <DarkButton
                  key={command.id}
                  minH="48px"
                  justifyContent="flex-start"
                  px="14px"
                  fontSize="14px"
                  disabled={!pool || !command.enabled(pool)}
                  onClick={() => {
                    onClose();
                    command.run();
                  }}
                >
                  {command.label}
                </DarkButton>
              ))}
            </Flex>
          );
        })}
      </Flex>
    </IrlSheet>
  );
};
