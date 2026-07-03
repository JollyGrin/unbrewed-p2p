import {
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  SimpleGrid,
  HStack,
  IconButton,
  Box,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useState } from "react";
import { GiRollingDices } from "react-icons/gi";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { colors, fonts } from "@/styles/style";
import { rollDice } from "@/components/Game/Dice/rollDice";

const DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_QTY = 12;

export const DiceModal = (props: { isOpen: boolean; onClose: () => void }) => {
  const { query } = useRouter();
  const { publishRoll } = useWebGame();
  const name = (query.name as string | undefined) ?? "Player";

  const [sides, setSides] = useState(20);
  const [qty, setQty] = useState(1);

  const roll = () => {
    publishRoll(rollDice(name, sides, qty));
    props.onClose();
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      isCentered
      // Don't refocus the dice icon on close — that re-opens its hover/focus
      // tooltip on top of the roll banner.
      returnFocusOnClose={false}
    >
      <ModalOverlay />
      <ModalContent bg={colors.brand.parchment} color={colors.brand.surfaceDim}>
        <ModalHeader fontFamily={fonts.SpaceGrotesk}>Roll dice</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="0.8rem" mb="0.75rem" opacity={0.75}>
            Everyone in the game sees the same roll.
          </Text>

          <SimpleGrid columns={4} spacing="0.5rem">
            {DICE.map((d) => {
              const selected = d === sides;
              return (
                <Button
                  key={d}
                  onClick={() => setSides(d)}
                  fontFamily={fonts.SpaceGrotesk}
                  fontWeight="700"
                  color={selected ? colors.brand.surfaceDim : colors.brand.secondary}
                  bg={selected ? colors.brand.accent : colors.brand.highlight}
                  _hover={{
                    bg: selected
                      ? colors.brand.accentDeep
                      : colors.brand.parchmentDeep,
                  }}
                >
                  d{d}
                </Button>
              );
            })}
          </SimpleGrid>

          <HStack mt="1.25rem" justify="space-between" align="center">
            <Text fontFamily={fonts.SpaceGrotesk} fontWeight="700">
              Quantity
            </Text>
            <HStack>
              <IconButton
                aria-label="Fewer dice"
                size="sm"
                isDisabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </IconButton>
              <Box
                minW="2.25rem"
                textAlign="center"
                fontFamily={fonts.SpaceGrotesk}
                fontSize="1.25rem"
                fontWeight="700"
              >
                {qty}
              </Box>
              <IconButton
                aria-label="More dice"
                size="sm"
                isDisabled={qty >= MAX_QTY}
                onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
              >
                +
              </IconButton>
            </HStack>
          </HStack>
        </ModalBody>

        <ModalFooter>
          <Button
            w="100%"
            leftIcon={<GiRollingDices />}
            onClick={roll}
            bg={colors.brand.accent}
            color={colors.brand.surfaceDim}
            fontFamily={fonts.SpaceGrotesk}
            fontWeight="700"
            _hover={{ bg: colors.brand.accentDeep }}
          >
            Roll {qty}d{sides}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
