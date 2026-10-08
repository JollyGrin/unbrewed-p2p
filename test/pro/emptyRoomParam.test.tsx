/** `?room=` with no value is no room (#1265): the create picker, not the join-style one. */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import type { ReactNode } from "react";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { ClientMsg } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

/**
 * Chakra's <Modal> traps focus with react-focus-lock, and its focusable-element
 * selector (`input:not(:disabled):not([disabled])`) is one the pinned
 * jsdom/nwsapi pair cannot parse: opening any modal throws
 * `':disabled):not([disabled]' is not a valid selector` out of a layout effect,
 * before a single assertion runs. The trap is a browser concern with nothing to
 * verify here, so it is stubbed to a passthrough — the modal's own markup, which
 * is what the #781 tests read, renders exactly as it does in the app.
 */
jest.mock("@chakra-ui/focus-lock", () => ({
  __esModule: true,
  FocusLock: ({ children }: { children: ReactNode }) => children,
}));


const HEROES = [{ heroId: "king-kong", name: "King Kong", hp: 18, move: 2, reach: "MELEE" }];

const fakeRouter = (query: Record<string, string>) =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query,
    asPath: "/pro/game",
    basePath: "",
    isReady: true,
    isFallback: false,
    isPreview: false,
    isLocaleDomain: false,
    events: { on() {}, off() {}, emit() {} },
    push: async () => true,
    replace: async () => true,
    reload() {},
    back() {},
    forward() {},
    prefetch: async () => {},
    beforePopState() {},
  }) as never;

const mountPicker = async (query: Record<string, string>) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter(query)}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>,
  );
  const ws = FakeWebSocket.latest();
  if (!ws) throw new Error("the page never opened a socket");
  await act(async () => {
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.({});
  });
  await act(async () => {
    ws.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, type: "HEROES", heroes: HEROES }) });
  });
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
});
beforeEach(() => FakeWebSocket.reset());
afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

it("an empty ?room= keeps the create picker (stage and format rows)", async () => {
  await mountPicker({ room: "" });
  expect(screen.getByText("STAGE")).toBeInTheDocument();
  expect(screen.getByText("FORMAT")).toBeInTheDocument();
});

it("a real ?room= is the join-style picker (no stage or format rows)", async () => {
  await mountPicker({ room: "abc123" });
  expect(screen.queryByText("STAGE")).not.toBeInTheDocument();
  expect(screen.queryByText("FORMAT")).not.toBeInTheDocument();
});
