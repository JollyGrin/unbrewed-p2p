import {
  Button,
  Flex,
  IconButton,
  Kbd,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Switch,
  Text,
} from "@chakra-ui/react";
import { SettingsIcon } from "@chakra-ui/icons";
import { KeyboardEvent, useState } from "react";
import { toast } from "react-hot-toast";

import {
  DEFAULT_SWITCH_SEAT_KEY,
  comboFromKeyEvent,
  useSwitchSeatKeyLabel,
  writeSwitchSeatKey,
} from "@/lib/hotseat/switchSeatKey";
import { HotseatFlag, useHotseatFlag } from "@/lib/hotseat/hotseatSettings";
import { switchSeatKeyClash } from "@/lib/keybinds/switchSeat";

/** The key badge, sized for the header chip and the settings row. */
export const KeyBadge = ({ label }: { label: string }) => (
  <Kbd
    bg="rgba(255,255,255,0.08)"
    borderColor="rgba(231, 204, 152, 0.35)"
    color="brand.highlight"
    fontSize="0.6rem"
    lineHeight={1.3}
    px="0.3rem"
  >
    {label}
  </Kbd>
);

/** One on/off setting row. */
const FlagRow = ({
  flag,
  label,
  hint,
}: {
  flag: HotseatFlag;
  label: string;
  hint: string;
}) => {
  const [on, setOn] = useHotseatFlag(flag);
  const id = `hotseat-setting-${flag}`;
  return (
    <Flex align="flex-start" justify="space-between" gap="0.5rem" mt="0.7rem">
      <label htmlFor={id}>
        <Text fontSize="0.75rem">{label}</Text>
        <Text fontSize="0.65rem" opacity={0.6} lineHeight={1.3}>
          {hint}
        </Text>
      </label>
      <Switch
        id={id}
        size="sm"
        colorScheme="yellow"
        mt="0.1rem"
        isChecked={on}
        onChange={(e) => setOn(e.target.checked)}
      />
    </Flex>
  );
};

/**
 * Hotseat settings (the gear by the Switch seat chip on /offline), saved on
 * this device: the switch-seat key (click it, press the new key, Esc
 * cancels; or turn it off, or go back to S), turning the board for the
 * second seat, and revealing the hand without the pass-the-device cover.
 */
export const HotseatSettings = () => {
  const label = useSwitchSeatKeyLabel();
  const [recording, setRecording] = useState(false);

  // While recording, the press is the new key, never a game shortcut or the
  // popover's Esc-to-close (preventDefault also keeps the seat from switching).
  const onRecordKey = (e: KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(false);
      return;
    }
    const combo = comboFromKeyEvent(e.nativeEvent);
    if (!combo) return; // a lone modifier: wait for the key
    setRecording(false);
    // Never take a key another table shortcut already has (lib/keybinds).
    const clash = switchSeatKeyClash(combo);
    if (clash) {
      toast.error(`${combo} is already the key for “${clash}”.`, {
        id: "switch-seat-key-clash",
      });
      return;
    }
    writeSwitchSeatKey(combo);
  };

  return (
    <Popover
      placement="bottom-end"
      isLazy
      onClose={() => setRecording(false)}
    >
      <PopoverTrigger>
        <IconButton
          aria-label="Hotseat settings"
          icon={<SettingsIcon boxSize="0.7rem" />}
          size="xs"
          minW="1.4rem"
          h="1.4rem"
          borderRadius="1rem"
          bg="rgba(20, 8, 24, 0.55)"
          color="brand.highlight"
          _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
          _active={{ bg: "rgba(20, 8, 24, 0.85)" }}
        />
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          // The popper wrapper defaults to z-index 10, under the activity log
          // (240) and Report bug (241) that sit right below the chips.
          rootProps={{ zIndex: "popover" }}
          w="17rem"
          bg="brand.surfaceDim"
          color="brand.parchment"
          borderColor="rgba(231, 204, 152, 0.25)"
          boxShadow="0 8px 20px rgba(0, 0, 0, 0.55)"
        >
          <PopoverArrow bg="brand.surfaceDim" />
          <PopoverBody p="0.75rem">
            <Text
              fontFamily="SpaceGrotesk"
              fontWeight={700}
              fontSize="0.85rem"
              mb="0.6rem"
            >
              Hotseat settings
            </Text>
            <Flex align="center" justify="space-between" gap="0.5rem">
              <Text fontSize="0.75rem">Switch seat key</Text>
              <Button
                aria-label="Change switch seat key"
                size="xs"
                variant="outline"
                color="brand.highlight"
                borderColor="rgba(231, 204, 152, 0.35)"
                _hover={{ bg: "rgba(255,255,255,0.06)" }}
                onClick={() => setRecording((r) => !r)}
                onKeyDown={onRecordKey}
              >
                {recording ? (
                  "Press a key…"
                ) : label ? (
                  <KeyBadge label={label} />
                ) : (
                  "Off"
                )}
              </Button>
            </Flex>
            <Flex mt="0.5rem" gap="0.75rem" justify="flex-end">
              <Button
                size="xs"
                variant="link"
                color="brand.highlight"
                isDisabled={!label}
                onClick={() => writeSwitchSeatKey("off")}
              >
                Turn off
              </Button>
              <Button
                size="xs"
                variant="link"
                color="brand.highlight"
                isDisabled={label === DEFAULT_SWITCH_SEAT_KEY}
                onClick={() => writeSwitchSeatKey(undefined)}
              >
                Reset to {DEFAULT_SWITCH_SEAT_KEY}
              </Button>
            </Flex>
            {recording && (
              <Text fontSize="0.65rem" opacity={0.6} mt="0.25rem">
                Esc cancels.
              </Text>
            )}
            <FlagRow
              flag="rotateBoard"
              label="Rotate board"
              hint="Turn the board 180° on the second player's turn, for playing across a table."
            />
            <FlagRow
              flag="autoReveal"
              label="Reveal hand right away"
              hint="Skip the pass-the-device cover when switching seat."
            />
            <Text fontSize="0.65rem" opacity={0.5} mt="0.7rem">
              Saved on this device.
            </Text>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};
