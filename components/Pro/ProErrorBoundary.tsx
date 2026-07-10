/**
 * Error boundary around the Pro game view (issue #178, part 2).
 *
 * The pro board renders whatever `view` the server sends. A malformed-but-valid
 * state, or a client-side render bug, throws during render and — with no
 * boundary anywhere — white-screens the whole tab. Worse, reconnect re-sends the
 * identical view, so a naive remount just crashes again forever (the Hollow-Oak
 * failure). This boundary turns that dead end into a recoverable panel:
 *
 *  - It shows the thrown error message plus the room id, our seat, and a state
 *    hash — the identifiers a bug report needs to reproduce the crash.
 *  - "Try re-render" clears the error and re-mounts the children. If they throw
 *    again the boundary simply catches again and shows the panel — a bounded,
 *    user-driven retry, never an automatic crash loop.
 *  - "Leave room" is the escape hatch when re-render keeps failing.
 *  - It NEVER swallows the error silently: componentDidCatch logs the message
 *    and the component stack to the console for diagnostics.
 *
 * Deliberately NOT auto-resetting on a new `view`: a reconnect delivers the same
 * throwing state, so auto-retrying it would reintroduce the infinite crash. The
 * panel stays put until the user acts. `resetKeys` is offered for callers that
 * DO have a reason to re-attempt (and for tests to simulate a reconnect); a
 * value change clears the error exactly once, and a repeat throw is re-caught.
 */
import { Component, ErrorInfo, ReactNode } from "react";
import { Box, Button, Code, Flex, Text } from "@chakra-ui/react";

export interface ProErrorBoundaryProps {
  children: ReactNode;
  /** current room id, shown in the panel for bug reports */
  roomId?: string | null;
  /** our seat (e.g. "p1"), shown in the panel for bug reports */
  seat?: string | null;
  /** a short digest of the current state (see lib/pro/stateHash) */
  stateHash?: string | null;
  /** escape hatch when re-render keeps failing (e.g. back to the lobby) */
  onLeave?: () => void;
  /**
   * When any value here changes, a currently-shown error is cleared and the
   * children re-render. Left unset on the live reconnect path on purpose (a
   * re-sent identical view would just re-throw); primarily a testing seam.
   */
  resetKeys?: ReadonlyArray<unknown>;
}

interface ProErrorBoundaryState {
  error: Error | null;
}

const keysChanged = (
  a: ReadonlyArray<unknown> | undefined,
  b: ReadonlyArray<unknown> | undefined
): boolean => {
  if (a === b) return false;
  if (!a || !b || a.length !== b.length) return true;
  return a.some((v, i) => !Object.is(v, b[i]));
};

export class ProErrorBoundary extends Component<
  ProErrorBoundaryProps,
  ProErrorBoundaryState
> {
  state: ProErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ProErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Never swallow: surface the message AND the component stack so a crash is
    // diagnosable from the console even when the panel only shows the message.
    // eslint-disable-next-line no-console
    console.error(
      "[pro] game view render crashed:",
      error,
      info.componentStack
    );
  }

  componentDidUpdate(prev: ProErrorBoundaryProps): void {
    if (this.state.error && keysChanged(prev.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { roomId, seat, stateHash, onLeave } = this.props;
    return (
      <Flex
        direction="column"
        alignItems="center"
        gap="1.25rem"
        pt="4rem"
        px="1rem"
        textAlign="center"
        role="alert"
      >
        <Text
          fontFamily="LeagueGothic"
          fontSize="2rem"
          letterSpacing="0.05em"
          color="red.300"
        >
          Something went wrong drawing the board
        </Text>
        <Text opacity={0.8} maxW="34rem">
          Your game is still alive on the server — this is a display glitch, not a
          lost match. Try re-rendering; if it keeps failing, leave the room and
          rejoin, and please file the details below.
        </Text>

        <Box
          maxW="34rem"
          w="100%"
          bg="blackAlpha.400"
          borderRadius="md"
          p="0.75rem"
          textAlign="left"
        >
          <Code
            display="block"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
            bg="transparent"
            color="red.200"
            fontSize="0.85rem"
          >
            {error.message || String(error)}
          </Code>
          <Text mt="0.5rem" fontSize="0.7rem" opacity={0.6} fontFamily="mono">
            room {roomId ?? "?"} · seat {seat ?? "?"} · state {stateHash ?? "?"}
          </Text>
        </Box>

        <Flex gap="0.75rem" flexWrap="wrap" justifyContent="center">
          <Button colorScheme="purple" onClick={this.reset}>
            Try re-render
          </Button>
          {onLeave && (
            <Button variant="outline" onClick={onLeave}>
              Leave room
            </Button>
          )}
        </Flex>
      </Flex>
    );
  }
}
