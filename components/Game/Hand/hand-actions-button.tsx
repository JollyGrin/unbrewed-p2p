import { Flex, Menu, MenuButton, MenuItem, MenuList } from "@chakra-ui/react";
import { ChevronUpIcon } from "@chakra-ui/icons";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { DeckCommand } from "@/components/Game/CommandMenu/deckCommands";

/**
 * The "Hand actions" pill: a single dropdown (label + chevron) that lists the
 * available hand actions — Reveal hand, Return to hand, Discard random. Unlike
 * the deck/discard pills there's no pile to open, so the whole pill is the menu
 * trigger. It renders whenever the hand surface has any action to offer and
 * always sits above the Draw button, so drawing never shifts Draw's position
 * (issue #439).
 */
export const HandActionsButton: React.FC<{
  commands: DeckCommand[];
  pool: PoolType | undefined;
}> = ({ commands, pool }) => {
  return (
    <Menu placement="top-end" isLazy>
      <MenuButton as={Pill} aria-label="Hand actions">
        <span>Hand actions</span>
        <ChevronUpIcon boxSize="1rem" ml="0.4rem" />
      </MenuButton>
      <MenuList
        bg={colors.brand.parchment}
        color={colors.brand.surfaceDim}
        borderColor="rgba(72, 40, 79, 0.35)"
        boxShadow="0 12px 32px rgba(20, 8, 24, 0.45)"
        fontFamily={fonts.SpaceGrotesk}
        fontSize="0.82rem"
        minW="15rem"
        py="0.35rem"
      >
        {commands.map((cmd) => {
          const disabled = pool ? !cmd.enabled(pool) : true;
          return (
            <MenuItem
              key={cmd.id}
              onClick={cmd.run}
              isDisabled={disabled}
              bg="transparent"
              _hover={{ bg: colors.brand.highlight }}
              _focus={{ bg: colors.brand.highlight }}
            >
              {cmd.label}
            </MenuItem>
          );
        })}
      </MenuList>
    </Menu>
  );
};

const Pill = styled(Flex)`
  user-select: none;
  cursor: pointer;
  align-items: center;
  justify-content: center;

  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  font-family: ${fonts.SpaceGrotesk};
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.35rem 0.9rem;
  border-radius: 10rem;
  border: 1px solid rgba(72, 40, 79, 0.25);
  box-shadow: 0 2px 6px rgba(20, 8, 24, 0.35);
  transition: all 0.15s ease-in-out;

  :hover {
    background-color: ${colors.brand.highlight};
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(20, 8, 24, 0.4);
  }

  :active {
    transform: translateY(0);
    box-shadow: 0 1px 3px rgba(20, 8, 24, 0.4);
  }
`;
