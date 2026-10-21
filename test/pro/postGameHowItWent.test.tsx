/**
 * "How it went" through the REAL Pro game page (p2p #1398).
 *
 * Two routes to the same numbers: the page folds every STATE's events as the
 * game is played (instant first paint), then — once the bundle lands at game
 * end — POSTs it to `/replay` once and silently swaps in the expansion's
 * numbers. A failed fetch keeps the live numbers; a reload (no events, no
 * bundle) renders no card at all. The clock is stamped at the first STATE and
 * survives a reload through sessionStorage. Harness as postGameEndReason.
 */
import "@testing-library/jest-dom";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { PlayerView, ReplayBundle, ReplayExpansion, ReplayStep, ViewFighter } from "@/lib/pro/protocol";
import { setRoomBots } from "@/lib/pro/recentRooms";
import { resetEngineVersions } from "@/lib/pro/wireVersion";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"), "utf8")
    .trim()
    .split("\n")[0],
).view;
// The sample's two heroes: p1/hero at 9 hp, p2/hero at 7 hp, turn 1.
const HERO = (owner: "p1" | "p2") => BASE_VIEW.fighters.find((f) => f.kind === "HERO" && f.owner === owner)!;

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

const json = (status: number, body: unknown) => ({ ok: status < 300, status, headers: new Headers(), json: async () => body }) as Response;

/** `/replay` answers `replay()`; everything else (the account probe) 404s. */
const api = (replay: () => Promise<Response>) => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/replay")) return replay();
    return json(404, {});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};
const replayCalls = (fetchMock: jest.Mock) => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.endsWith("/replay"));

const realFetch = global.fetch;

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
  global.fetch = realFetch;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

/** Seat p1 in room R1 against a bot. */
const seat = async () => {
  setRoomBots("R1", { p2: "expert" });
  window.sessionStorage.setItem("unbrewed-pro-token-R1", "tok-p1");
  await mount({ room: "R1" });
  await deliver({ type: "HEROES", heroes: [] });
  await deliver({ type: "ROOM_JOINED", roomId: "R1", token: "tok-p1", you: "p1" });
};

const withHp = (view: PlayerView, hp: Partial<Record<"p1" | "p2", number>>): PlayerView => ({
  ...view,
  fighters: view.fighters.map((f) => {
    const next = f.kind === "HERO" ? hp[f.owner as "p1" | "p2"] : undefined;
    return next === undefined ? f : { ...f, hp: next, defeated: next <= 0 };
  }),
});

const playing = (turnNumber: number, hp: Partial<Record<"p1" | "p2", number>>): PlayerView =>
  withHp({ ...BASE_VIEW, you: "p1", phase: "PLAY", winner: null, prompt: null, turnNumber }, hp);

const finished = (turnNumber: number, hp: Partial<Record<"p1" | "p2", number>>): PlayerView =>
  withHp({ ...BASE_VIEW, you: "p1", phase: "GAME_OVER", winner: "p1", prompt: null, turnNumber }, hp);

const ENDED_AT = 1_760_000_000_000;

const bundle = (): ReplayBundle =>
  ({
    v: 1,
    engine: { schemaVersion: 1, dslVersion: "0" },
    config: {
      seed: 7,
      formatId: "duel",
      players: {
        p1: { heroId: HERO("p1").name, hero: {}, cards: [] },
        p2: { heroId: HERO("p2").name, hero: {}, cards: [] },
      },
      map: BASE_VIEW.map,
    },
    actionLog: [{ type: "MANEUVER", player: "p1" }],
    meta: { winner: "p1", heroes: {}, turns: 3, endedAt: ENDED_AT, mapTitle: "x" },
  }) as unknown as ReplayBundle;

/** The expansion the server would return: p2 moved first; p1 took 3 on turn 1, dealt 2 on turn 2 and 5 on turn 3 (the 7-hp sample hero falls). */
const expansion = (): ReplayExpansion => {
  const step = (index: number, turnNumber: number, activePlayer: "p1" | "p2", hp: Partial<Record<"p1" | "p2", number>>): ReplayStep =>
    ({ index, phase: "PLAY", turnNumber, activePlayer, fighters: withHp(BASE_VIEW, hp).fighters as ViewFighter[], winner: null }) as unknown as ReplayStep;
  return {
    ok: true,
    steps: [step(0, 0, "p2", {}), step(1, 1, "p2", { p1: 6 }), step(2, 2, "p1", { p1: 6, p2: 5 }), step(3, 3, "p1", { p1: 6, p2: 0 })],
    finalHash: "h",
  } as unknown as ReplayExpansion;
};

const card = () => screen.getAllByTestId("how-it-went")[0];
const stat = (name: string) =>
  within(card())
    .getAllByTestId("how-it-went-stat")
    .find((el) => el.getAttribute("data-stat") === name)!;

