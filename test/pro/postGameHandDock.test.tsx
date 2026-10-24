/**
 * The desktop hand dock (zIndex 160) must not draw over the post-game panel
 * (zIndex 155) once the match is over (p2p #1445). Harness as postGameHowItWent.
 */
import "@testing-library/jest-dom";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { PlayerView } from "@/lib/pro/protocol";
import { setRoomBots } from "@/lib/pro/recentRooms";
import { resetEngineVersions } from "@/lib/pro/wireVersion";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"), "utf8")
    .trim()
    .split("\n")[0],
).view;

const query = { room: "R1" };
const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query,
    asPath: "/pro/game?room=R1",
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

const deliver = async (msg: Record<string, unknown>) => {
  const socket = FakeWebSocket.latest();
  if (!socket) throw new Error("the page never opened a socket");
  await act(async () => {
    socket.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
  });
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send() {} as unknown as FakeWebSocket["send"];
});
beforeEach(() => FakeWebSocket.reset());
afterEach(() => {
  cleanup();
  resetEngineVersions();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const seat = async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) }) as Response) as unknown as typeof fetch;
  setRoomBots("R1", { p2: "expert" });
  window.sessionStorage.setItem("unbrewed-pro-token-R1", "tok-p1");
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter()}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>,
  );
  const socket = FakeWebSocket.latest()!;
  await act(async () => {
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.({});
  });
  await deliver({ type: "HEROES", heroes: [] });
  await deliver({ type: "ROOM_JOINED", roomId: "R1", token: "tok-p1", you: "p1" });
};

it("renders the desktop hand mid-game and drops it once the game is over", async () => {
  await seat();
  expect(BASE_VIEW.self.hand.length).toBeGreaterThan(0);
  await deliver({ type: "STATE", view: { ...BASE_VIEW, you: "p1", phase: "PLAY", winner: null, prompt: null }, legalActions: [], events: [] });
  expect(screen.getByTestId("pro-hand-dock")).toBeInTheDocument();

  await deliver({ type: "STATE", view: { ...BASE_VIEW, you: "p1", phase: "GAME_OVER", winner: "p1", prompt: null }, legalActions: [], events: [] });
  expect(screen.getAllByTestId("post-game-result").length).toBeGreaterThan(0);
  expect(screen.queryByTestId("pro-hand-dock")).toBeNull();
});
