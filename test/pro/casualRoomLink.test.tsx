/**
 * An ordinary friend invite (`/pro/game?room=X`, no seat token here) through the
 * REAL Pro game page: it pays for the tournament check at most the room
 * lookup's fail-open window, asks one question (`GET /me/tournament-room/X`)
 * only for a signed-in player, and shows no tournament UI anywhere — picker,
 * waiting room, table, end screen. The frames it sends carry no ticket.
 *
 * Mount recipe: the shared render-fuzz one (fake WebSocket + fake router).
 */
import "@testing-library/jest-dom";
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { PlayerView, ReplayBundle } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { tournamentRoomOf } from "@/lib/pro/tournamentTicket";
import { TOURNAMENT_ROOM_LOOKUP_MS } from "@/lib/pro/useTournamentRoom";
import { __resetNextMatchForTests } from "@/lib/tournaments/useNextMatch";

const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"), "utf8")
    .trim()
    .split("\n")[0],
).view;

const HEROES = [
  { heroId: "kenshiro", name: "Kenshiro", hp: 16, move: 2, reach: "MELEE" },
  { heroId: "boba-fett", name: "Boba Fett", hp: 15, move: 2, reach: "RANGED" },
];

let SENT: Record<string, unknown>[] = [];
const sentOfType = (type: string) => SENT.filter((m) => m.type === type);

const fakeRouter = (query: Record<string, string>, isReady = true) =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query,
    asPath: `/pro/game?${new URLSearchParams(query).toString()}`,
    basePath: "",
    isReady,
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

const mount = (query: Record<string, string>) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter(query)}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>,
  );

const openSocket = async () => {
  const socket = FakeWebSocket.latest();
  if (!socket) throw new Error("the page never opened a socket");
  await act(async () => {
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.({});
  });
};

const deliver = async (msg: Record<string, unknown>) => {
  const socket = FakeWebSocket.latest();
  if (!socket) throw new Error("the page never opened a socket");
  await act(async () => {
    socket.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
  });
};

