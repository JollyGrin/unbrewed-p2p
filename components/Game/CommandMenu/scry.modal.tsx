import {
  Box,
  Flex,
  Text,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  IconButton,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@chakra-ui/icons";
import { Card } from "../../CardFactory/Card";
import { DeckImportCardType } from "../../DeckPool/deck-import.type";

type PeekItem = { uid: number; card: DeckImportCardType };

const TableButton = (props: React.ComponentProps<typeof Button>) => (
  <Button
    bg="brand.secondary"
    color="brand.primary"
    fontFamily="SpaceGrotesk"
    boxShadow="0 2px 6px rgba(20, 8, 24, 0.35)"
    _hover={{ bg: "#5A3263", transform: "translateY(-1px)" }}
    _active={{ transform: "translateY(0)" }}
    {...props}
  />
);

/**
 * Scry: peek the top N cards of the deck (never shuffles) and arrange them
 * onto the top and/or bottom in any order. Closing without applying leaves the
 * deck untouched — peeking is purely a local read (see PoolFns.reorderTop for
 * the mutation contract).
 */
export const ScryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  deck: DeckImportCardType[];
  onApply: (
    topCards: DeckImportCardType[],
    bottomCards: DeckImportCardType[],
  ) => void;
}> = ({ isOpen, onClose, deck, onApply }) => {
  const [count, setCount] = useState(3);
  const [top, setTop] = useState<PeekItem[]>([]);
  const [bottom, setBottom] = useState<PeekItem[]>([]);

  // (Re)build the working arrangement whenever the modal opens or the peek
  // count changes. Top is initialised in draw order (index 0 = next draw) so
  // "apply" with no edits is an identity — the deck is left exactly as-is.
  useEffect(() => {
    if (!isOpen) return;
    const n = Math.min(count, deck.length);
    const window = deck.slice(deck.length - n); // bottom..top within the window
    const topFirst = [...window].reverse(); // index 0 = topmost card
    setTop(topFirst.map((card, i) => ({ uid: i, card })));
    setBottom([]);
  }, [isOpen, count, deck]);

  const maxPeek = deck.length;
  const clampedCount = Math.min(count, maxPeek);

  const move = (item: PeekItem, to: "top" | "bottom") => {
    setTop((t) => t.filter((i) => i.uid !== item.uid));
    setBottom((b) => b.filter((i) => i.uid !== item.uid));
    if (to === "top") setTop((t) => [...t, item]);
    else setBottom((b) => [...b, item]);
  };

  const reorder = (
    list: PeekItem[],
    setList: (v: PeekItem[]) => void,
    index: number,
    dir: -1 | 1,
  ) => {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setList(next);
  };

  const apply = () => {
    onApply(
      top.map((i) => i.card),
      bottom.map((i) => i.card),
    );
    onClose();
  };

  const Zone = ({
    label,
    hint,
    items,
    setItems,
    zone,
  }: {
    label: string;
    hint: string;
    items: PeekItem[];
    setItems: (v: PeekItem[]) => void;
    zone: "top" | "bottom";
  }) => (
    <Box
      flex="1"
      minW={0}
      border="1px dashed rgba(72, 40, 79, 0.4)"
      borderRadius="0.75rem"
      p="0.75rem"
    >
      <Flex justify="space-between" align="baseline" mb="0.5rem">
        <Text
          fontFamily="BebasNeueRegular"
          fontSize="1.25rem"
          letterSpacing="0.05em"
          textTransform="uppercase"
          color="brand.secondary"
        >
          {label}
        </Text>
        <Text fontSize="0.7rem" opacity={0.7} fontFamily="SpaceGrotesk">
          {hint}
        </Text>
      </Flex>
      <Flex gap="0.5rem" overflowX="auto" minH="140px" pb="0.25rem">
        {items.length === 0 && (
          <Flex flex="1" align="center" justify="center" opacity={0.4}>
            <Text fontSize="0.8rem">empty</Text>
          </Flex>
        )}
        {items.map((item, index) => (
          <Box key={item.uid} w="110px" flexShrink={0}>
            <Card card={item.card} />
            <Flex justify="center" gap="0.15rem" mt="0.25rem">
              <IconButton
                aria-label="move left"
                icon={<ChevronLeftIcon />}
                size="xs"
                onClick={() => reorder(items, setItems, index, -1)}
                isDisabled={index === 0}
              />
              <IconButton
                aria-label={zone === "top" ? "send to bottom" : "send to top"}
                icon={zone === "top" ? <ArrowDownIcon /> : <ArrowUpIcon />}
                size="xs"
                onClick={() => move(item, zone === "top" ? "bottom" : "top")}
              />
              <IconButton
                aria-label="move right"
                icon={<ChevronRightIcon />}
                size="xs"
                onClick={() => reorder(items, setItems, index, 1)}
                isDisabled={index === items.length - 1}
              />
            </Flex>
          </Box>
        ))}
      </Flex>
    </Box>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" isCentered>
      <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
      <ModalContent
        bg="brand.parchment"
        borderRadius="1rem"
        border="1px solid rgba(72, 40, 79, 0.35)"
        boxShadow="0 18px 48px rgba(20, 8, 24, 0.55)"
      >
        <ModalHeader
          fontFamily="BebasNeueRegular"
          fontSize="1.75rem"
          letterSpacing="0.05em"
          textTransform="uppercase"
          color="brand.secondary"
          display="flex"
          alignItems="center"
          gap="0.75rem"
        >
          Scry
          <Flex align="center" gap="0.35rem" ml="auto" fontSize="1rem">
            <IconButton
              aria-label="peek fewer"
              icon={<Text>−</Text>}
              size="sm"
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              isDisabled={clampedCount <= 1}
            />
            <Text fontFamily="SpaceGrotesk" minW="6rem" textAlign="center">
              top {clampedCount}
            </Text>
            <IconButton
              aria-label="peek more"
              icon={<Text>+</Text>}
              size="sm"
              onClick={() => setCount((c) => Math.min(maxPeek, c + 1))}
              isDisabled={clampedCount >= maxPeek}
            />
          </Flex>
        </ModalHeader>
        <ModalBody>
          {deck.length === 0 ? (
            <Text opacity={0.6}>Your deck is empty.</Text>
          ) : (
            <Flex gap="1rem" direction={{ base: "column", md: "row" }}>
              <Zone
                label="Top of deck"
                hint="left = next draw"
                items={top}
                setItems={setTop}
                zone="top"
              />
              <Zone
                label="Bottom of deck"
                hint="left = deepest"
                items={bottom}
                setItems={setBottom}
                zone="bottom"
              />
            </Flex>
          )}
        </ModalBody>
        <ModalFooter gap="0.75rem">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <TableButton onClick={apply} isDisabled={deck.length === 0}>
            Apply order
          </TableButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
