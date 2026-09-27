/**
 * Two every-player regressions from the tabletop epic (#893), through the REAL
 * /pro/game page (the render-fuzz recipe: fake WebSocket, seeded reconnect
 * token, one STATE frame over a recorded view).
 *
 * 1. The page-zoom guard (touch-action rule + cancelled Safari `gesture*`
 *    events) is up only while a match board is on screen — the lobby and hero
 *    picker keep the browser's pinch-zoom.
 * 2. The tabletop's code is not part of the page: its module is evaluated only
 *    once the tabletop is wanted, and the flat board is none the wiser.
 *
 * Test order matters for (2): jest evaluates a module once per file, so the
 * flat-board tests that assert "never loaded" run before the tabletop one.
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
import { BOARD_VIEW_KEY } from "@/lib/pro/useBoardView";
import { ZOOM_GUARD_STYLE_ID } from "@/lib/pro/usePageZoomGuard";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

// Marks the moment anything evaluates the tabletop board module. A global, not
// a local: jest.mock is hoisted above every declaration in this file, and a
// static import of the module would run the factory before a `const` exists.
const TABLE_EVALUATED = "__proTableBoardEvaluated";
jest.mock("../../components/Pro/Table/TableBoard", () => {
  (globalThis as Record<string, unknown>)["__proTableBoardEvaluated"] = true;
  return jest.requireActual("../../components/Pro/Table/TableBoard");
});
const tableModuleEvaluated = () => (globalThis as Record<string, unknown>)[TABLE_EVALUATED] === true;

const ROOM = "ZOOM";

const VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

const fakeRouter = (query: Record<string, string>) =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query,
    asPath: query.room ? `/pro/game?room=${query.room}` : "/pro/game",
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

/** Mount the page and open its socket; returns the socket. */
const mount = async (query: Record<string, string>) => {
  const { container } = render(
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
  return { ws, container };
};

/** Mount straight into a match (reconnect token seeded) with one STATE. */
const mountMatch = async () => {
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "zoom-test-token");
  const { ws, container } = await mount({ room: ROOM });
  await act(async () => {
    ws.onmessage?.({
      data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view: VIEW, legalActions: [], events: [] }),
    });
  });
  // let the tabletop chunk (when wanted) resolve
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return container;
};

/** A Safari page-zoom pinch; true when something cancelled it. */
const pinch = () => {
  const event = new Event("gesturestart", { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event.defaultPrevented;
};

const guardUp = () => !!document.getElementById(ZOOM_GUARD_STYLE_ID);

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
});

beforeEach(() => {
  FakeWebSocket.reset();
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("page-zoom guard only in-match (#893)", () => {
  it("leaves the lobby's hero picker zoomable", async () => {
    const { ws } = await mount({});
    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "HEROES",
          heroes: [{ heroId: "hero-a", name: "Ellen Ripley", hp: 12, move: 3, reach: "MELEE" }],
        }),
      });
    });

    expect(guardUp()).toBe(false);
    expect(pinch()).toBe(false);
  });

  it("guards the page once the match board is up", async () => {
    await mountMatch();

    expect(guardUp()).toBe(true);
    expect(pinch()).toBe(true);
  });
});

describe("tabletop code loads on demand (#893)", () => {
  it("is never evaluated for a flat-board game", async () => {
    const container = await mountMatch();

    expect(container.querySelector("[data-table-stage-plane]")).toBeNull();
    expect(tableModuleEvaluated()).toBe(false);
  });

  it("loads and draws the tabletop once a device wants it", async () => {
    window.localStorage.setItem(BOARD_VIEW_KEY, "table");
    const container = await mountMatch();

    expect(tableModuleEvaluated()).toBe(true);
    expect(container.querySelector("[data-table-stage-plane]")).toBeTruthy();
  });
});
