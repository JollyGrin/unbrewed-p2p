import {
  Box,
  Flex,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Switch,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { IoVolumeLow, IoVolumeMedium, IoVolumeMute } from "react-icons/io5";

import { playSound, useSoundPrefs } from "@/lib/sound";

/**
 * The table's sound control, in the chip row at the top right: the speaker
 * mutes and unmutes in one click, the chevron opens the volume slider and the
 * "other players" switch. Saved on this device.
 */
export const SoundControl = () => {
  const [{ muted, volume, others }, setPrefs] = useSoundPrefs();
  const Icon = muted ? IoVolumeMute : volume < 0.4 ? IoVolumeLow : IoVolumeMedium;

  return (
    <Flex
      alignItems="center"
      borderRadius="1rem"
      bg="rgba(20, 8, 24, 0.55)"
      color="brand.highlight"
      overflow="hidden"
    >
      <Tooltip
        label={muted ? "Table sounds are off: click to turn on" : "Mute table sounds"}
        placement="bottom-end"
        maxW="220px"
      >
        <Flex
          as="button"
          aria-label={muted ? "Unmute table sounds" : "Mute table sounds"}
          aria-pressed={muted}
          onClick={() => setPrefs({ muted: !muted })}
          alignItems="center"
          justifyContent="center"
          h="1.4rem"
          pl="0.45rem"
          pr="0.2rem"
          cursor="pointer"
          opacity={muted ? 0.6 : 1}
          transition="background 0.15s ease"
          _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
        >
          <Icon size="0.85rem" />
        </Flex>
      </Tooltip>
      <Popover placement="bottom-end" isLazy>
        <PopoverTrigger>
          <Flex
            as="button"
            aria-label="Sound settings"
            alignItems="center"
            justifyContent="center"
            h="1.4rem"
            pl="0.1rem"
            pr="0.3rem"
            cursor="pointer"
            transition="background 0.15s ease"
            _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
          >
            <ChevronDownIcon boxSize="0.8rem" />
          </Flex>
        </PopoverTrigger>
        <Portal>
          <PopoverContent
            // Above the activity log and Report bug, like the hotseat settings.
            rootProps={{ zIndex: "popover" }}
            w="15rem"
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
                Table sounds
              </Text>
              <Flex align="center" justify="space-between" gap="0.5rem">
                <label htmlFor="sound-setting-on">
                  <Text fontSize="0.75rem">Sounds</Text>
                </label>
                <Switch
                  id="sound-setting-on"
                  size="sm"
                  colorScheme="yellow"
                  isChecked={!muted}
                  onChange={(e) => setPrefs({ muted: !e.target.checked })}
                />
              </Flex>
              <Box mt="0.7rem" opacity={muted ? 0.45 : 1}>
                <Text fontSize="0.75rem" id="sound-setting-volume-label">
                  Volume
                </Text>
                <Slider
                  aria-labelledby="sound-setting-volume-label"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  isDisabled={muted}
                  colorScheme="yellow"
                  focusThumbOnChange={false}
                  onChange={(v) => setPrefs({ volume: v })}
                  // A sample at the new level, so the slider can be set by ear.
                  onChangeEnd={() => playSound("place")}
                >
                  <SliderTrack bg="rgba(255,255,255,0.15)">
                    <SliderFilledTrack />
                  </SliderTrack>
                  <SliderThumb boxSize="0.8rem" />
                </Slider>
              </Box>
              <Flex align="flex-start" justify="space-between" gap="0.5rem" mt="0.5rem">
                <label htmlFor="sound-setting-others">
                  <Text fontSize="0.75rem">Other players</Text>
                  <Text fontSize="0.65rem" opacity={0.6} lineHeight={1.3}>
                    Hear their cards and pieces too, more quietly.
                  </Text>
                </label>
                <Switch
                  id="sound-setting-others"
                  size="sm"
                  colorScheme="yellow"
                  mt="0.1rem"
                  isChecked={others}
                  isDisabled={muted}
                  onChange={(e) => setPrefs({ others: e.target.checked })}
                />
              </Flex>
              <Text fontSize="0.65rem" opacity={0.5} mt="0.7rem">
                Saved on this device.
              </Text>
            </PopoverBody>
          </PopoverContent>
        </Portal>
      </Popover>
    </Flex>
  );
};
