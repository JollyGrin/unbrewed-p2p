/**
 * The end reason through the REAL Pro game page (p2p #1397).
 *
 * `GAME_ENDED` rides in the final STATE's `events` and nowhere else: it is not
 * on the view, and a reconnect STATE carries no events at all. The page has
 * to capture it the moment it arrives and keep it for the post-game panel —
 * and when it never arrived (a reload into a finished room), the panel must
 * say less rather than guess. Harness as rematchOffer.
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

type Query = Record<string, string>;

const fakeRouter = (query: Query) =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query,
    asPath: `/pro/game?${new URLSearchParams(query).toString()}`,
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

const mount = async (query: Query) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter(query)}>
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
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send() {} as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
});

afterEach(() => {
  cleanup();
  resetEngineVersions();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

/** Seat `you` in room R1 (a vs-bot room, so the room's bot seats are known). */
const seat = async (you: "p1" | "p2") => {
  setRoomBots("R1", { p2: "expert" });
  window.sessionStorage.setItem("unbrewed-pro-token-R1", `tok-${you}`);
  await mount({ room: "R1" });
  await deliver({ type: "HEROES", heroes: [] });
  await deliver({ type: "ROOM_JOINED", roomId: "R1", token: `tok-${you}`, you });
};

const playing = (you: "p1" | "p2"): PlayerView => ({ ...BASE_VIEW, you, phase: "PLAY", winner: null, prompt: null });

const finished = (you: "p1" | "p2", winner: "p1" | "p2" | null): PlayerView => ({
  ...BASE_VIEW,
  you,
  phase: "GAME_OVER",
  winner,
  prompt: null,
  fighters: BASE_VIEW.fighters.map((f) =>
    f.kind === "HERO" && winner && f.owner !== winner ? { ...f, hp: 0, defeated: true } : f,
  ),
});

const reasonLine = () => screen.queryAllByTestId("game-end-reason").map((n) => n.textContent ?? "");
const resultTitle = () => screen.getAllByTestId("post-game-result").map((n) => n.textContent ?? "");

it("captures GAME_ENDED from the final STATE and shows the knockout line", async () => {
  await seat("p1");
  await deliver({ type: "STATE", view: playing("p1"), legalActions: [], events: [] });
  expect(screen.queryAllByTestId("pro-post-game")).toHaveLength(0);

  await deliver({
    type: "STATE",
    view: finished("p1", "p1"),
    legalActions: [],
    events: [{ type: "GAME_ENDED", winner: "p1", reason: "HERO_DEFEATED" }],
  });
  expect(resultTitle()).toEqual(["VICTORY"]);
  const loser = BASE_VIEW.fighters.find((f) => f.kind === "HERO" && f.owner === "p2")!.name;
  expect(reasonLine()).toEqual([`Won by knockout · ${loser} fell on turn ${BASE_VIEW.turnNumber}`]);
  // The Expert bot's tier label + tag come from the room's recorded bot seats.
  expect(screen.getByText("Expert bot")).toBeInTheDocument();
  expect(screen.getByTestId("post-game-bot-tag")).toHaveTextContent("alpha");
});

it("keeps the reason through later event-less STATEs, and a forfeit names the hero", async () => {
  await seat("p1");
  await deliver({
    type: "STATE",
    view: finished("p1", "p2"),
    legalActions: [],
    events: [{ type: "GAME_ENDED", winner: "p2", reason: "FORFEIT" }],
  });
  const mine = BASE_VIEW.fighters.find((f) => f.kind === "HERO" && f.owner === "p1")!.name;
  expect(resultTitle()).toEqual(["DEFEAT"]);
  expect(reasonLine()).toEqual([`${mine} forfeited`]);

  // A resync STATE (no events) must not wipe what was captured.
  await deliver({ type: "STATE", view: finished("p1", "p2"), legalActions: [] });
  expect(reasonLine()).toEqual([`${mine} forfeited`]);
});

it("a reload into a finished room shows the result + matchup and omits the line it cannot know", async () => {
  await seat("p1");
  // The reconnect STATE carries no events; the server never re-sends GAME_ENDED.
  await deliver({ type: "STATE", view: finished("p1", "p1"), legalActions: [] });
  expect(resultTitle()).toEqual(["VICTORY"]);
  expect(reasonLine()).toEqual([]);
  expect(screen.getAllByTestId("post-game-seat")).toHaveLength(2);
  // No bundle after a reload → no rematch / replay / share, and nothing broken.
  expect(screen.queryAllByRole("link", { name: /rematch/i, hidden: true })).toHaveLength(0);
  expect(screen.queryAllByRole("link", { name: /view your replay/i, hidden: true })).toHaveLength(0);
  expect(screen.getAllByRole("link", { name: /back to lobby/i, hidden: true }).length).toBeGreaterThan(0);
});

it("a GAME_OVER with no winner renders NO WINNER (the old dock rendered nothing)", async () => {
  await seat("p1");
  await deliver({
    type: "STATE",
    view: finished("p1", null),
    legalActions: [],
    events: [{ type: "GAME_ENDED", winner: "p1", reason: "SIMULTANEOUS" }],
  });
  expect(resultTitle()).toEqual(["NO WINNER"]);
  expect(reasonLine()).toEqual(["Both heroes fell"]);
});
