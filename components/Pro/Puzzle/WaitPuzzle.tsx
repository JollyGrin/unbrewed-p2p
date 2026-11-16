/**
 * A puzzle while you wait (issue #1681): what `/pro/game` puts around the
 * `PuzzlePanel` in its two dead-time states.
 *
 * - `QuickWaitBar` + `WaitPuzzle`: over the picker's roster while a Quick Play
 *   search runs. The bar is the search's status (elapsed, cancel); when the
 *   match lands it turns gold and counts down to the table, with "Go".
 * - `LobbyWaitBar` + `WaitPuzzle`: the created-lobby waiting screen, cut down
 *   to one bar (room code, copy link, make public, chime). When the game
 *   starts it turns gold: "Opponent joined", a short countdown, "Go".
 *
 * Presentation only. The page (pages/pro/game.tsx) decides when any of this is
 * shown and what "Go" does; lib/pro/waitPuzzle.ts holds the shared decisions.
 * The panel is loaded lazily: it carries a whole in-game view of its own.
 */
import dynamic from "next/dynamic";
import { Box, Button, Flex, Text, keyframes } from "@chakra-ui/react";
import type { ReactNode } from "react";

const PuzzlePanel = dynamic(() => import("@/components/Pro/Puzzle/PuzzlePanel"), { ssr: false });

const spin = keyframes`to { transform: rotate(360deg) }`;

const BAR_BUTTON = {
  type: "button" as const,
  size: "sm",
  h: "1.9rem",
  px: "0.65rem",
  borderRadius: "5px",
  fontFamily: "SpaceGrotesk",
  fontWeight: 600,
  fontSize: "0.68rem",
  letterSpacing: "0.05em",
  textTransform: "uppercase" as const,
  flexShrink: 0,
};

/** A quiet button on the dark bar. */
const BarButton = ({ children, active, ...rest }: { children: ReactNode; active?: boolean } & Record<string, unknown>) => (
  <Button
    {...BAR_BUTTON}
    border="1px solid"
    borderColor={active ? "brand.accent" : "whiteAlpha.300"}
    bg={active ? "rgba(224,168,46,0.16)" : "transparent"}
    color="brand.parchment"
    _hover={{ bg: "whiteAlpha.100", borderColor: "brand.accent" }}
    {...rest}
  >
    {children}
  </Button>
);

/** "Go": the one button on the gold bar. */
const GoButton = ({ onGo, disabled }: { onGo: () => void; disabled?: boolean }) => (
  <Button
    {...BAR_BUTTON}
    data-testid="wait-go"
    onClick={onGo}
    isDisabled={disabled}
    px="1.1rem"
    bg="brand.surfaceDim"
    color="brand.accent"
    border="1px solid"
    borderColor="brand.surfaceDim"
    _hover={{ bg: "brand.surface" }}
  >
    Go
  </Button>
);

const Bar = ({ gold, testId, children }: { gold: boolean; testId: string; children: ReactNode }) => (
  <Flex
    data-testid={testId}
    data-gold={gold ? "true" : "false"}
    flex="none"
    align="center"
    gap="0.6rem"
    rowGap="0.35rem"
    flexWrap="wrap"
    minH="2.9rem"
    px="0.8rem"
    py="0.45rem"
    borderRadius="8px"
    border="1px solid"
    borderColor={gold ? "brand.accent" : "whiteAlpha.300"}
    bg={gold ? "brand.accent" : "rgba(0,0,0,0.28)"}
    color={gold ? "brand.surfaceDim" : "brand.parchment"}
    transition="background 200ms ease, color 200ms ease"
  >
    {children}
  </Flex>
);

const Title = ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => (
  <Text as="span" fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.06em" lineHeight="1.1" {...rest}>
    {children}
  </Text>
);

const Note = ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => (
  <Text as="span" fontFamily="SpaceGrotesk" fontSize="0.75rem" lineHeight="1.3" {...rest}>
    {children}
  </Text>
);

/** The gold half of both bars: who arrived, the countdown, "Go". */
const Arrived = ({ title, secondsLeft, onGo, goDisabled }: { title: string; secondsLeft: number; onGo: () => void; goDisabled?: boolean }) => (
  <>
    <Flex role="status" aria-live="assertive" align="baseline" gap="0.6rem" flexWrap="wrap" flex="1" minW="0">
      <Title data-testid="wait-bar-title">{title}</Title>
      <Note fontWeight={600}>
        Entering table in{" "}
        <Box as="b" data-testid="wait-bar-seconds" fontFamily="BebasNeueRegular" fontSize="1.15rem" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {Math.max(0, secondsLeft)}
        </Box>
      </Note>
    </Flex>
    <GoButton onGo={onGo} disabled={goDisabled} />
  </>
);

export interface QuickWaitBarProps {
  /** "0:42" */
  elapsed: string;
  onCancel: () => void;
  onHide: () => void;
  /** set once the match has landed: the bar turns gold */
  found: { name: string; secondsLeft: number; onGo: () => void; goDisabled?: boolean } | null;
}

