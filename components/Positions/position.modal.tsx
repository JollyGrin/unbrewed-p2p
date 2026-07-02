import {
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
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
  FormLabel,
  HStack,
} from "@chakra-ui/react";
import { Dispatch, FC, SetStateAction, useCallback, useState } from "react";
import { PlusSquareIcon } from "@chakra-ui/icons";
import { useWebGame } from "@/lib/contexts/WebGameProvider";

import { MdUpload as IconUpload } from "react-icons/md";

//@ts-ignore
import { CirclePicker } from "react-color";
import { PositionType } from "./position.type";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { DEFAULT_TOKEN_IMAGES } from "../BoardCanvas/defaultTokenImages";

export const PositionModal: FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const {
    query: { name },
  } = useRouter();

  const { gamePositions, setPlayerPosition } = useWebGame();
  const selectedPosition = gamePositions?.content?.[
    name as keyof typeof gamePositions.content
  ] as PositionType;

  const [images, setImages] = useState<{ id: string; url: string }[]>([]);

  const [selectedColor, setSelectedColor] = useState<string>(
    selectedPosition?.color ?? "#000",
  );
  const [sidekicks, setSidekicks] = useState<
    PositionType["sidekicks"] | undefined
  >(selectedPosition?.sidekicks);

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
      imageUrl:
        images?.find((img) => img.id === selected?.id)?.url ??
        selected?.imageUrl ??
        undefined,
      sidekicks: sidekicks?.map((kick) => ({
        ...kick,
        color: selectedColor,
        r: kick?.r ?? 50,
        imageUrl:
          images?.find((img) => img.id === kick?.id)?.url ??
          kick?.imageUrl ??
          undefined,
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

    toast.success("Preparing new token. Click apply to confirm changes");
  }

  const gameKickIds = selectedPosition?.sidekicks?.map((kick) => kick.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setSidekicks(selectedPosition?.sidekicks);
        setImages([]);
        onClose();
      }}
    >
      <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
      <ModalContent
        bg="brand.parchment"
        color="brand.surfaceDim"
        borderRadius="1rem"
        border="1px solid rgba(72, 40, 79, 0.35)"
      >
        <ModalHeader
          fontFamily="BebasNeueRegular"
          fontSize="1.5rem"
          letterSpacing="0.05em"
          textTransform="uppercase"
          color="brand.secondary"
          pb="0.25rem"
        >
          Your Board Tokens
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack alignItems="start" gap="0.75rem">
            <Box>
              <SectionLabel>Token color</SectionLabel>
              <CirclePicker onChangeComplete={handleColorChange} />
            </Box>
            <Divider borderColor="rgba(72, 40, 79, 0.3)" />
            <Box w="100%">
              <SectionLabel>
                Your tokens — pick an image or keep the color disc
              </SectionLabel>
              <VStack alignItems="start" w="100%" mt="0.5rem">
                <TokenPreview
                  label={`Hero — ${name}`}
                  token={selectedPosition}
                  selectedColor={selectedColor}
                  setImages={setImages}
                />
                {selectedPosition?.sidekicks?.map((kick, i) => (
                  <TokenPreview
                    key={kick.id}
                    label={`Sidekick ${i + 1}`}
                    token={kick}
                    selectedColor={selectedColor}
                    setImages={setImages}
                  />
                ))}
                {sidekicks
                  ?.filter((kick) => !gameKickIds?.includes(kick.id))
                  .map((kick, i) => (
                    <TokenPreview
                      key={kick.id}
                      label={`New sidekick ${i + 1}`}
                      token={kick}
                      selectedColor={selectedColor}
                      setImages={setImages}
                    />
                  ))}
              </VStack>
              <Button
                mt="0.75rem"
                size="sm"
                leftIcon={<PlusSquareIcon />}
                onClick={addSidekick}
              >
                Add sidekick token
              </Button>
            </Box>
          </VStack>
        </ModalBody>
        <ModalFooter flexDirection="column" alignItems="end">
          <Button
            bg="gold"
            boxShadow="0 2px 6px rgba(20, 8, 24, 0.25)"
            onClick={updateYourColor}
          >
            Apply changes
          </Button>
          <FormLabel fontSize="0.75rem" opacity={0.7} mt="0.25rem">
            Applying moves your tokens back to their starting corner
          </FormLabel>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const SectionLabel = (props: React.ComponentProps<typeof Text>) => (
  <Text
    fontFamily="SpaceGrotesk"
    fontWeight={700}
    fontSize="0.8rem"
    textTransform="uppercase"
    letterSpacing="0.06em"
    opacity={0.75}
    {...props}
  />
);

const TokenPreview = ({
  label,
  token,
  selectedColor,
  setImages,
}: {
  label: string;
  token: PositionType;
  selectedColor: string;
  setImages: Dispatch<SetStateAction<{ id: string; url: string }[]>>;
}) => {
  const setImage = (url: string) => {
    setImages((prev) => {
      return [...prev?.filter((p) => p.id !== token.id), { id: token.id, url }];
    });
    toast.success("New Image Prepared. Click Apply to confirm changes");
  };

  const [imageUrl, setImageUrl] = useState("");

  return (
    <Grid
      templateColumns="3.5rem 1fr auto"
      w="100%"
      gap="0.75rem"
      alignItems="center"
    >
      {token?.imageUrl ? (
        <Image src={token.imageUrl} alt={label} w="3.5rem" />
      ) : (
        <Box
          bg={selectedColor}
          w="3.5rem"
          h="3.5rem"
          borderRadius="100%"
          border="2px solid rgba(72, 40, 79, 0.35)"
          transition="background-color 0.15s"
        />
      )}
      <Text fontWeight={700} fontSize="0.9rem">
        {label}
      </Text>

      <Menu>
        <MenuButton as={Button} size="sm">
          Change image
        </MenuButton>
        <MenuList maxH="400px" overflowY="auto">
          <FormLabel fontSize="0.75rem" pl="0.75rem" color="black">
            Add Token (via url)
          </FormLabel>
          {imageUrl && <Image src={imageUrl} w="3rem" />}
          <HStack mb="0.5rem" px="0.5rem">
            <Input
              placeholder="image url (.svg, .png, .jpeg)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <Button onClick={() => setImage(imageUrl)}>
              <IconUpload />
            </Button>
          </HStack>
          <Divider />
          <FormLabel fontSize="0.75rem" pl="0.75rem" color="black">
            Default Tokens
          </FormLabel>
          {DEFAULT_TOKEN_IMAGES.map((img) => (
            <MenuItem key={img} onClick={() => setImage(img)}>
              <Image src={img} fill="red" color="red" w="100px" />
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    </Grid>
  );
};
