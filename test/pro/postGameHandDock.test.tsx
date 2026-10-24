/**
 * The desktop hand dock (zIndex 160) must not draw over the post-game panel
 * (zIndex 155) once the match is over (p2p #1445). Harness as postGameHowItWent.
 * Also the page-level home of the Keen Hearing panel per format (p2p #1462, below).
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
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";
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

const seat = async (formatId?: string) => {
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
  await deliver({ type: "ROOM_JOINED", roomId: "R1", token: "tok-p1", you: "p1", ...(formatId ? { formatId, seats: ["p1", "p2"], requiredPlayers: 2 } : {}) });
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

// p2p #1456/#1462: the Keen Hearing revealed-hand panel floats top-left under the HUD, except
// in a format that owns it (`formatOwnsRevealedHand`: Adventure), whose overlay shows it inline
// in its board-side band and where the page must render NO fixed panel. The overlay-level test
// (test/pro/adventureBoard.test.tsx) passes with or without the page's half; this pins the page.
describe("Keen Hearing panel ownership per format (p2p #1462)", () => {
  const MID: PlayerView = { ...BASE_VIEW, you: "p1", phase: "PLAY", winner: null, prompt: null, turnNumber: 3 };
  const REVEAL: GameEvent[] = [
    { type: "SCHEME_PLAYED", player: "p1", card: "superman/keen-hearing#1" },
    { type: "CARD_REVEALED", player: "p2", card: "hero-b/strike#1" },
    { type: "CARD_REVEALED", player: "p2", card: "hero-b/guard#1" },
  ];
  const ADVENTURE_MID = {
    ...MID,
    fighters: [
      ...MID.fighters,
      {
        id: "e1/rex", owner: "e1", kind: "HERO", name: "Rex", space: MID.fighters[1].space, tailSpace: null,
        hp: 7, maxHp: 20, reach: "MELEE", size: "LARGE", defeated: false,
        enemy: { role: "VILLAIN", enemyId: "indominus-rex", move: 2, deckCount: 5, discardTop: null },
      },
    ],
    initiative: {
      round: 2, phase: "TURN", deckCount: 2, current: "c1",
      row: [
        { id: "c1", title: "Alpha", entry: "SEAT", seat: "p1" },
        { id: "c2", title: "Rex", entry: "FIGHTER", fighter: "e1/rex" },
      ],
    },
    scenario: {
      id: "isla-nublar", label: "Isla Nublar",
      threat: { position: 1, level: 1, overflows: 0, positions: [0, 1, 1, 2, 2, 3, 3, 4, 5] },
      objectives: [],
    },
  } as unknown as PlayerView;

  it("a duel keeps the page's fixed panel", async () => {
    await seat();
    await deliver({ type: "STATE", view: MID, legalActions: [], events: [] });
    expect(screen.queryByTestId("revealed-hand-panel")).toBeNull();
    await deliver({ type: "STATE", view: MID, legalActions: [], events: REVEAL });
    const panels = screen.getAllByTestId("revealed-hand-panel");
    expect(panels).toHaveLength(1);
    expect(panels[0]).not.toHaveAttribute("data-inline");
    expect(getComputedStyle(panels[0]).position).toBe("fixed");
    expect(screen.queryByTestId("adventure-band")).toBeNull();
    expect(screen.getByText("Revealed: Beta's hand")).toBeInTheDocument();
  });

  it("an adventure renders the panel inline in its band and no fixed panel", async () => {
    await seat("adventure");
    await deliver({ type: "STATE", view: ADVENTURE_MID, legalActions: [], events: [] });
    const band = await screen.findByTestId("adventure-band");
    expect(screen.queryByTestId("revealed-hand-panel")).toBeNull();
    await deliver({ type: "STATE", view: ADVENTURE_MID, legalActions: [], events: REVEAL });
    const panels = await screen.findAllByTestId("revealed-hand-panel");
    // exactly one: the band's inline one — a page that also kept its fixed panel would show two
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveAttribute("data-inline", "true");
    expect(band).toContainElement(panels[0]);
    expect(getComputedStyle(panels[0]).position).toBe("relative");
    expect(screen.getByText("Revealed: Beta's hand")).toBeInTheDocument();
  });
});
