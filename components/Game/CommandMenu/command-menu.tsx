import {
  Box,
  Flex,
  Text,
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  Kbd,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { ModalType } from "@/pages/game";
import {
  PoolType,
  drawMultiple,
  mill,
  reorderTop,
  discardRandomCard,
  discardToDeckTop,
  drawDiscard,
  shuffleDeck,
  shuffleDiscardIntoDeck,
} from "@/components/DeckPool/PoolFns";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { ScryModal } from "./scry.modal";
import { rollDice } from "@/components/Game/Dice/rollDice";

type Command = {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  /** Whether the command can run given the current pool. */
  enabled: (pool: PoolType) => boolean;
  run: () => void;
};

export const CommandMenu: React.FC<{
  openModal: (type: ModalType) => void;
}> = ({ openModal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scryOpen, setScryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const localName = useRouter().query?.name;
  const player = Array.isArray(localName) ? localName[0] : localName;
  const { gameState, logAction, publishRoll } = useWebGame();
  const players = gameState?.content?.players as
    | Record<string, { pool?: PoolType }>
    | undefined;
  const pool = player ? players?.[player]?.pool : undefined;

  // ⌘K / Ctrl+K toggles the palette from anywhere except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setIsOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setIsOpen(false);
    setQuery("");
    setCursor(0);
  };

  // Mutate the pool in place, then let logAction broadcast it: logAction reads
  // the same (now-mutated) pool object and sends it stamped with the feed
  // entry, so a single message carries both the deck change and the log line.
  // `label` doubles as a local toast for the actor's own feedback.
  const act = (mutate: (p: PoolType) => unknown, label: string) => () => {
    if (!pool) return;
    mutate(pool);
    logAction(label);
    toast.success(label);
    close();
  };

  // Roll dice: publishRoll shows the shared 3D roll + banner to the whole room;
  // we also log it so there's a persistent record in the action feed.
  const roll = (sides: number, qty: number) => () => {
    if (!player) return;
    const result = rollDice(player, sides, qty);
    publishRoll(result);
    const disp = qty > 1 ? `${qty}d${sides}` : `d${sides}`;
    const detail =
      result.values.length > 1
        ? `${result.values.join(", ")} = ${result.total}`
        : `${result.values[0]}`;
    logAction(`Rolled ${disp} → ${detail}`);
    close();
  };

  const applyScry = (
    topCards: DeckImportCardType[],
    bottomCards: DeckImportCardType[],
  ) => {
    if (!pool) return;
    reorderTop(pool, topCards, bottomCards);
    logAction("Reordered the top of their deck");
    toast.success("Reordered the top of your deck");
  };

  const deckLen = pool?.deck?.length ?? 0;
  const discardLen = pool?.discard?.length ?? 0;
  const handLen = pool?.hand?.length ?? 0;

  const commands: Command[] = useMemo(
    (): Command[] => [
      {
        id: "rolld20",
        group: "Dice",
        label: "Roll d20",
        keywords: "dice die roll random d20",
        enabled: () => true,
        run: roll(20, 1),
      },
      {
        id: "rolld6",
        group: "Dice",
        label: "Roll d6",
        keywords: "dice die roll random d6",
        enabled: () => true,
        run: roll(6, 1),
      },
      {
        id: "roll2d6",
        group: "Dice",
        label: "Roll 2d6",
        keywords: "dice die roll random 2d6 two",
        enabled: () => true,
        run: roll(6, 2),
      },
      {
        id: "rolld100",
        group: "Dice",
        label: "Roll d100 (percentile)",
        keywords: "dice die roll random d100 percent",
        enabled: () => true,
        run: roll(100, 1),
      },
      {
        id: "rolld4",
        group: "Dice",
        label: "Roll d4",
        keywords: "dice die roll random d4",
        enabled: () => true,
        run: roll(4, 1),
      },
      {
        id: "rolld8",
        group: "Dice",
        label: "Roll d8",
        keywords: "dice die roll random d8",
        enabled: () => true,
        run: roll(8, 1),
      },
      {
        id: "rolld10",
        group: "Dice",
        label: "Roll d10",
        keywords: "dice die roll random d10",
        enabled: () => true,
        run: roll(10, 1),
      },
      {
        id: "rolld12",
        group: "Dice",
        label: "Roll d12",
        keywords: "dice die roll random d12",
        enabled: () => true,
        run: roll(12, 1),
      },
      {
        id: "scry",
        group: "Deck",
        label: "Scry — peek & reorder top of deck",
        keywords: "peek look top order surveil",
        enabled: (p) => (p.deck?.length ?? 0) > 0,
        run: () => {
          setIsOpen(false);
          setScryOpen(true);
        },
      },
      {
        id: "draw2",
        group: "Deck",
        label: "Draw 2 cards",
        keywords: "multiple",
        enabled: (p) => (p.deck?.length ?? 0) > 0,
        run: act((p) => drawMultiple(p, 2), "Drew 2 cards"),
      },
      {
        id: "draw3",
        group: "Deck",
        label: "Draw 3 cards",
        keywords: "multiple",
        enabled: (p) => (p.deck?.length ?? 0) > 0,
        run: act((p) => drawMultiple(p, 3), "Drew 3 cards"),
      },
      {
        id: "mill1",
        group: "Deck",
        label: "Mill 1 (top of deck → discard)",
        keywords: "discard top",
        enabled: (p) => (p.deck?.length ?? 0) > 0,
        run: act((p) => mill(p, 1), "Milled 1 card"),
      },
      {
        id: "mill3",
        group: "Deck",
        label: "Mill 3 (top of deck → discard)",
        keywords: "discard top",
        enabled: (p) => (p.deck?.length ?? 0) > 0,
        run: act((p) => mill(p, 3), "Milled 3 cards"),
      },
      {
        id: "shuffle",
        group: "Deck",
        label: "Shuffle deck",
        keywords: "randomize",
        enabled: (p) => (p.deck?.length ?? 0) > 0,
        run: act((p) => shuffleDeck(p), "Shuffled deck"),
      },
      {
        id: "search",
        group: "Deck",
        label: "Search deck (browse — reshuffles on close)",
        keywords: "tutor find open",
        enabled: (p) => (p.deck?.length ?? 0) > 0,
        run: () => {
          close();
          openModal("deck");
        },
      },
      {
        id: "discardRandom",
        group: "Hand",
        label: "Discard a random card from hand",
        keywords: "ambush force",
        enabled: (p) => (p.hand?.length ?? 0) > 0,
        run: act((p) => discardRandomCard(p), "Discarded a random card"),
      },
      {
        id: "discardTopToDeck",
        group: "Discard",
        label: "Put top of discard on top of deck",
        keywords: "houdini return recur",
        enabled: (p) => (p.discard?.length ?? 0) > 0,
        run: act(
          (p) => discardToDeckTop(p, p.discard.length - 1),
          "Moved top of discard to deck",
        ),
      },
      {
        id: "discardTopToHand",
        group: "Discard",
        label: "Return top of discard to hand",
        keywords: "recur bruce lee",
        enabled: (p) => (p.discard?.length ?? 0) > 0,
        run: act(
          (p) => drawDiscard(p, p.discard.length - 1),
          "Returned top of discard to hand",
        ),
      },
      {
        id: "shuffleDiscardIn",
        group: "Discard",
        label: "Shuffle discard into deck",
        keywords: "reset reshuffle",
        enabled: (p) => (p.discard?.length ?? 0) > 0,
        run: act((p) => shuffleDiscardIntoDeck(p), "Shuffled discard into deck"),
      },
      {
        id: "openDiscard",
        group: "Discard",
        label: "Open discard pile",
        keywords: "view browse",
        enabled: () => true,
        run: () => {
          close();
          openModal("discard");
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, deckLen, discardLen, handLen],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const runAt = (index: number) => {
    const cmd = filtered[index];
    if (!cmd || !pool) return;
    if (!cmd.enabled(pool)) {
      toast.error("Not available right now");
      return;
    }
    cmd.run();
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(filtered.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(cursor);
    }
  };

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)} aria-label="Open actions">
        <span>⌘</span> Actions
      </TriggerButton>

      <Modal isOpen={isOpen} onClose={close} isCentered>
        <ModalOverlay bg="rgba(20, 8, 24, 0.5)" backdropFilter="blur(6px)" />
        <ModalContent
          bg="brand.parchment"
          borderRadius="0.9rem"
          border="1px solid rgba(72, 40, 79, 0.35)"
          boxShadow="0 18px 48px rgba(20, 8, 24, 0.55)"
          overflow="hidden"
        >
          <Input
            ref={inputRef}
            autoFocus
            variant="unstyled"
            placeholder="Search deck actions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onListKeyDown}
            fontFamily={fonts.SpaceGrotesk}
            fontSize="1.1rem"
            px="1.25rem"
            py="1rem"
            borderBottom="1px solid rgba(72, 40, 79, 0.25)"
          />
          <Box maxH="50vh" overflowY="auto" py="0.5rem">
            {filtered.length === 0 && (
              <Text px="1.25rem" py="1rem" opacity={0.6}>
                No matching actions
              </Text>
            )}
            {filtered.map((cmd, index) => {
              const disabled = pool ? !cmd.enabled(pool) : true;
              const active = index === cursor;
              const prevGroup = filtered[index - 1]?.group;
              return (
                <Box key={cmd.id}>
                  {cmd.group !== prevGroup && (
                    <Text
                      px="1.25rem"
                      pt="0.6rem"
                      pb="0.2rem"
                      fontSize="0.65rem"
                      fontWeight={700}
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                      opacity={0.55}
                      fontFamily={fonts.SpaceGrotesk}
                    >
                      {cmd.group}
                    </Text>
                  )}
                  <Flex
                    px="1.25rem"
                    py="0.5rem"
                    align="center"
                    cursor={disabled ? "not-allowed" : "pointer"}
                    opacity={disabled ? 0.4 : 1}
                    bg={active ? colors.brand.highlight : "transparent"}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => runAt(index)}
                    fontFamily={fonts.SpaceGrotesk}
                  >
                    <Text>{cmd.label}</Text>
                  </Flex>
                </Box>
              );
            })}
          </Box>
          <Flex
            px="1.25rem"
            py="0.5rem"
            gap="0.75rem"
            borderTop="1px solid rgba(72, 40, 79, 0.2)"
            fontSize="0.7rem"
            opacity={0.7}
            align="center"
          >
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate
            </span>
            <span>
              <Kbd>↵</Kbd> run
            </span>
            <span>
              <Kbd>esc</Kbd> close
            </span>
          </Flex>
        </ModalContent>
      </Modal>

      <ScryModal
        isOpen={scryOpen}
        onClose={() => setScryOpen(false)}
        deck={pool?.deck ?? []}
        onApply={applyScry}
      />
    </>
  );
};

const TriggerButton = styled.button`
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 250;
  user-select: none;
  cursor: pointer;

  display: flex;
  align-items: center;
  gap: 0.35rem;
  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  font-family: ${fonts.SpaceGrotesk};
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.35rem 0.9rem;
  border-radius: 10rem;
  border: 1px solid rgba(72, 40, 79, 0.25);
  box-shadow: 0 2px 6px rgba(20, 8, 24, 0.35);
  transition: all 0.15s ease-in-out;

  span {
    font-size: 0.95rem;
  }

  :hover {
    background-color: ${colors.brand.highlight};
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(20, 8, 24, 0.4);
  }

  :active {
    transform: translateY(0);
    box-shadow: 0 1px 3px rgba(20, 8, 24, 0.4);
  }
`;
