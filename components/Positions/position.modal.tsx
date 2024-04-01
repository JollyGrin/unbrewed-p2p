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
  VStack,
  Divider,
  Grid,
  Input,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Image,
  MenuItemOption,
  MenuGroup,
  MenuOptionGroup,
  MenuDivider,
  FormLabel,
} from "@chakra-ui/react";
import { Dispatch, FC, SetStateAction, useCallback, useState } from "react";
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

  const [images, setImages] = useState<{ id: string; url: string }[]>([]);
  console.log({ images });

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
      imageUrl:
        images?.find((img) => img.id === selected?.id)?.url ?? undefined,
      sidekicks: sidekicks?.map((kick) => ({
        ...kick,
        color: selectedColor,
        imageUrl: images?.find((img) => img.id === kick?.id)?.url ?? undefined,
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
              <VStack alignItems="start">
                <CirclePicker onChangeComplete={handleColorChange} />
                <Divider />
                <TokenPreview
                  token={selectedPosition}
                  selectedColor={selectedColor}
                  setImages={setImages}
                />
                {sidekicks?.map((kick) => (
                  <TokenPreview
                    key={kick.id}
                    token={kick}
                    selectedColor={selectedColor}
                    setImages={setImages}
                  />
                ))}

                <PlusSquareIcon onClick={addSidekick} />
              </VStack>
            </Flex>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            bg="brand.primary"
            onClick={updateYourColor}
          >
            Apply
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const TokenPreview = ({
  token,
  selectedColor,
  setImages,
}: {
  token: PositionType;
  selectedColor: string;
  setImages: Dispatch<SetStateAction<{ id: string; url: string }[]>>;
}) => {
  const setImage = (url: string) => {
    setImages((prev) => {
      return [...prev?.filter((p) => p.id !== token.id), { id: token.id, url }];
    });
  };

  return (
    <Grid templateColumns="1fr 2fr">
      {token?.imageUrl ? (
        <Image src={token.imageUrl} />
      ) : (
        <Box
          bg={selectedColor}
          boxSize="2rem"
          cursor="pointer"
          borderRadius="100%"
          transition="all 0.25s ease-in-out"
        />
      )}

      <Menu>
        <MenuButton as={Button}>Tokens</MenuButton>
        <MenuList>
          <FormLabel fontSize="0.75rem" pl="0.75rem" color="black">
            Your Tokens (via your bag)
          </FormLabel>
          <Divider />
          <FormLabel fontSize="0.75rem" pl="0.75rem" color="black">
            Default Tokens
          </FormLabel>
          <MenuItem onClick={() => setImage("https://picsum.photos/200")}>
            <Image src="https://picsum.photos/200" w="100px" />
          </MenuItem>
        </MenuList>
      </Menu>
    </Grid>
  );
};
