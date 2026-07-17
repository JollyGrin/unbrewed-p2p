import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormLabel,
  Grid,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
  useDisclosure,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { FaEdit } from "react-icons/fa";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";

/**
 * Post-import editor for hero & sidekick info on image decks (TTS /
 * the-unmatched.club imports). The TTS JSON carries no hero stats, so
 * buildImageDeck fills neutral defaults ("See hero card", hp 15, blank
 * sidekick). This is the only way to correct them after import — it writes
 * straight into deck_data.hero / .sidekick and persists via updateDeck.
 *
 * Numbers are held as strings so a field can be cleared while typing; hero
 * hp/move fall back to their current value on save, sidekick hp/quantity map
 * a blank field to null (the "no sidekick" convention DeckCards keys off).
 */
export const EditHeroInfo = ({
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
        leftIcon={<FaEdit size="0.7rem" />}
        onClick={onOpen}
      >
        Edit hero info
      </Button>
      {isOpen && (
        <EditHeroModal
          deck={deck}
          onSave={onSave}
          isOpen={isOpen}
          onClose={onClose}
        />
      )}
    </>
  );
};

const toNum = (value: string, fallback: number) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const toNullableNum = (value: string): number | null => {
  if (!value.trim()) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

const EditHeroModal = ({
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
  const hero = deck.deck_data.hero;
  const sidekick = deck.deck_data.sidekick;

  const [heroName, setHeroName] = useState(hero?.name ?? "");
  const [heroHp, setHeroHp] = useState(String(hero?.hp ?? ""));
  const [heroMove, setHeroMove] = useState(String(hero?.move ?? ""));
  const [heroRanged, setHeroRanged] = useState(hero?.isRanged ?? false);
  const [specialAbility, setSpecialAbility] = useState(
    hero?.specialAbility ?? "",
  );

  const [sideName, setSideName] = useState(sidekick?.name ?? "");
  const [sideHp, setSideHp] = useState(
    sidekick?.hp == null ? "" : String(sidekick.hp),
  );
  const [sideQty, setSideQty] = useState(
    sidekick?.quantity == null ? "" : String(sidekick.quantity),
  );
  const [sideRanged, setSideRanged] = useState(sidekick?.isRanged ?? false);
  const [sideQuote, setSideQuote] = useState(sidekick?.quote ?? "");

  const handleSave = () => {
    const trimmedHeroName = heroName.trim();
    if (!trimmedHeroName) {
      toast.error("Hero needs a name");
      return;
    }
    onSave({
      ...deck,
      deck_data: {
        ...deck.deck_data,
        hero: {
          ...hero,
          name: trimmedHeroName,
          hp: toNum(heroHp, hero?.hp ?? 15),
          move: toNum(heroMove, hero?.move ?? 2),
          isRanged: heroRanged,
          specialAbility: specialAbility.trim(),
        },
        sidekick: {
          ...sidekick,
          name: sideName.trim() || "Sidekick",
          hp: toNullableNum(sideHp),
          quantity: toNullableNum(sideQty),
          isRanged: sideRanged,
          quote: sideQuote,
        },
      },
    });
    toast.success(`Updated ${trimmedHeroName}`);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent color="brand.secondary">
        <ModalHeader fontFamily="SpaceGrotesk">Edit hero info</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="0.8rem" opacity={0.75} mb="0.75rem">
            Imported decks carry no hero stats, so these start as defaults. Fix
            them here — the card art on each card stays the source of truth.
          </Text>

          <Section title="Hero">
            <Grid templateColumns="2fr 1fr 1fr auto" gap="0.5rem" alignItems="end">
              <Field label="Name">
                <Input
                  bg="white"
                  size="sm"
                  value={heroName}
                  onChange={(e) => setHeroName(e.target.value)}
                />
              </Field>
              <Field label="HP">
                <Input
                  bg="white"
                  size="sm"
                  type="number"
                  value={heroHp}
                  onChange={(e) => setHeroHp(e.target.value)}
                />
              </Field>
              <Field label="Move">
                <Input
                  bg="white"
                  size="sm"
                  type="number"
                  value={heroMove}
                  onChange={(e) => setHeroMove(e.target.value)}
                />
              </Field>
              <Checkbox
                pb="0.4rem"
                isChecked={heroRanged}
                onChange={(e) => setHeroRanged(e.target.checked)}
              >
                <Text fontSize="0.8rem">Ranged</Text>
              </Checkbox>
            </Grid>
            <Field label="Special ability" mt="0.5rem">
              <Textarea
                bg="white"
                size="sm"
                rows={2}
                placeholder="e.g. After combat: draw a card"
                value={specialAbility}
                onChange={(e) => setSpecialAbility(e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Sidekick">
            <Text fontSize="0.72rem" opacity={0.7} mb="0.4rem">
              Leave HP and count blank if this hero has no sidekick.
            </Text>
            <Grid templateColumns="2fr 1fr 1fr auto" gap="0.5rem" alignItems="end">
              <Field label="Name">
                <Input
                  bg="white"
                  size="sm"
                  value={sideName}
                  onChange={(e) => setSideName(e.target.value)}
                />
              </Field>
              <Field label="HP each">
                <Input
                  bg="white"
                  size="sm"
                  type="number"
                  value={sideHp}
                  onChange={(e) => setSideHp(e.target.value)}
                />
              </Field>
              <Field label="Count">
                <Input
                  bg="white"
                  size="sm"
                  type="number"
                  value={sideQty}
                  onChange={(e) => setSideQty(e.target.value)}
                />
              </Field>
              <Checkbox
                pb="0.4rem"
                isChecked={sideRanged}
                onChange={(e) => setSideRanged(e.target.checked)}
              >
                <Text fontSize="0.8rem">Ranged</Text>
              </Checkbox>
            </Grid>
            <Field label="Quote" mt="0.5rem">
              <Input
                bg="white"
                size="sm"
                value={sideQuote}
                onChange={(e) => setSideQuote(e.target.value)}
              />
            </Field>
          </Section>
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

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <Box mb="1rem">
    <Text fontWeight={700} fontSize="0.9rem" mb="0.4rem">
      {title}
    </Text>
    {children}
  </Box>
);

const Field = ({
  label,
  children,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  [key: string]: unknown;
}) => (
  <Box {...rest}>
    <FormLabel fontSize="0.75rem" mb="0">
      {label}
    </FormLabel>
    {children}
  </Box>
);
