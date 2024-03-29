import {
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
  Flex,
  ModalFooter,
  Button,
} from "@chakra-ui/react";
import { FC, useCallback, useState } from "react";
import { MoonIcon, PlusSquareIcon, SunIcon } from "@chakra-ui/icons";
import { useWebGame } from "@/lib/contexts/WebGameProvider";

//@ts-ignore
import { CirclePicker } from "react-color";
import { PositionType, Size } from "./position.type";
import { useRouter } from "next/router";

export const PositionModal: FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const {
    query: { name },
  } = useRouter();
  const [isDark, setIsDark] = useState(true);
  const toggle = () => setIsDark(!isDark);
  const bg = isDark ? "purple.900" : "antiquewhite";
  const color = isDark ? "antiquewhite" : "purple.900";

  const { gamePositions, setPlayerPosition } = useWebGame();
  const selectedPosition = gamePositions?.content?.[
    name as keyof typeof gamePositions.content
  ] as PositionType;

  const [selectedColor, setSelectedColor] = useState<string>(
    selectedPosition?.color ?? "#000",
  );
  const [selectedSize, setSelectedSize] = useState<Size>("lg");
  const [sidekicks, setSidekicks] = useState<
    PositionType["sidekicks"] | undefined
  >(selectedPosition?.sidekicks);
  const setSize = (size: Size) =>
    size === "lg" ? 2 : size === "md" ? 1.65 : 1.35;
  const handleColorChange = ({ hex }: { hex: string }) => setSelectedColor(hex);

  const _setGamePosition = (props: PositionType) => {
    setPlayerPosition.current(props);
  };
  const setGamePosition = useCallback(_setGamePosition, [setPlayerPosition]);
  function updateYourColor() {
    //@ts-expect-error: the name is a key of the positions, but typescript is dumb and im lazy
    const selected: PositionType = gamePositions?.content?.[name as string];
    if (!selected) return;

    setGamePosition({
      ...selected,
      color: selectedColor,
      r: selectedSize === "lg" ? 20 : selectedSize === "md" ? 15 : 10,
      sidekicks: sidekicks?.map((kick) => ({
        ...kick,
        color: selectedColor,
      })),
    });
  }

  function addSidekick() {
    setSidekicks((prev) => {
      const amountOfSidekicks = prev?.length ?? 0;
      const id = `${name as string}_${amountOfSidekicks}`;
      return [
        ...(prev ?? []),
        {
          id,
          x: 25,
          y: 100,
          color: selectedColor,
        },
      ];
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent bg={bg} color={color} transition="all 0.25s ease-in-out">
        <ModalHeader as={Flex} gap="1rem">
          <Box onClick={toggle} cursor="pointer" userSelect="none">
            {isDark ? <SunIcon /> : <MoonIcon />}
          </Box>
          <Text>Your Board Tokens</Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Box position="relative">
            <Flex alignItems="center" gap="1rem" minH="2.5rem">
              <PlusSquareIcon onClick={addSidekick} />
              <Box
                bg={selectedColor}
                h={setSize(selectedSize) + "rem"}
                w={setSize(selectedSize) + "rem"}
                cursor="pointer"
                borderRadius="100%"
                transition="all 0.25s ease-in-out"
                onClick={() =>
                  setSelectedSize((prev) =>
                    prev === "lg" ? "md" : prev === "md" ? "sm" : "lg",
                  )
                }
              />
              {sidekicks?.map((kick) => (
                <Box
                  key={kick.id}
                  boxSize="1rem"
                  bg={selectedColor}
                  borderRadius="100%"
                />
              ))}
            </Flex>
            <Box
              position="absolute"
              bg={bg}
              p="0.5rem"
              borderRadius="1rem"
              filter="drop-shadow(0 5px 3px rgba(0,0,0,0.5))"
            >
              <CirclePicker onChangeComplete={handleColorChange} />
            </Box>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" bg="primary" onClick={updateYourColor}>
            Apply
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
