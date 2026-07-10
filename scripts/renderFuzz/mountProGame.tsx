/**
 * Mounts the REAL Pro game page and drives one server view into it, returning
 * a deterministic pass/throw outcome (unbrewed-p2p-179).
 *
 * This renders the exact component tree a live client shows — pages/pro/game
 * `LiveGame` under the same providers _app.tsx wires (react-query + Chakra) and
 * the Next RouterContext — then delivers the view along the SAME path as
 * lib/pro/useProSocket.ts: a `STATE` frame on the WebSocket whose `msg.view`
 * becomes the render snapshot. A jsdom `WebSocket` stub (domEnv.ts) stands in
 * for the socket, so nothing touches the network or a live server.
 *
 * Isolation over speed: each view is rendered into a FRESH mount and unmounted
 * after. A crash on one step therefore never poisons the next, and the CLI's
 * bulk sweep and its single-view `--repro` mode run byte-identical code — the
 * repro is just this function called once.
 *
 * Import order matters: the caller MUST have a DOM in place (Jest's jsdom, or
 * the CLI's `createJsdomEnv()`) BEFORE this module is imported, because its
 * static imports (Chakra, framer-motion, the page) evaluate against the DOM.
 */
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { Action, GameEvent, PlayerView } from "@/lib/pro/protocol";
import { installFakeWebSocket, installPolyfills, FakeWebSocket } from "./domEnv";
import { FALLBACK_TESTID, fallbackShownIn, parseBoundaryMarker, RenderThrow } from "./detect";

export type { RenderThrow } from "./detect";

// The app's .tsx files (game.tsx and its children) use the CLASSIC JSX runtime
// and do NOT import React, relying on it being in scope. When this harness runs
// under `tsx` with the repo's root tsconfig (`jsx: preserve`), esbuild emits
// classic `React.createElement` calls against a free `React` variable. Expose
// the real React as a global so those resolve — a no-op under Jest/SWC's
// automatic runtime, where the transform injects its own import.
(globalThis as Record<string, unknown>).React = React;

export interface RenderOutcome {
  ok: boolean;
  error: RenderThrow | null;
}

export interface RenderViewOptions {
  legalActions?: Action[];
  events?: GameEvent[];
  /** Room id used for the reconnect-token bypass; only cosmetic. */
  room?: string;
}

/** Catches any throw from the page subtree and reports it (no fallback UI). */
class RenderThrowBoundary extends React.Component<
  { onError: (e: RenderThrow) => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onError({
      message: String(error?.message ?? error),
      stack: error?.stack ?? null,
      componentStack: info?.componentStack ?? null,
    });
  }
  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const fakeRouter = (room: string): Record<string, unknown> => ({
  route: "/pro/game",
  pathname: "/pro/game",
  query: { room },
  asPath: `/pro/game?room=${room}`,
  basePath: "",
  isReady: true,
  isFallback: false,
  isPreview: false,
  isLocaleDomain: false,
  locale: undefined,
  locales: undefined,
  defaultLocale: undefined,
  events: { on() {}, off() {}, emit() {} },
  push: async () => true,
  replace: async () => true,
  reload() {},
  back() {},
  forward() {},
  prefetch: async () => {},
  beforePopState() {},
});

/**
 * Render a single server view in isolation. Returns `{ ok: true }` if the page
 * mounted and applied the STATE without throwing, or `{ ok: false, error }`
 * with the message + component stack of the first render throw.
 *
 * Two throw signals are honored, because the page's OWN ProErrorBoundary catches
 * board-level crashes before our outer boundary can:
 *   1. our outer RenderThrowBoundary — for throws ABOVE the page's boundary
 *      (LiveGame body derivations, provider setup, etc.), and
 *   2. the page's ProErrorBoundary detection seam — its console marker (parsed,
 *      not muted) plus its fallback `data-testid` — for throws it swallowed.
 */
export async function renderView(
  view: PlayerView,
  opts: RenderViewOptions = {}
): Promise<RenderOutcome> {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.reset();

  const room = opts.room ?? "FUZZ";
  // Seed this tab's reconnect token so the page's auto-reconnect effect flips
  // straight into the board instead of parking on the hero-select lobby (the
  // `joined` gate in LiveGame). No real reconnect happens — the socket is fake.
  try {
    sessionStorage.setItem(`unbrewed-pro-token-${room}`, "render-fuzz-token");
  } catch {
    /* sessionStorage may be unavailable in some envs; the lobby path still renders */
  }

  // 1. Throws that escape the page's own boundary land here.
  let outerCapture: RenderThrow | null = null;
  const onError = (e: RenderThrow) => {
    if (!outerCapture) outerCapture = e;
  };

  // 2. Throws the page's ProErrorBoundary swallows: capture its console marker
  //    instead of blanket-muting console (a plain mute would kill this signal).
  //    Everything else that React/jsdom logs is still hushed unless RENDER_FUZZ_DEBUG.
  let markerCapture: RenderThrow | null = null;
  const realError = console.error;
  const realWarn = console.warn;
  console.error = (...args: unknown[]): void => {
    const parsed = parseBoundaryMarker(args);
    if (parsed) {
      if (!markerCapture) markerCapture = parsed;
      return;
    }
    if (process.env.RENDER_FUZZ_DEBUG) realError(...(args as []));
  };
  console.warn = (...args: unknown[]): void => {
    if (process.env.RENDER_FUZZ_DEBUG) realWarn(...(args as []));
  };

  const container = document.createElement("div");
  container.id = "render-fuzz-root";
  document.body.appendChild(container);
  const root = createRoot(container);

  let fallbackShown = false;
  let fallbackMessage: string | null = null;
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <RouterContext.Provider value={fakeRouter(room) as never}>
            <ChakraProvider theme={theme}>
              <RenderThrowBoundary onError={onError}>
                <ProGamePage />
              </RenderThrowBoundary>
            </ChakraProvider>
          </RouterContext.Provider>
        </QueryClientProvider>
      );
    });

    const ws = FakeWebSocket.latest();
    if (ws) {
      await act(async () => {
        ws.readyState = FakeWebSocket.OPEN;
        ws.onopen?.({});
      });
      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({
            v: PROTOCOL_VERSION,
            type: "STATE",
            view,
            legalActions: opts.legalActions ?? [],
            events: opts.events ?? [],
          }),
        });
      });
    }

    // The page's boundary tripped into its fallback panel — read it before unmount.
    fallbackShown = fallbackShownIn(container);
    if (fallbackShown) {
      fallbackMessage = container.querySelector(`[data-testid="${FALLBACK_TESTID}"] code`)?.textContent ?? null;
    }
  } catch (e) {
    // A throw that escaped every boundary (e.g. during commit outside a subtree)
    // is still a genuine render failure — record it.
    if (!outerCapture) {
      const err = e as Error;
      outerCapture = { message: String(err?.message ?? err), stack: err?.stack ?? null, componentStack: null };
    }
  } finally {
    try {
      await act(async () => {
        root.unmount();
      });
    } catch {
      /* unmount best-effort */
    }
    container.remove();
    console.error = realError;
    console.warn = realWarn;
  }

  // Prefer the richest signal: an escaped throw, then the boundary's marked
  // error, then bare evidence the fallback panel rendered.
  let error: RenderThrow | null = outerCapture ?? markerCapture;
  if (!error && fallbackShown) {
    error = {
      message: fallbackMessage ?? "render crashed (ProErrorBoundary fallback shown; no error captured)",
      stack: null,
      componentStack: null,
    };
  }
  return { ok: !error, error };
}
