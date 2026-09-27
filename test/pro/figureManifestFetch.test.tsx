/**
 * The figure manifest is fetched only for the tabletop view (#877).
 *
 * `/figures/manifest.json` is a git-ignored folder that ships only with the
 * owner's own deploy, and only the tabletop draws figures. Before #877 every
 * Pro game requested it on mount — the flat board included — so every deploy
 * without the folder logged a 404 on every game. This mounts the REAL page
 * (the render-fuzz recipe: fake WebSocket, seeded reconnect token, one STATE
 * frame over a recorded view) with each stored board view and checks which
 * requests went out.
 */
import "@testing-library/jest-dom";
import { act, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { PlayerView } from "@/lib/pro/protocol";
import { FIGURES_MANIFEST_URL } from "@/lib/pro/figures";
import { BOARD_VIEW_KEY } from "@/lib/pro/useBoardView";
import { resetFigureManifestCache } from "@/lib/pro/useFigureManifest";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "FIGS";

const VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query: { room: ROOM },
    asPath: `/pro/game?room=${ROOM}`,
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

const mountGame = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter()}>
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
    ws.onmessage?.({
      data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view: VIEW, legalActions: [], events: [] }),
    });
  });
  // let any mount-time request settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

const originalFetch = (global as unknown as { fetch?: unknown }).fetch;
let fetchMock: jest.Mock;

/** Every URL the page fetched that was the figure manifest. */
const manifestRequests = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(FIGURES_MANIFEST_URL));

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
});

beforeEach(() => {
  FakeWebSocket.reset();
  resetFigureManifestCache();
  fetchMock = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "figures-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  (global as unknown as { fetch?: unknown }).fetch = originalFetch;
});

describe("figure manifest request (#877)", () => {
  it("is never made while the flat board is up", async () => {
    await mountGame();
    expect(manifestRequests()).toHaveLength(0);
  });

  it("is made once the tabletop is the board", async () => {
    window.localStorage.setItem(BOARD_VIEW_KEY, "table");
    await mountGame();
    expect(manifestRequests()).toHaveLength(1);
  });
});