export const QuickWaitBar = ({ elapsed, onCancel, onHide, found }: QuickWaitBarProps) => (
  <Bar gold={!!found} testId="wait-bar">
    {found ? (
      <Arrived title={`Match found · ${found.name}`} secondsLeft={found.secondsLeft} onGo={found.onGo} goDisabled={found.goDisabled} />
    ) : (
      <>
        <Box
          flex="none"
          w="14px"
          h="14px"
          borderRadius="50%"
          border="2px solid rgba(224,168,46,0.3)"
          borderTopColor="brand.accent"
          sx={{ animation: `${spin} 0.9s linear infinite`, "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
        />
        <Flex role="status" align="baseline" gap="0.6rem" flexWrap="wrap" flex="1" minW="0">
          <Title data-testid="wait-bar-title">Finding a match</Title>
          <Note opacity={0.75}>
            Waiting{" "}
            <Box as="b" data-testid="wait-bar-elapsed" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {elapsed}
            </Box>
            {" · solve a puzzle meanwhile, it pauses when your match is found"}
          </Note>
        </Flex>
        <BarButton data-testid="wait-hide" onClick={onHide}>
          Hide puzzles while waiting
        </BarButton>
        <BarButton data-testid="wait-cancel" onClick={onCancel}>
          Cancel
        </BarButton>
      </>
    )}
  </Bar>
);

export interface LobbyWaitBarProps {
  /** "ROOM AB12" */
  title: string;
  /** "Waiting for an opponent" / "Waiting for players — 2/3 seats joined" */
  waiting: string;
  /** "⏱ 60s" etc.; null = nothing */
  rule: string | null;
  joinUrl: string;
  onCopy: () => void;
  copied: boolean;
  roomPublic: boolean;
  onTogglePublic: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onHide: () => void;
  /** set once the game has started: the bar turns gold */
  joined: { secondsLeft: number; onGo: () => void } | null;
}

export const LobbyWaitBar = ({
  title,
  waiting,
  rule,
  joinUrl,
  onCopy,
  copied,
  roomPublic,
  onTogglePublic,
  soundOn,
  onToggleSound,
  onHide,
  joined,
}: LobbyWaitBarProps) => (
  <Bar gold={!!joined} testId="wait-bar">
    {joined ? (
      <Arrived title="Opponent joined" secondsLeft={joined.secondsLeft} onGo={joined.onGo} />
    ) : (
      <>
        <Flex role="status" align="baseline" gap="0.6rem" flexWrap="wrap" flex="1" minW="0">
          <Title data-testid="waiting-title">{title}</Title>
          <Note opacity={0.75} data-testid="wait-bar-waiting">
            {waiting}
            {rule ? ` · ${rule}` : ""}
          </Note>
        </Flex>
        <Note
          data-testid="wait-bar-link"
          fontFamily="mono"
          fontSize="0.68rem"
          px="0.5rem"
          py="0.25rem"
          borderRadius="4px"
          bg="blackAlpha.500"
          maxW="19rem"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          title={joinUrl}
        >
          {joinUrl}
        </Note>
        <BarButton data-testid="wait-copy" active onClick={onCopy}>
          {copied ? "✓ Link copied" : "Copy link"}
        </BarButton>
        <BarButton data-testid="wait-public" active={roomPublic} onClick={onTogglePublic} aria-pressed={roomPublic}>
          {roomPublic ? "✓ Public" : "Make public"}
        </BarButton>
        <BarButton
          data-testid="lobby-sound-toggle"
          active={soundOn}
          onClick={onToggleSound}
          aria-label={soundOn ? "Mute the match-found chime" : "Unmute the match-found chime"}
        >
          {soundOn ? "🔊 Chime" : "🔇 Muted"}
        </BarButton>
        <BarButton data-testid="wait-hide" onClick={onHide}>
          Hide puzzles while waiting
        </BarButton>
      </>
    )}
  </Bar>
);

export interface WaitPuzzleProps {
  context: "quick_search" | "lobby_wait";
  /** the opponent is here: freeze the panel (its try and its socket are kept) */
  paused: boolean;
  /** the panel has nothing to show (no server, no catalogue, a lost socket): put the old screen back */
  onUnavailable: () => void;
}

/** The panel in a box that takes whatever height its column has left. */
export const WaitPuzzle = ({ context, paused, onUnavailable }: WaitPuzzleProps) => (
  <Box data-testid="wait-puzzle" flex="1" minH="0" minW="0">
    <PuzzlePanel context={context} paused={paused} onUnavailable={onUnavailable} />
  </Box>
);

/** The way back once the switch is off: one quiet line on the old screens. */
export const ShowWaitPuzzleLink = ({ onShow }: { onShow: () => void }) => (
  <Button
    type="button"
    variant="link"
    data-testid="wait-show"
    onClick={onShow}
    fontFamily="SpaceGrotesk"
    fontWeight="normal"
    fontSize="0.75rem"
    color="brand.accent"
    _hover={{ color: "brand.accentDeep" }}
  >
    Solve a puzzle while you wait
  </Button>
);
