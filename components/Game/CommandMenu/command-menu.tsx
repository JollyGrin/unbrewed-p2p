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
import { PoolType, reorderTop } from "@/components/DeckPool/PoolFns";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { ScryModal } from "./scry.modal";
import { rollDice } from "@/components/Game/Dice/rollDice";
import { DeckCommand, DeckLabel, buildDeckCommands } from "./deckCommands";

export const CommandMenu: React.FC<{
  openModal: (type: ModalType) => void;
  openTokenLibrary?: () => void;
}> = ({ openModal, openTokenLibrary }) => {
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
  // `label` doubles as a local toast for the actor's own feedback; a function
  // label runs after the mutation so it can name the affected cards.
  const act =
    <R,>(mutate: (p: PoolType) => R, label: DeckLabel<R>) =>
    () => {
      if (!pool) return;
      const moved = mutate(pool);
      const text = typeof label === "function" ? label(pool, moved) : label;
      logAction(text);
      toast.success(text);
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

  // Single source of truth shared with the pile split-button chevrons
  // (deckCommands.ts). The palette injects the primitives it can provide —
  // dice rolls, the token library — and closes itself in each callback.
  const commands: DeckCommand[] = useMemo(
    () =>
      buildDeckCommands({
        act,
        roll,
        openModal: (type) => {
          close();
          openModal(type);
        },
        openScry: () => {
          setIsOpen(false);
          setScryOpen(true);
        },
        openTokenLibrary: openTokenLibrary
          ? () => {
              close();
              openTokenLibrary();
            }
          : undefined,
      }),
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
