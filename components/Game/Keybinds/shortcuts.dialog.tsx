import {
  Box,
  Button,
  Flex,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import { CloseIcon, RepeatIcon } from "@chakra-ui/icons";
import { KeyboardEvent, useEffect, useRef, useState } from "react";

import { colors, fonts } from "@/styles/style";
import {
  KEYBIND_ACTIONS,
  KEYBIND_ACTION_BY_ID,
  KEYBIND_GROUPS,
  KeybindAction,
  PALETTE_KEY_LABEL,
} from "@/lib/keybinds/actions";
import {
  comboFromEvent,
  formatCombo,
  normalizeCombo,
  reservedReason,
} from "@/lib/keybinds/combo";
import { isComposing, isTypingTarget } from "@/lib/keybinds/guards";
import {
  findConflict,
  resetAllKeybinds,
  useKeybinds,
  withBinding,
  withDefault,
  withReplacedBinding,
  withoutBinding,
  writeOverrides,
} from "@/lib/keybinds/store";

/** What the dialog says under a row after a key was refused. */
type Notice = {
  id: string;
  text: string;
  /** Set when the key is taken: the combo that "Use it here" would move. */
  combo?: string;
};

const quoted = (action: KeybindAction) => `“${action.label}”`;

/**
 * Every table shortcut with its key. Click a key and press the new one;
 * × removes the key, ↺ puts the default back, and "Reset all" does that for
 * the lot. A key that is already in use is never taken silently: the row says
 * who has it and offers to move it.
 */
export const ShortcutsDialog = ({
  isOpen,
  onClose,
  actions = KEYBIND_ACTIONS,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** The rows to list. Everything by default; tests pass a handful. */
  actions?: KeybindAction[];
}) => {
  const { bindings, overrides, shadowed } = useKeybinds();
  const [recording, setRecording] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (isOpen) return;
    setRecording(null);
    setNotice(null);
    setConfirmReset(false);
  }, [isOpen]);

  // The button just pressed often goes away with the press (a notice closes,
  // × hides once the key is gone). Focus would drop to <body>, outside the
  // dialog, where Esc no longer closes it; put it back on the row's key, or
  // on the dialog itself.
  const contentRef = useRef<HTMLElement>(null);
  const focusRow = useRef<string | null>(null);
  useEffect(() => {
    const content = contentRef.current;
    if (!isOpen || !content) return;
    const row = focusRow.current;
    focusRow.current = null;
    if (row === null && content.contains(document.activeElement)) return;
    const key = row
      ? content.querySelector<HTMLElement>(`[data-keybind-row="${row}"] button`)
      : null;
    (key ?? content).focus();
  });

  /** Bind `combo` to `id`, or say why not. */
  const assign = (id: string, combo: string) => {
    setRecording(null);
    const label = formatCombo(combo);
    const reserved = reservedReason(combo);
    if (reserved || normalizeCombo(combo) !== combo) {
      setNotice({ id, text: reserved ?? `${label} cannot be used as a shortcut.` });
      return;
    }
    if (bindings[id] === combo) {
      setNotice(null);
      return;
    }
    const holder = findConflict(overrides, id, combo);
    if (holder) {
      setNotice({
        id,
        combo,
        text: `${label} is already used by ${quoted(holder)}.`,
      });
      return;
    }
    setNotice(null);
    writeOverrides(withBinding(overrides, id, combo));
  };

  const reset = (action: KeybindAction) => {
    focusRow.current = action.id;
    setRecording(null);
    const fallback = action.defaultKey;
    const holder = fallback
      ? findConflict(withDefault(overrides, action.id), action.id, fallback)
      : undefined;
    if (fallback && holder) {
      setNotice({
        id: action.id,
        combo: fallback,
        text: `The default, ${formatCombo(fallback)}, is now used by ${quoted(holder)}.`,
      });
      return;
    }
    setNotice(null);
    writeOverrides(withDefault(overrides, action.id));
  };

  const clear = (id: string) => {
    focusRow.current = id;
    setRecording(null);
    setNotice(null);
    writeOverrides(withoutBinding(overrides, id));
  };

  // While recording, the press IS the new key: it must not reach the table
  // shortcuts, close the dialog, or click whatever has focus. Caught on the
  // window, before anything else, and not on the button: Safari does not
  // focus a button on click, so the button would never see the key.
  const assignRef = useRef(assign);
  assignRef.current = assign;
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === " ") {
        // A focused button clicks on Space's key-up; that is not a click.
        const swallow = (up: globalThis.KeyboardEvent) => up.preventDefault();
        window.addEventListener("keyup", swallow, { capture: true, once: true });
      }
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      if (isComposing(e)) return;
      const combo = comboFromEvent(e);
      if (!combo) return; // a lone modifier: wait for the key
      assignRef.current(recording, combo);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  // The key that opened the dialog also closes it.
  const onDialogKey = (e: KeyboardEvent) => {
    if (recording || e.repeat || isTypingTarget(e.target)) return;
    const combo = comboFromEvent(e.nativeEvent);
    if (combo && combo === bindings.showShortcuts) {
      e.preventDefault();
      onClose();
    }
  };

  const changed = Object.keys(overrides).some((id) => id in KEYBIND_ACTION_BY_ID);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside" isCentered>
      <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
      <ModalContent
        bg="brand.parchment"
        color="brand.surfaceDim"
        borderRadius="1rem"
        border="1px solid rgba(72, 40, 79, 0.35)"
        boxShadow="0 18px 48px rgba(20, 8, 24, 0.55)"
        onKeyDown={onDialogKey}
        ref={contentRef}
      >
        <ModalHeader
          fontFamily="BebasNeueRegular"
          fontSize="1.5rem"
          letterSpacing="0.05em"
          textTransform="uppercase"
          color="brand.secondary"
          pb="0.25rem"
        >
          Keyboard shortcuts
        </ModalHeader>
        <ModalCloseButton />
        <Flex px="1.5rem" pb="0.6rem" align="center" justify="space-between" gap="0.75rem">
          <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.78rem" opacity={0.75}>
            Click a key, then press the new one. Esc cancels. Saved on this
            device.
          </Text>
          {confirmReset ? (
            <Flex gap="0.4rem" flexShrink={0}>
              <Button
                size="xs"
                colorScheme="red"
                onClick={() => {
                  resetAllKeybinds();
                  setConfirmReset(false);
                  setNotice(null);
                  setRecording(null);
                }}
              >
                Reset every key
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </Flex>
          ) : (
            <Button
              size="xs"
              variant="outline"
              flexShrink={0}
              borderColor="rgba(72, 40, 79, 0.35)"
              isDisabled={!changed}
              onClick={() => setConfirmReset(true)}
            >
              Reset all to defaults
            </Button>
          )}
        </Flex>
        <ModalBody pt={0} pb="1.25rem" fontFamily={fonts.SpaceGrotesk}>
          {KEYBIND_GROUPS.filter((group) => actions.some((a) => a.group === group)).map((group) => (
            <Box key={group} as="section" aria-label={`${group} shortcuts`}>
              <GroupHeading>{group}</GroupHeading>
              {actions.filter((a) => a.group === group).map((action) => {
                const combo = bindings[action.id];
                const isRecording = recording === action.id;
                const rowNotice = notice?.id === action.id ? notice : undefined;
                const shadowedBy = shadowed[action.id];
                return (
                  <Box
                    key={action.id}
                    data-keybind-row={action.id}
                    py="0.3rem"
                    borderTop="1px solid rgba(72, 40, 79, 0.1)"
                  >
                    <Flex align="center" gap="0.5rem">
                      <Box flex="1" minW={0}>
                        <Text fontSize="0.85rem" lineHeight={1.3}>
                          {action.label}
                        </Text>
                        {action.note && (
                          <Text fontSize="0.68rem" opacity={0.6} lineHeight={1.3}>
                            {action.note}
                          </Text>
                        )}
                        {shadowedBy && action.defaultKey && (
                          <Text fontSize="0.68rem" opacity={0.6} lineHeight={1.3}>
                            Its default, {formatCombo(action.defaultKey)}, is your
                            key for {quoted(KEYBIND_ACTION_BY_ID[shadowedBy])}.
                          </Text>
                        )}
                      </Box>
                      <Button
                        aria-label={`Change key for ${action.label}`}
                        size="xs"
                        minW="5.5rem"
                        variant="outline"
                        bg={isRecording ? colors.brand.highlight : "rgba(255,255,255,0.45)"}
                        borderColor={
                          isRecording ? colors.brand.secondary : "rgba(72, 40, 79, 0.35)"
                        }
                        fontWeight={700}
                        onClick={() => {
                          setNotice(null);
                          setRecording(isRecording ? null : action.id);
                        }}
                      >
                        {isRecording ? (
                          "Press a key…"
                        ) : combo ? (
                          formatCombo(combo)
                        ) : (
                          <Text as="span" opacity={0.5} fontWeight={400}>
                            No key
                          </Text>
                        )}
                      </Button>
                      <IconButton
                        aria-label={`Remove key for ${action.label}`}
                        title="Remove this key"
                        icon={<CloseIcon boxSize="0.5rem" />}
                        size="xs"
                        variant="ghost"
                        visibility={combo ? "visible" : "hidden"}
                        onClick={() => clear(action.id)}
                      />
                      <IconButton
                        aria-label={`Reset ${action.label} to default`}
                        title={
                          action.defaultKey
                            ? `Back to the default (${formatCombo(action.defaultKey)})`
                            : "Back to the default (no key)"
                        }
                        icon={<RepeatIcon boxSize="0.75rem" />}
                        size="xs"
                        variant="ghost"
                        visibility={action.id in overrides ? "visible" : "hidden"}
                        onClick={() => reset(action)}
                      />
                    </Flex>
                    {rowNotice && (
                      <Flex
                        role="alert"
                        mt="0.3rem"
                        px="0.5rem"
                        py="0.3rem"
                        gap="0.5rem"
                        align="center"
                        borderRadius="0.4rem"
                        bg="rgba(255, 99, 71, 0.14)"
                        border="1px solid rgba(255, 99, 71, 0.45)"
                      >
                        <Text flex="1" fontSize="0.75rem">
                          {rowNotice.text}
                        </Text>
                        {rowNotice.combo && (
                          <Button
                            size="xs"
                            bg={colors.brand.accent}
                            color={colors.brand.surfaceDim}
                            _hover={{ bg: colors.brand.accentDeep }}
                            onClick={() => {
                              focusRow.current = action.id;
                              writeOverrides(
                                withReplacedBinding(overrides, action.id, rowNotice.combo!),
                              );
                              setNotice(null);
                            }}
                          >
                            Use it here instead
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            focusRow.current = action.id;
                            setNotice(null);
                          }}
                        >
                          {rowNotice.combo ? "Keep as is" : "OK"}
                        </Button>
                      </Flex>
                    )}
                  </Box>
                );
              })}
              {group === "Game" && (
                <Flex
                  align="center"
                  gap="0.5rem"
                  py="0.3rem"
                  borderTop="1px solid rgba(72, 40, 79, 0.1)"
                >
                  <Box flex="1">
                    <Text fontSize="0.85rem">Open the actions palette</Text>
                    <Text fontSize="0.68rem" opacity={0.6}>
                      Fixed. Every action here can also be run from it.
                    </Text>
                  </Box>
                  <Text fontSize="0.75rem" fontWeight={700} mr="3.5rem">
                    {PALETTE_KEY_LABEL}
                  </Text>
                </Flex>
              )}
            </Box>
          ))}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

const GroupHeading = ({ children }: { children: string }) => (
  <Text
    mt="0.9rem"
    mb="0.2rem"
    fontSize="0.65rem"
    fontWeight={700}
    letterSpacing="0.08em"
    textTransform="uppercase"
    opacity={0.55}
  >
    {children}
  </Text>
);
