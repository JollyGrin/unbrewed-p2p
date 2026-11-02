/**
 * Error boundary around the non-Pro game surfaces (issue #1514): /game and
 * /connect (`sandbox`), /table (`table`), /irl and /offline (`irl`).
 *
 * Same convention as components/Pro/ProErrorBoundary: a render throw becomes a
 * recoverable panel instead of a white screen; "Try again" re-mounts the
 * children (a repeat throw is simply caught again, never an automatic loop);
 * the error is logged to the console and reported as one `client_error` per
 * boundary per page load. The sandbox game state lives in the relay / local
 * storage, so a re-mount picks it back up; on /irl and /offline the boundary
 * sits inside OfflineGameProvider so its in-memory board survives a retry.
 *
 * One exception (#1528): a DOM-reconciliation `NotFoundError` (React's
 * insertBefore/removeChild hit a node that isn't there any more, usually
 * because browser translation such as Chrome's Google Translate swapped a text
 * node for a <font>) is fixed by a fresh mount. The first one per boundary
 * instance remounts the children without showing the panel and is reported
 * with `auto_recovered`. A second one shows the panel as usual, so this can
 * never loop.
 */
import { Component, ErrorInfo, ReactNode } from "react";
import { Box, Button, Code, Flex, Text } from "@chakra-ui/react";
import Link from "next/link";
import { ErrorBoundaryName, reportClientError } from "@/lib/analyticsErrors";

export interface GameErrorBoundaryProps {
  children: ReactNode;
  boundary: Exclude<ErrorBoundaryName, "pro">;
}

interface GameErrorBoundaryState {
  error: Error | null;
  /** The one automatic remount has been used (#1528). */
  autoRecovered: boolean;
}

/**
 * React's commit phase failed against a DOM that something outside React
 * rewrote (browser translation, extensions). A fresh mount rebuilds it.
 * Duck-typed: a DOMException is not an Error in every environment.
 */
export const isDomReconcileError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === "NotFoundError" && typeof message === "string" && /insertBefore|removeChild/.test(message);
};

export class GameErrorBoundary extends Component<GameErrorBoundaryProps, GameErrorBoundaryState> {
  state: GameErrorBoundaryState = { error: null, autoRecovered: false };

  static getDerivedStateFromError(error: Error): Partial<GameErrorBoundaryState> {
    return { error };
  }

  /** This error gets the one silent remount instead of the panel. */
  private willAutoRecover(error: Error | null): boolean {
    return !this.state.autoRecovered && isDomReconcileError(error);
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.willAutoRecover(error)) {
      // eslint-disable-next-line no-console
      console.warn(`[${this.props.boundary}] DOM was changed outside React, remounting:`, error);
      reportClientError(this.props.boundary, error, { autoRecovered: true });
      this.setState({ error: null, autoRecovered: true });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(`[${this.props.boundary}] render crashed:`, error, info.componentStack);
    reportClientError(this.props.boundary, error);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Between the catch and the remount in componentDidCatch: no panel flash.
    if (this.willAutoRecover(error)) return null;
    return (
      <Flex
        direction="column"
        alignItems="center"
        gap="1.25rem"
        pt="4rem"
        px="1rem"
        minH="100svh"
        textAlign="center"
        bg="brand.secondary"
        color="brand.primary"
        role="alert"
        data-testid="game-error-boundary-fallback"
      >
        <Text fontFamily="LeagueGothic" fontSize="2rem" letterSpacing="0.05em" color="red.300">
          Something went wrong on this page
        </Text>
        <Text opacity={0.8} maxW="34rem">
          This is a display glitch. Try again; if it keeps failing, head home and come back.
        </Text>
        <Box maxW="34rem" w="100%" bg="blackAlpha.400" borderRadius="md" p="0.75rem" textAlign="left">
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
        </Box>
        <Flex gap="0.75rem" flexWrap="wrap" justifyContent="center">
          <Button colorScheme="purple" onClick={this.reset}>
            Try again
          </Button>
          <Button as={Link} href="/" variant="outline">
            Home
          </Button>
        </Flex>
      </Flex>
    );
  }
}
