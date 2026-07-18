import { Flex, Menu, MenuButton, MenuItem, MenuList } from "@chakra-ui/react";
import { ChevronUpIcon } from "@chakra-ui/icons";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { DeckCommand } from "@/components/Game/CommandMenu/deckCommands";

/**
 * A pile pill that splits into two hit targets: the wide left segment fires the
 * pile's primary action (open deck search / open discard), and the narrow right
 * chevron opens a menu of the pile-relevant deck actions — the same command
 * entries the ⌘ Actions palette uses (issue #426, item 1). Discoverability
 * without forking the command definitions.
 */
export const PileSplitButton: React.FC<{
  label: string;
  onPrimary: () => void;
  commands: DeckCommand[];
  pool: PoolType | undefined;
}> = ({ label, onPrimary, commands, pool }) => {
  return (
    <Split>
      <Primary onClick={onPrimary}>{label}</Primary>
      <Menu placement="top-end" isLazy>
        <MenuButton as={Chevron} aria-label={`${label} actions`}>
          <ChevronUpIcon boxSize="1rem" />
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
    </Split>
  );
};

const Split = styled(Flex)`
  user-select: none;
  align-items: stretch;
  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  font-family: ${fonts.SpaceGrotesk};
  font-weight: 700;
  font-size: 0.85rem;
  border-radius: 10rem;
  border: 1px solid rgba(72, 40, 79, 0.25);
  box-shadow: 0 2px 6px rgba(20, 8, 24, 0.35);
  overflow: hidden;
  transition: box-shadow 0.15s ease-in-out;

  :hover {
    box-shadow: 0 4px 10px rgba(20, 8, 24, 0.4);
  }
`;

const Primary = styled.button`
  cursor: pointer;
  padding: 0.35rem 0.9rem;
  background: transparent;
  color: inherit;
  font: inherit;

  :hover {
    background-color: ${colors.brand.highlight};
  }
  :active {
    transform: translateY(1px);
  }
`;

const Chevron = styled.button`
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.5rem;
  background: transparent;
  color: inherit;
  border-left: 1px solid rgba(72, 40, 79, 0.25);

  :hover {
    background-color: ${colors.brand.highlight};
  }
`;
