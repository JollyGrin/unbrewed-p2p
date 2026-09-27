/**
 * The tabletop's LARGE-fighter tail, end to end through the REAL Pro game page
 * (#873). The tail's face lies over its own space, so when a CHOOSE_SPACE
 * offers that space, a tap on the tail is the only way to reach it: it must
 * answer the prompt with the tail's space, the same fallback the head (and
 * ProBoard) already had. Mounted through the render-fuzz recipe — a fake
 * socket, a seeded reconnect token, one STATE frame — with the board view set
 * to the tabletop, so what's asserted is the ACTION that actually goes out.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { PlayerView, SpaceId, ViewPrompt } from "@/lib/pro/protocol";
import { BOARD_VIEW_KEY } from "@/lib/pro/useBoardView";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "TAIL";

/** A real recorded seat view (map, catalog, hands, plates) to hang the body on. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

// The body lies on (w1, w4): head w1, tail w4 (w1 — w4 are adjacent).
const HEAD: SpaceId = "w1";
const TAIL: SpaceId = "w4";

/** "Choose a space" — a place-style prompt that offers the tail's own space. */
const chooseSpace: ViewPrompt = {
  promptId: "prompt-space-1",
  player: "p1",
  kind: "CHOOSE_SPACE",
  description: "Choose a space",
  source: { card: "hero-a/strike#1" },
  options: [TAIL, "w2", "w3"].map((space) => ({ id: space, label: space })),
};

const view = (): PlayerView => ({
  ...BASE_VIEW,
  turnPhase: "ACTION_SELECT",
  fighters: BASE_VIEW.fighters.map((f) =>
    f.id === "p1/hero" ? { ...f, size: "LARGE" as const, space: HEAD, tailSpace: TAIL } : f,
  ),
  prompt: chooseSpace,
});

const sentActions = (): Record<string, unknown>[] =>
  SENT.map((raw) => JSON.parse(raw))
    .filter((m) => m.type === "ACTION")
    .map((m) => m.action as Record<string, unknown>);

let SENT: string[] = [];

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

/** Mount the page on the tabletop view and deliver one STATE frame. */
const mountWithView = async (v: PlayerView): Promise<HTMLElement> => {
  window.localStorage.setItem(BOARD_VIEW_KEY, "table");
  const { container } = render(
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
      data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view: v, legalActions: [], events: [] }),
    });
  });
  SENT = [];
  return container;
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  // Record what the page sends; the harness's own fake throws it away.
  FakeWebSocket.prototype.send = function send(data: string) {
    SENT.push(data);
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  SENT = [];
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "tail-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("tabletop LARGE tail (#873)", () => {
  it("tapping the tail answers a CHOOSE_SPACE that offers the tail's space", async () => {
    const container = await mountWithView(view());
    expect(container.querySelector("[data-table-stage-plane]")).toBeTruthy();
    const tail = container.querySelector("[data-tail-body]");
    expect(tail).toBeTruthy();
    fireEvent.click(tail!);
    expect(sentActions()).toEqual([
      { type: "RESPOND_PROMPT", player: "p1", promptId: "prompt-space-1", optionId: TAIL },
    ]);
  });
});