const flush = async (n = 8) => {
  for (let i = 0; i < n; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const json = (status: number, body: unknown) => ({ ok: status < 300, status, headers: new Headers(), json: async () => body }) as Response;

/** `/me` answers `me`; `/me/tournament-room/:id` answers `lookup()`; everything else 404s. */
const api = (me: "signed-in" | "guest", lookup: () => Response | Promise<never>) => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/me")) return me === "signed-in" ? json(200, { user: { id: "u9", username: "casual_friend" } }) : json(401, {});
    if (/\/me\/tournament-room\//.test(url)) return lookup();
    return json(404, {});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  __resetAccountStoreForTests();
  __resetNextMatchForTests();
  return fetchMock;
};
const urlsOf = (fetchMock: jest.Mock) => fetchMock.mock.calls.map(([u]) => String(u));
/** Every request a tournament surface would make: the lookup aside, none may happen. */
const tournamentCalls = (fetchMock: jest.Mock) =>
  urlsOf(fetchMock).filter((u) => /\/tournaments|\/tournament-room\//.test(u) && !/\/me\/tournament-room\/FRIEND$/.test(u));

/** No tournament surface anywhere on the page right now. */
const expectNoTournamentUi = () => {
  for (const id of ["room-lookup", "ticket-loading", "ticket-error", "seat-replaced", "tournament-waiting", "tournament-hold", "opponent-away-note", "game-end-note", "back-to-match", "lost-back-to-match"])
    expect(screen.queryAllByTestId(id)).toHaveLength(0);
  expect(screen.queryByText(/TOURNAMENT ·/)).not.toBeInTheDocument();
  expect(screen.queryByText(/YOUR MATCH ROOM/)).not.toBeInTheDocument();
};

const realFetch = global.fetch;

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(data: string) {
    SENT.push(JSON.parse(data));
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  SENT = [];
});

afterEach(() => {
  cleanup();
  global.fetch = realFetch;
  window.sessionStorage.clear();
  window.localStorage.clear();
  __resetAccountStoreForTests();
  __resetNextMatchForTests();
});

/** Mount the invite and wait (real time) until the casual picker can show; returns how long that took. */
const openInvite = async () => {
  const started = Date.now();
  mount({ room: "FRIEND", hero: "kenshiro" });
  while (!FakeWebSocket.latest() && Date.now() - started < 5000)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  const waited = Date.now() - started;
  await openSocket();
  await deliver({ type: "HEROES", heroes: HEROES });
  return waited;
};

describe("a casual ?room= invite, signed in, no seat token", () => {
  it("the api says no: one lookup call, the picker at once, no tournament UI, and a ticketless JOIN_ROOM", async () => {
    const fetchMock = api("signed-in", () => json(200, { found: false }));
    const waited = await openInvite();
    expect(waited).toBeLessThan(TOURNAMENT_ROOM_LOOKUP_MS);
    expect(screen.getByText("JOIN ROOM FRIEND")).toBeInTheDocument();
    expectNoTournamentUi();
    expect(urlsOf(fetchMock).filter((u) => u.endsWith("/me/tournament-room/FRIEND"))).toHaveLength(1);
    expect(tournamentCalls(fetchMock)).toEqual([]);
    expect(tournamentRoomOf("FRIEND")).toBeNull();

    await click(screen.getByRole("button", { name: "Join" }));
    const [joinFrame] = sentOfType("JOIN_ROOM");
    expect(joinFrame).toMatchObject({ v: PROTOCOL_VERSION, type: "JOIN_ROOM", roomId: "FRIEND", heroId: "kenshiro" });
    expect(joinFrame).not.toHaveProperty("ticket");
  });

  it("an api that never answers costs the fail-open window at most, then the casual picker", async () => {
    api("signed-in", () => new Promise<never>(() => {}));
    const waited = await openInvite();
    expect(waited).toBeGreaterThanOrEqual(TOURNAMENT_ROOM_LOOKUP_MS - 50);
    expect(waited).toBeLessThan(TOURNAMENT_ROOM_LOOKUP_MS + 1000);
    expect(screen.getByText("JOIN ROOM FRIEND")).toBeInTheDocument();
    expectNoTournamentUi();
  }, 10_000);

  it("an api error opens the picker at once", async () => {
    api("signed-in", () => json(500, { error: "internal" }));
    const waited = await openInvite();
    expect(waited).toBeLessThan(TOURNAMENT_ROOM_LOOKUP_MS);
    expect(screen.getByText("JOIN ROOM FRIEND")).toBeInTheDocument();
    expectNoTournamentUi();
  });

  it("the room itself stays casual: invite link and code in the waiting room, the table and the end screen keep Rematch", async () => {
    const fetchMock = api("signed-in", () => json(200, { found: false }));
    await openInvite();
    await click(screen.getByRole("button", { name: "Join" }));
    await deliver({ type: "ROOM_JOINED", roomId: "FRIEND", token: "tok", you: "p2", seats: ["p1", "p2"], requiredPlayers: 3, formatId: "duel" });
    await flush();
    expect(screen.getByText("ROOM FRIEND")).toBeInTheDocument();
    expect(screen.getByText("copy link")).toBeInTheDocument();
    expectNoTournamentUi();

    // the opponent drops mid-game: the casual table never shows a forfeit clock
    await deliver({ type: "STATE", view: { ...BASE_VIEW, you: "p1", prompt: null }, legalActions: [], events: [] });
    await deliver({ type: "OPPONENT_STATUS", connected: false, player: "p2", autoForfeitAt: Date.now() + 60_000 });
    await flush();
    expectNoTournamentUi();

    const bundle = {
      v: 1,
      engine: { schemaVersion: 1, dslVersion: "0" },
      config: { seed: 7, formatId: "duel", options: { mulligan: true }, players: { p1: { heroId: "kenshiro", hero: {}, cards: [] }, p2: { heroId: "boba-fett", hero: {}, cards: [] } }, map: BASE_VIEW.map },
      actionLog: [],
      meta: { winner: "p1", heroes: { p1: "kenshiro", p2: "boba-fett" }, turns: 3, endedAt: 0, mapTitle: "x" },
    } as unknown as ReplayBundle;
    await deliver({ type: "STATE", view: { ...BASE_VIEW, you: "p1", phase: "GAME_OVER", winner: "p1", prompt: null }, legalActions: [], events: [] });
    await deliver({ type: "REPLAY_BUNDLE", bundle });
    await flush();
    expect(screen.queryAllByRole("link", { name: /rematch/i, hidden: true }).length).toBeGreaterThan(0);
    expectNoTournamentUi();
    // a casual game over never asks the tournaments api why it ended
    expect(tournamentCalls(fetchMock)).toEqual([]);
  });

  it("a guest never asks: no lookup call and no hold", async () => {
    const fetchMock = api("guest", () => json(200, { found: false }));
    await openInvite();
    await flush();
    expect(screen.getByText("JOIN ROOM FRIEND")).toBeInTheDocument();
    expect(urlsOf(fetchMock).some((u) => /tournament-room/.test(u))).toBe(false);
    expectNoTournamentUi();
  });
});

/**
 * The static export's order: the first render has no query and the router is
 * not ready; then it becomes ready with `?room=FRIEND`. The game page must open
 * ONE socket and mount once, whatever the room check shows in between.
 */
describe("the static export's first render (router not ready, no query yet)", () => {
  const tree = (query: Record<string, string>, isReady: boolean) => (
    <QueryClientProvider client={client}>
      <RouterContext.Provider value={fakeRouter(query, isReady)}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>
  );
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  /** First render not ready, then ready with the invite; waits for the room check to settle. */
  const hydrateThenReady = async () => {
    const view = render(tree({}, false));
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1); // the game mounted on the first render
    const first = FakeWebSocket.latest()!;
    await openSocket();
    await deliver({ type: "HEROES", heroes: HEROES });
    view.rerender(tree({ room: "FRIEND", hero: "kenshiro" }, true));
    return { view, first };
  };
  const settle = async () => {
    for (let i = 0; i < 40 && screen.queryByTestId("room-lookup"); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
    await flush();
  };

  it("signed in, no token, the api says no: one socket, the game never remounts, the picker joins on it", async () => {
    api("signed-in", () => json(200, { found: false }));
    const { first } = await hydrateThenReady();
    await settle();
    expect(screen.queryByTestId("room-lookup")).not.toBeInTheDocument();
    expect(screen.getByText("JOIN ROOM FRIEND")).toBeInTheDocument();
    expect(FakeWebSocket.instances).toEqual([first]);
    expect(first.readyState).toBe(FakeWebSocket.OPEN); // never closed by an unmount
    await click(screen.getByRole("button", { name: "Join" }));
    expect(sentOfType("JOIN_ROOM")).toEqual([expect.objectContaining({ roomId: "FRIEND", heroId: "kenshiro" })]);
    expectNoTournamentUi();
  });

  it("a guest whose account probe answers only after the router is ready: one socket, the game never remounts", async () => {
    let answerMe!: () => void;
    const me = new Promise<void>((r) => (answerMe = r));
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/me")) {
        await me;
        return json(401, {});
      }
      return json(404, {});
    }) as unknown as typeof fetch;
    __resetAccountStoreForTests();
    const { first } = await hydrateThenReady();
    await flush();
    expect(screen.getByTestId("room-lookup")).toBeInTheDocument(); // still asking who this is
    answerMe();
    await settle();
    expect(screen.getByText("JOIN ROOM FRIEND")).toBeInTheDocument();
    expect(FakeWebSocket.instances).toEqual([first]);
    expect(first.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("this tab holds the seat: one socket, and the RECONNECT goes out on it", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-FRIEND", "tok");
    api("signed-in", () => json(200, { found: false }));
    const { first } = await hydrateThenReady();
    await settle();
    expect(FakeWebSocket.instances).toEqual([first]);
    expect(first.readyState).toBe(FakeWebSocket.OPEN);
    expect(sentOfType("RECONNECT")).toEqual([expect.objectContaining({ roomId: "FRIEND", token: "tok" })]);
  });
});
