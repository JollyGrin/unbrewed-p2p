import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  FormLabel,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { FaImage } from "react-icons/fa";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { httpsUpgrade } from "@/lib/tts/parse-tts";

/**
 * View + edit a bagged deck's card back. TTS / the-unmatched.club imports
 * carry a `BackURL` that lands on every card as `cardBackUrl`, but decks from
 * the unbrewed.xyz API arrive with no back and fall back to the house back on
 * the board. This lets you see the current back and paste an image URL to
 * set/replace it.
 *
 * Saving writes both the deck-level `appearance.cardbackUrl` (used for the bag
 * thumbnail) and the per-card `cardBackUrl` on every card in deck_data — the
 * board reads the card-level field (cardFace.tsx) because pooled cards detach
 * from deck_data and sync whole over the websocket. Persisted via updateDeck.
 *
 * URL-paste only for now: file uploads become data-URLs that bloat
 * localStorage and the per-card websocket sync payload.
 */
export const EditCardback = ({
  deck,
  onSave,
}: {
  deck: DeckImportType;
  onSave: (updated: DeckImportType) => void;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        color="brand.primary"
        borderColor="rgba(255,255,255,0.25)"
        _hover={{ bg: "rgba(255,255,255,0.08)" }}
        leftIcon={<FaImage size="0.7rem" />}
        onClick={onOpen}
      >
        Edit cardback
      </Button>
      {isOpen && (
        <EditCardbackModal
          deck={deck}
          onSave={onSave}
          isOpen={isOpen}
          onClose={onClose}
        />
      )}
    </>
  );
};

/** Preview swatch mirroring the board's house back (cardFace.tsx gradient). */
const HouseBackPlaceholder = () => (
  <Flex
    w="6rem"
    h="8.4rem"
    borderRadius="0.4rem"
    bgGradient="linear(to-b, #48284F, #2C1831)"
    align="center"
    justify="center"
    textAlign="center"
    p="0.5rem"
    boxShadow="inset 0 0 0 1px rgba(0,0,0,0.25)"
  >
    <Text fontSize="0.65rem" color="rgba(231,204,152,0.75)" lineHeight={1.3}>
      House back
    </Text>
  </Flex>
);

const EditCardbackModal = ({
  deck,
  onSave,
  isOpen,
  onClose,
}: {
  deck: DeckImportType;
  onSave: (updated: DeckImportType) => void;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const currentBack =
    deck.deck_data.appearance?.cardbackUrl ||
    deck.deck_data.cards.find((c) => c.cardBackUrl)?.cardBackUrl ||
    "";

  const [url, setUrl] = useState(currentBack);
  const preview = url.trim() ? httpsUpgrade(url.trim()) : "";

  const handleSave = () => {
    const next = url.trim() ? httpsUpgrade(url.trim()) : "";
    onSave({
      ...deck,
      deck_data: {
        ...deck.deck_data,
        appearance: {
          ...deck.deck_data.appearance,
          cardbackUrl: next,
        },
        cards: deck.deck_data.cards.map((card) => ({
          ...card,
          // empty string clears the field so the board falls back to the house back
          cardBackUrl: next || undefined,
        })),
      },
    });
    toast.success(next ? "Cardback updated" : "Cardback cleared");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent color="brand.secondary">
        <ModalHeader fontFamily="SpaceGrotesk">Edit cardback</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="0.8rem" opacity={0.75} mb="0.75rem">
            Paste an image URL to set the face-down art for every card in this
            deck. Leave it blank to fall back to the house back.
          </Text>

          <Flex gap="1rem" align="start" mb="0.75rem">
            <Box flexShrink={0}>
              {preview ? (
                <Image
                  src={preview}
                  alt="cardback preview"
                  w="6rem"
                  h="8.4rem"
                  objectFit="cover"
                  borderRadius="0.4rem"
                  boxShadow="inset 0 0 0 1px rgba(0,0,0,0.25)"
                  fallback={<HouseBackPlaceholder />}
                />
              ) : (
                <HouseBackPlaceholder />
              )}
            </Box>
            <Box flex="1">
              <FormLabel fontSize="0.75rem" mb="0.25rem">
                Cardback image URL
              </FormLabel>
              <Input
                bg="white"
                size="sm"
                placeholder="https://…/cardback.png"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Text fontSize="0.7rem" opacity={0.65} mt="0.4rem">
                File upload isn&apos;t supported yet — data URLs bloat storage
                and the sync payload.
              </Text>
            </Box>
          </Flex>
        </ModalBody>
        <ModalFooter gap="0.5rem">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            bg="brand.accent"
            color="brand.surfaceDim"
            _hover={{ bg: "brand.accentDeep" }}
            onClick={handleSave}
          >
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
