/**
 * The lobby's Create block on desktop (issue #765, rehomed by #768).
 *
 * The roster grid grows a row every ~9 heroes and the stage grid one every ~7
 * boards, which used to push the Create button and the seat plates below the
 * fold on lg+. #765 answered that with a sticky dock; #768 moved the whole
 * setup into the left rail instead, where the same block is PINNED to the
 * rail's foot by a `1fr` grid row and so never moves at all. Either way the
 * invariant this file exists for is unchanged: exactly ONE desktop block, and
 * with the mobile fixed bar's own copy that is exactly TWO Create buttons in
 * the DOM — never a third from a duplicated bar.
 *
 * Mount recipe is the render-fuzz one shared with quickMatch.test.tsx (fake
 * WebSocket, fake router); jsdom measures no layout, so this pins presence and
 * count, not geometry.
 */
import "@testing-library/jest-dom";
import { act, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { HeroListing } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const HERO = "king-kong";

const heroes: HeroListing[] = [
  {
    heroId: HERO,
    name: "King Kong",
    hp: 20,
    move: 3,
    reach: "MELEE",
    tier: "community",
    deckSection: "recommended",
  },
];

const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    // `?hero=` preselects the fighter, so the test never has to click a hero
    // tile (which opens a Chakra modal jsdom can't focus-lock).
    query: { hero: HERO },
    asPath: `/pro/game?hero=${HERO}`,
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

let SENT: string[] = [];

const deliver = async (msg: Record<string, unknown>) => {
  const socket = FakeWebSocket.latest();
  if (!socket) throw new Error("the page never opened a socket");
  await act(async () => {
    socket.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
  });
};

/** Mount the picker with the roster already delivered. */
const mountPicker = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter()}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>,
  );
  const socket = FakeWebSocket.latest();
  if (!socket) throw new Error("the page never opened a socket");
  await act(async () => {
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.({});
  });
  await deliver({ type: "HEROES", heroes });
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send() {} as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  SENT = [];
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("desktop create block (#765 → the #768 rail)", () => {
  it("renders the desktop block exactly once, carrying plates and both commit buttons", async () => {
    await mountPicker();

    // ONE element — not a rail block plus a leftover in-flow/sticky bar.
    const docks = screen.getAllByTestId("pro-create-dock");
    expect(docks).toHaveLength(1);
    const dock = docks[0];

    // Everything a player needs to start a game, without scrolling: seat
    // plates (Human/AI chips included) and Create/Quick Match.
    expect(within(dock).getByText("P1 · You")).toBeInTheDocument();
    expect(within(dock).getByText("P2 · Opponent")).toBeInTheDocument();
    expect(within(dock).getByTestId("seat-chip-human")).toBeInTheDocument();
    expect(within(dock).getByTestId("quick-match")).toBeInTheDocument();
    expect(within(dock).getByTestId("pro-create-button")).toBeInTheDocument();

    // The mobile fixed bar survives as its own element (still `lg: none`).
    const mobileBars = screen.getAllByTestId("pro-mobile-create-bar");
    expect(mobileBars).toHaveLength(1);
    expect(within(mobileBars[0]).getByTestId("pro-create-button")).toBeInTheDocument();

    // Two Create buttons in the DOM — the rail's and the mobile bar's, and not
    // one more: a duplicated desktop bar (the #765 failure mode) makes three.
    expect(screen.getAllByTestId("pro-create-button")).toHaveLength(2);
    expect(within(mobileBars[0]).queryByTestId("pro-create-dock")).toBeNull();
  });
});
