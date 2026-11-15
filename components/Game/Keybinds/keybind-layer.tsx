import { Tooltip, useDisclosure } from "@chakra-ui/react";
import styled from "@emotion/styled";
import { FaKeyboard } from "react-icons/fa";

import { colors } from "@/styles/style";
import { useActiveHotseat } from "@/lib/hotseat/useHotseat";
import { useKeybindHandler } from "@/lib/keybinds/handlers";
import { useTableKeybinds } from "@/lib/keybinds/layer";
import { useKeyTip } from "./key-hint";
import { ShortcutsDialog } from "./shortcuts.dialog";

/**
 * The sandbox table's keyboard shortcuts: one listener for the whole table,
 * the shortcuts dialog, and the small keyboard button that opens it (beside
 * the ⌘ Actions pill; hidden on touch-only devices). Mounted once by
 * GameShell, so it covers /game, /offline and hotseat alike.
 */
export const KeybindLayer = () => {
  const hotseat = useActiveHotseat();
  useTableKeybinds({ hotseatActive: !!hotseat });
  const { isOpen, onOpen, onClose } = useDisclosure();
  useKeybindHandler("showShortcuts", onOpen);
  const tip = useKeyTip("Keyboard shortcuts", "showShortcuts");

  return (
    <>
      <Tooltip label={tip} placement="top" hasArrow>
        <Trigger type="button" aria-label="Keyboard shortcuts" onClick={onOpen}>
          <FaKeyboard size="15px" />
        </Trigger>
      </Tooltip>
      <ShortcutsDialog isOpen={isOpen} onClose={onClose} />
    </>
  );
};

/** Left of the ⌘ Actions pill (bottom-right), same parchment pill look. */
const Trigger = styled.button`
  position: fixed;
  bottom: 1rem;
  right: 7.9rem;
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  cursor: pointer;
  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  border-radius: 10rem;
  border: 1px solid rgba(72, 40, 79, 0.25);
  box-shadow: 0 2px 6px rgba(20, 8, 24, 0.35);
  transition: all 0.15s ease-in-out;

  :hover {
    background-color: ${colors.brand.highlight};
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(20, 8, 24, 0.4);
  }

  @media (hover: none) and (pointer: coarse) {
    display: none;
  }
`;