/** Live play: turn 1 the bot hits p1 for 3; turn 2 p1 hits back for 4; then p1 wins on turn 3 with no further damage. */
const playOut = async () => {
  await deliver({ type: "STATE", view: playing(1, {}), legalActions: [], events: [] });
  await deliver({
    type: "STATE",
    view: playing(1, { p1: 6 }),
    legalActions: [],
    events: [
      { type: "TURN_STARTED", player: "p2", turnNumber: 1 },
      { type: "DAMAGE_APPLIED", fighter: HERO("p1").id, amount: 3, source: "ATTACK" },
    ],
  });
  await deliver({
    type: "STATE",
    view: playing(2, { p1: 6, p2: 3 }),
    legalActions: [],
    events: [
      { type: "TURN_STARTED", player: "p1", turnNumber: 2 },
      { type: "DAMAGE_APPLIED", fighter: HERO("p2").id, amount: 4, source: "ATTACK" },
    ],
  });
  await deliver({
    type: "STATE",
    view: finished(3, { p1: 6, p2: 3 }),
    legalActions: [],
    events: [{ type: "TURN_STARTED", player: "p2", turnNumber: 3 }, { type: "GAME_ENDED", winner: "p1", reason: "FORFEIT" }],
  });
};

it("paints the live numbers at game end, then swaps in the expansion's once the bundle has been replayed — one fetch", async () => {
  const fetchMock = api(() => Promise.resolve(json(200, expansion())));
  // The clock start this tab stamped at its first STATE: 2:05 before the bundle's endedAt.
  window.sessionStorage.setItem("pro:clock-start:R1", String(ENDED_AT - 125_000));
  await seat();
  await playOut();

  expect(stat("dealt")).toHaveTextContent("4damage dealt");
  expect(stat("taken")).toHaveTextContent("3damage taken");
  expect(stat("biggest-hit")).toHaveTextContent("4biggest hit · t2");
  expect(stat("first-blood")).toHaveTextContent("t1first blood · bot");
  expect(within(card()).getAllByTestId("how-it-went-bar")).toHaveLength(3);
  // First player came from the first TURN_STARTED the page saw.
  expect(screen.getByTestId("post-game-first-player")).toHaveTextContent("Bot moved first");
  expect(replayCalls(fetchMock)).toHaveLength(0);

  await deliver({ type: "REPLAY_BUNDLE", bundle: bundle() });
  await act(async () => {
    await Promise.resolve();
  });
  expect(replayCalls(fetchMock)).toHaveLength(1);
  expect(stat("dealt")).toHaveTextContent("7damage dealt");
  expect(stat("taken")).toHaveTextContent("3damage taken");
  expect(stat("biggest-hit")).toHaveTextContent("5biggest hit · t3");
  expect(stat("first-blood")).toHaveTextContent("t1first blood · bot");
  expect(screen.getByTestId("post-game-first-player")).toHaveTextContent("Bot moved first");
  // The clock reads from the stored stamp to the bundle's endedAt.
  expect(screen.getByTestId("post-game-clock")).toHaveTextContent("02:05");

  // A later event-less STATE (resync) changes nothing and triggers no second fetch.
  await deliver({ type: "STATE", view: finished(3, { p1: 6, p2: 3 }), legalActions: [] });
  expect(stat("dealt")).toHaveTextContent("7damage dealt");
  expect(replayCalls(fetchMock)).toHaveLength(1);
});

it("a failed replay fetch keeps the live numbers", async () => {
  const fetchMock = api(() => Promise.reject(new Error("ECONNREFUSED")));
  await seat();
  await playOut();
  await deliver({ type: "REPLAY_BUNDLE", bundle: bundle() });
  await act(async () => {
    await Promise.resolve();
  });
  expect(replayCalls(fetchMock)).toHaveLength(1);
  expect(stat("dealt")).toHaveTextContent("4damage dealt");
  expect(stat("taken")).toHaveTextContent("3damage taken");
  // The clock is still shown: stamped at the first STATE, read to the bundle's endedAt.
  expect(screen.getByTestId("post-game-clock")).toBeInTheDocument();
});

it("stamps the clock at the first STATE and keeps it for a reload of the same room", async () => {
  api(() => Promise.resolve(json(404, {})));
  await seat();
  expect(window.sessionStorage.getItem("pro:clock-start:R1")).toBeNull();
  await deliver({ type: "STATE", view: playing(1, {}), legalActions: [], events: [] });
  const stamp = Number(window.sessionStorage.getItem("pro:clock-start:R1"));
  expect(stamp).toBeGreaterThan(0);
  await deliver({ type: "STATE", view: playing(2, {}), legalActions: [], events: [{ type: "TURN_STARTED", player: "p1", turnNumber: 2 }] });
  expect(Number(window.sessionStorage.getItem("pro:clock-start:R1"))).toBe(stamp);
});

it("a reload into a finished room with no bundle renders no card, and no first player it cannot know", async () => {
  api(() => Promise.resolve(json(404, {})));
  await seat();
  // The reconnect STATE carries no events; no REPLAY_BUNDLE follows a reload.
  await deliver({ type: "STATE", view: finished(9, { p2: 0 }), legalActions: [] });
  expect(screen.getAllByTestId("post-game-result")[0]).toHaveTextContent("VICTORY");
  expect(screen.queryAllByTestId("how-it-went")).toHaveLength(0);
  expect(screen.queryAllByTestId("post-game-first-player")).toHaveLength(0);
});
