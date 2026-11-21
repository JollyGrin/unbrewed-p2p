import {
  Flex,
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Switch,
  Text,
} from "@chakra-ui/react";
import { IoGlassesOutline } from "react-icons/io5";

import { useSharpHand } from "@/lib/hand/sharpHand";

/**
 * Display settings, in the chip row at the top right of the sandbox table
 * (/offline and /game), saved on this device. One switch so far: "Sharp hand
 * cards" (issue #1712).
 */
export const DisplaySettings = () => {
  const [sharpHand, setSharpHand] = useSharpHand();
  return (
    <Popover placement="bottom-end" isLazy>
      <PopoverTrigger>
        <IconButton
          aria-label="Display settings"
          icon={<IoGlassesOutline size="0.85rem" />}
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
          // Above the activity log and Report bug, like the hotseat settings.
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
              Display settings
            </Text>
            <Flex align="flex-start" justify="space-between" gap="0.5rem">
              <label htmlFor="display-setting-sharp-hand">
                <Text fontSize="0.75rem">Sharp hand cards</Text>
                <Text fontSize="0.65rem" opacity={0.6} lineHeight={1.3}>
                  Turns off the tilt effect on the card you&apos;re reading. Try
                  this if cards in your hand look blurry.
                </Text>
              </label>
              <Switch
                id="display-setting-sharp-hand"
                size="sm"
                colorScheme="yellow"
                mt="0.1rem"
                isChecked={sharpHand}
                onChange={(e) => setSharpHand(e.target.checked)}
              />
            </Flex>
            <Text fontSize="0.65rem" opacity={0.5} mt="0.7rem">
              Saved on this device.
            </Text>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};
