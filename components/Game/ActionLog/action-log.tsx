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
import { css, keyframes } from "@emotion/react";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { colors, fonts } from "@/styles/style";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameState, PlayerState } from "@/lib/gamesocket/message";
import { mergeActionLog } from "@/lib/sandbox/gameLog";
import { useKeybindHandler } from "@/lib/keybinds/handlers";
import { KeyHint } from "@/components/Game/Keybinds/key-hint";

import {
  GROUP_GAP_MS,
  LogGroup,
  groupActionLog,
  INLINE_VALUE_LIMIT,
  groupLabelParts,
} from "@/lib/sandbox/groupActionLog";

/** The inline panel shows this many lines; a group counts as one. */
const INLINE_LINES = 15;

/**
 * More new lines than this in one update is a load / reconnect, not play:
 * skip the entrance so the whole feed does not fade in at once.
 */
const ENTRANCE_BURST = 3;

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

/** Hover time: one instant, or the span a group covers. */
const groupTimeLabel = (group: LogGroup): string =>
  group.count > 1 && absoluteTime(group.firstAt) !== absoluteTime(group.at)
    ? `${absoluteTime(group.firstAt)} – ${absoluteTime(group.at)}`
    : absoluteTime(group.at);

const lineEnter = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
`;

const countBump = keyframes`
  0% { transform: scale(1); }
  40% { transform: scale(1.28); }
  100% { transform: scale(1); }
`;

const Row = styled.div<{ entering: boolean }>`
  ${(p) =>
    p.entering &&
    css`
      animation: ${lineEnter} 220ms ease-out both;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Count = styled.span<{ bump: boolean }>`
  display: inline-block;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${colors.brand.secondary};
  transform-origin: 50% 60%;
  ${(p) =>
    p.bump &&
    css`
      animation: ${countBump} 260ms ease-out;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ExpandButton = styled.button`
  display: inline-flex;
  align-items: center;
  margin-left: 0.15rem;
  padding: 0 0.1rem;
  border-radius: 0.25rem;
  color: ${colors.brand.secondary};
  cursor: pointer;
  vertical-align: middle;

  :hover {
    background-color: ${colors.brand.highlight};
  }
`;

const Entries = styled.ul`
  list-style: none;
  margin: 0 0 0.3rem 0.5rem;
  padding: 0.1rem 0 0.1rem 0.6rem;
  border-left: 2px solid rgba(72, 40, 79, 0.18);
  font-family: ${fonts.SpaceGrotesk};
  font-size: 0.72rem;
  line-height: 1.25;

  li {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
    padding: 0.1rem 0;
  }
`;

interface LineProps {
  group: LogGroup;
  self?: string;
  now: number;
  /** Modal mode: absolute times, and a group opens to its entries. */
  detail?: boolean;
  /** Play the entrance once, on mount. */
  entering?: boolean;
}

/**
 * One feed line: a single action, or a run of the same action with a count.
 * Module-level on purpose: declared inside ActionLog it would be a new
 * component type on every render, remounting every line (and replaying
 * every animation) on each tick.
 */
const Line: React.FC<LineProps> = ({ group, self, now, detail, entering }) => {
  // Latched at mount, so a re-render mid-animation cannot cut it short and a
  // later one cannot replay it.
  const [enterOnMount] = useState(Boolean(entering));
  // The count the line appeared with: only growth after that bumps, so
  // reopening the panel does not bump every group.
  const mountCount = useRef(group.count);
  const [expanded, setExpanded] = useState(false);
  // The narrow panel lists the latest few dice values; the full-log dialog
  // (detail) lists them all.
  const { base, count, detail: values } = groupLabelParts(
    group,
    detail ? undefined : INLINE_VALUE_LIMIT,
  );
  const mine = group.player === self;
  const expandable = Boolean(detail) && group.count > 1;

  return (
    <Row entering={enterOnMount} data-testid="action-log-line">
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
          color={mine ? colors.brand.secondary : "brand.surfaceDim"}
          flexShrink={0}
          maxW="6rem"
          isTruncated
        >
          {mine ? "You" : group.player}
        </Text>
        <Text flex="1">
          {base}
          {count && (
            <>
              {" "}
              <Count
                // Re-keyed per count so the bump restarts each time it grows.
                key={group.count}
                bump={group.count !== mountCount.current}
              >
                {count}
              </Count>
            </>
          )}
          {values && ` ${values}`}
          {expandable && (
            <ExpandButton
              type="button"
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? `Hide the ${group.count} entries`
                  : `Show the ${group.count} entries`
              }
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? (
                <ChevronUpIcon boxSize="0.9rem" />
              ) : (
                <ChevronDownIcon boxSize="0.9rem" />
              )}
            </ExpandButton>
          )}
        </Text>
        <Tooltip
          label={groupTimeLabel(group)}
          placement="left"
          openDelay={200}
          hasArrow
        >
          <Text
            flexShrink={0}
            opacity={0.5}
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {detail ? absoluteTime(group.at) : relativeTime(group.at, now)}
          </Text>
        </Tooltip>
      </Flex>
      {expandable && expanded && (
        <Entries>
          {group.entries.map((entry) => (
            <li key={entry.key}>
              <Text flex="1">{entry.text}</Text>
              <Text
                flexShrink={0}
                opacity={0.5}
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {absoluteTime(entry.at)}
              </Text>
            </li>
          ))}
        </Entries>
      )}
    </Row>
  );
};

/**
 * Synced activity feed. Each player's blob carries a bounded `actionLog`
 * (see WebGameProvider.logAction); this merges every player's entries into one
 * stream, newest first, so opponents can see otherwise-hidden deck moves.
 */
export const ActionLog: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  useKeybindHandler("toggleLog", () => setOpen((o) => !o));
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
  const lines = useMemo(() => mergeActionLog(players), [players]);

  // Runs of the same action collapse to one counted line (display only: the
  // stored log and the wire stay one entry per action). The inline limit and
  // the "more" count are in lines as shown, so a group counts once.
  const groups = useMemo(() => groupActionLog(lines, GROUP_GAP_MS), [lines]);
  const inline = groups.slice(0, INLINE_LINES);
  const overflow = groups.length - inline.length;

  // Lines that appeared since the last commit get the entrance. Null until
  // the first commit, so whatever is already there on load stays still.
  const seenRef = useRef<Set<string> | null>(null);
  const seen = seenRef.current;
  const fresh = seen ? groups.filter((g) => !seen.has(g.key)) : [];
  const entering =
    fresh.length > 0 && fresh.length <= ENTRANCE_BURST
      ? new Set(fresh.map((g) => g.key))
      : null;
  useEffect(() => {
    seenRef.current = new Set(groups.map((g) => g.key));
  }, [groups]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Newest is at the top, so keep the view pinned there on updates.
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [lines.length, open]);

  if (!mounted) return null;

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
            <KeyHint action="toggleLog" />
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
                inline.map((group) => (
                  <Line
                    key={group.key}
                    group={group}
                    self={self}
                    now={now}
                    entering={entering?.has(group.key)}
                  />
                ))
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
            {groups.length === 0 ? (
              <Text opacity={0.6}>No actions yet</Text>
            ) : (
              groups.map((group) => (
                <Line
                  key={group.key}
                  group={group}
                  self={self}
                  now={now}
                  detail
                />
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
