import {
  Box,
  Flex,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Tooltip,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import styled from "@emotion/styled";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { colors, fonts } from "@/styles/style";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameState, PlayerState } from "@/lib/gamesocket/message";
import { SandboxLogEntry, mergeActionLog } from "@/lib/sandbox/gameLog";

type FeedLine = SandboxLogEntry;

const INLINE_LINES = 15;

/** Short relative age, e.g. "just now", "3m", "2h". */
const relativeTime = (at: number, now: number): string => {
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 5) return "now";
  if (secs < 60) return `${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
};

const absoluteTime = (at: number): string =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/**
 * Synced activity feed. Each player's blob carries a bounded `actionLog`
 * (see WebGameProvider.logAction); this merges every player's entries into one
 * stream, newest first, so opponents can see otherwise-hidden deck moves.
 */
export const ActionLog: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const { gameState } = useWebGame();
  const localName = useRouter().query?.name;
  const self = Array.isArray(localName) ? localName[0] : localName;

  // This feed is entirely client-only: it depends on the websocket, the router
  // query, and wall-clock time, none of which exist during the static
  // prerender (dev SSR or the GitHub Pages export). Rendering it before mount
  // would make the first client paint disagree with the prerendered HTML and
  // trip React's hydration check, so we hold off until we're on the client.
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    // A slow tick so relative timestamps stay fresh while nothing else changes.
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const players = (gameState?.content as GameState | undefined)?.players as
    | Record<string, PlayerState>
    | undefined;

  // Newest first.
  const lines: FeedLine[] = useMemo(() => mergeActionLog(players), [players]);

  const inline = lines.slice(0, INLINE_LINES);
  const overflow = lines.length - inline.length;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Newest is at the top, so keep the view pinned there on updates.
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [lines.length, open]);

  if (!mounted) return null;

  const Line: React.FC<{ line: FeedLine; showAbsolute?: boolean }> = ({
    line,
    showAbsolute,
  }) => (
    <Flex
      gap="0.4rem"
      py="0.14rem"
      align="baseline"
      fontFamily={fonts.SpaceGrotesk}
      fontSize="0.72rem"
      lineHeight="1.25"
    >
      <Text
        fontWeight={700}
        color={
          line.player === self ? colors.brand.secondary : "brand.surfaceDim"
        }
        flexShrink={0}
        maxW="6rem"
        isTruncated
      >
        {line.player === self ? "You" : line.player}
      </Text>
      <Text flex="1">{line.text}</Text>
      <Tooltip
        label={absoluteTime(line.at)}
        placement="left"
        openDelay={200}
        hasArrow
      >
        <Text
          flexShrink={0}
          opacity={0.5}
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {showAbsolute ? absoluteTime(line.at) : relativeTime(line.at, now)}
        </Text>
      </Tooltip>
    </Flex>
  );

  return (
    <>
      <Panel>
        <Header onClick={() => setOpen((o) => !o)}>
          <Text
            fontFamily={fonts.SpaceGrotesk}
            fontWeight={700}
            fontSize="0.72rem"
            letterSpacing="0.08em"
            textTransform="uppercase"
          >
            Activity
          </Text>
          {open ? (
            <ChevronUpIcon boxSize="1rem" />
          ) : (
            <ChevronDownIcon boxSize="1rem" />
          )}
        </Header>
        {open && (
          <>
            <Box
              ref={scrollRef}
              maxH="15rem"
              overflowY="auto"
              px="0.75rem"
              py="0.4rem"
            >
              {inline.length === 0 ? (
                <Text fontSize="0.72rem" opacity={0.55} py="0.25rem">
                  No actions yet
                </Text>
              ) : (
                inline.map((line) => <Line key={line.key} line={line} />)
              )}
            </Box>
            {overflow > 0 && (
              <ShowMore onClick={() => setDetailOpen(true)}>
                Show {overflow} more…
              </ShowMore>
            )}
          </>
        )}
      </Panel>

      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        isCentered
        scrollBehavior="inside"
      >
        <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
        <ModalContent
          bg="brand.parchment"
          borderRadius="1rem"
          border="1px solid rgba(72, 40, 79, 0.35)"
          boxShadow="0 18px 48px rgba(20, 8, 24, 0.55)"
        >
          <ModalHeader
            fontFamily="BebasNeueRegular"
            fontSize="1.5rem"
            letterSpacing="0.05em"
            textTransform="uppercase"
            color="brand.secondary"
          >
            Activity log
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="1.25rem">
            {lines.length === 0 ? (
              <Text opacity={0.6}>No actions yet</Text>
            ) : (
              lines.map((line) => (
                <Line key={line.key} line={line} showAbsolute />
              ))
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

const Panel = styled(Box)`
  position: fixed;
  top: 4.75rem;
  right: 1rem;
  z-index: 240;
  width: 230px;
  max-width: calc(100vw - 2rem);
  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  border: 1px solid rgba(72, 40, 79, 0.25);
  border-radius: 0.75rem;
  box-shadow: 0 6px 18px rgba(20, 8, 24, 0.35);
  overflow: hidden;
  opacity: 0.94;
`;

const Header = styled(Flex)`
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid rgba(72, 40, 79, 0.18);

  :hover {
    background-color: ${colors.brand.highlight};
  }
`;

const ShowMore = styled.button`
  width: 100%;
  padding: 0.35rem 0.75rem;
  text-align: center;
  cursor: pointer;
  user-select: none;
  font-family: ${fonts.SpaceGrotesk};
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${colors.brand.secondary};
  border-top: 1px solid rgba(72, 40, 79, 0.18);

  :hover {
    background-color: ${colors.brand.highlight};
  }
`;
