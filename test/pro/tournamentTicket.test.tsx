/**
 * Tournament tickets through the REAL Pro game page (#1218, engine #755 / v37).
 *
 *  - create vs join: `?ticket=` alone → one tagged CREATE_ROOM; with `?room=` →
 *    JOIN_ROOM into it. Either way the ticket's keys leave the URL at once.
 *  - a ticket that sets the hero skips the picker; one that doesn't shows the
 *    picker with the setup fixed and still sends the ticket.
 *  - the engine's ticket codes read as copy with a retry and a way back.
 *  - untagged /pro/game is unchanged: no `ticket` key, the old error screen.
 *
 * Mount recipe: the shared render-fuzz one (fake WebSocket + fake router), as in
 * rematchRefresh / randomHeroPick.
 */
import "@testing-library/jest-dom";
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import { RANDOM_HERO_ID } from "@/lib/pro/randomHero";
import { catalogEntry } from "@/lib/pro/mapCatalog";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { rememberTournamentRoom, tournamentRoomOf } from "@/lib/pro/tournamentTicket";
import type { PlayerView, ReplayBundle } from "@/lib/pro/protocol";

const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"), "utf8")
    .trim()
    .split("\n")[0],
).view;

type Query = Record<string, string>;

const HEROES = [
  { heroId: "kenshiro", name: "Kenshiro", hp: 16, move: 2, reach: "MELEE" },
  { heroId: "boba-fett", name: "Boba Fett", hp: 15, move: 2, reach: "RANGED" },
];

let replaceCalls: { query: Query }[] = [];
let SENT: Record<string, unknown>[] = [];

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
    replace: async (url: { query: Query }) => {
      replaceCalls.push(url);
      return true;
    },
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

const mount = async (query: Query, opts: { strict?: boolean } = {}) => {
  const page = (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter(query)}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>
  );
  render(opts.strict ? <StrictMode>{page}</StrictMode> : page);
  const socket = FakeWebSocket.latest();
  if (!socket) throw new Error("the page never opened a socket");
  await act(async () => {
    socket.readyState = FakeWebSocket.OPEN;
    socket.onopen?.({});
  });
};

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const sentOfType = (type: string) => SENT.filter((m) => m.type === type);

/** Let pending promises (account probe, badge/cosmetic fetches) settle. */
const flush = async (n = 5) => {
  for (let i = 0; i < n; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};

const realFetch = global.fetch;

const TICKET: Query = { ticket: "payload.sig", tour: "autumn-skirmish", match: "m2-1" };
const LOCKED: Query = { ...TICKET, lockHero: "kenshiro", lockMap: "catalog:counts-castle" };

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
  replaceCalls = [];
});

afterEach(() => {
  cleanup();
  global.fetch = realFetch;
  jest.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("create vs join", () => {
  it("a ticket alone opens ONE tagged room: hero + board from the ticket, no picker", async () => {
    await mount(LOCKED);

    const creates = sentOfType("CREATE_ROOM");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ ticket: "payload.sig", heroId: "kenshiro" });
    // engine #755 map identity: a non-engine catalog board rides as its ProMapDef
    expect((creates[0].customMap as { id: string }).id).toBe("counts-castle");
    expect(creates[0].customMap).toEqual(catalogEntry("counts-castle")!.map);
    expect(creates[0]).not.toHaveProperty("bot");
    expect(creates[0]).not.toHaveProperty("formatId");
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);

    // the picker never showed
    expect(screen.queryByText("CREATE A ROOM")).not.toBeInTheDocument();
    // the ticket left the URL at once…
    expect(replaceCalls[0].query).toEqual({});
    // …and the room id lands without it, tournament waiting screen up
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    const last = replaceCalls[replaceCalls.length - 1].query;
    expect(last).toEqual({ room: "SF2ROOM" });
    expect(screen.getByTestId("tournament-waiting")).toHaveTextContent("Back to the match page");
    expect(screen.queryByText("make lobby public")).not.toBeInTheDocument();
    expect(screen.queryByText("copy link")).not.toBeInTheDocument();
  });

  it("Mended Drum (an engine board) is sent as no customMap", async () => {
    await mount({ ...LOCKED, lockMap: "catalog:mended-drum" });
    const [create] = sentOfType("CREATE_ROOM");
    expect(create).toMatchObject({ ticket: "payload.sig" });
    expect(create).not.toHaveProperty("customMap");
  });

  it("a ticket with ?room= JOINs that room with the ticket — and sends no board", async () => {
    await mount({ ...LOCKED, room: "SF2ROOM" });

    expect(sentOfType("CREATE_ROOM")).toHaveLength(0);
    const joins = sentOfType("JOIN_ROOM");
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({ roomId: "SF2ROOM", heroId: "kenshiro", ticket: "payload.sig" });
    expect(joins[0]).not.toHaveProperty("customMap");
    expect(replaceCalls[0].query).toEqual({ room: "SF2ROOM" });
  });

  it("a refresh of a seated join tab RECONNECTs and never spends the ticket", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-SF2ROOM", "tok");
    await mount({ ...LOCKED, room: "SF2ROOM" });
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);
    expect(sentOfType("RECONNECT")).toHaveLength(1);
  });
});

describe("hero picker", () => {
  it("a ticket that leaves the hero open shows the picker with the setup fixed, then sends the ticket", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    await mount({ ...TICKET, lockMap: "catalog:counts-castle" });
    expect(sentOfType("CREATE_ROOM")).toHaveLength(0);
    await deliver({ type: "HEROES", heroes: HEROES });

    expect(screen.getByText("TOURNAMENT · pick your hero")).toBeInTheDocument();
    expect(screen.queryByText("CREATE A ROOM")).not.toBeInTheDocument();
    expect(screen.queryByText("FORMAT")).not.toBeInTheDocument();

    await click(screen.getByLabelText(/^Random fighter/));
    await click(screen.getByRole("button", { name: "Play" }));
    const creates = sentOfType("CREATE_ROOM");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ ticket: "payload.sig", heroId: "kenshiro" });
    expect(creates[0].heroId).not.toBe(RANDOM_HERO_ID);
    expect((creates[0].customMap as { id: string }).id).toBe("counts-castle");
  });
});

describe("engine ticket errors", () => {
  it.each([
    ["TICKET_EXPIRED", /ran out/, true],
    ["TICKET_MISMATCH", /doesn't fit this room/, true],
    ["TICKET_INVALID", /isn't valid/, true],
    ["MATCHUP_LOCKED", /organizer set this match/, false],
    ["TOURNAMENTS_DISABLED", /aren't available/, false],
  ] as const)("%s reads as copy, with a retry only where a fresh ticket helps", async (code, copy, retry) => {
    await mount(LOCKED);
    await deliver({ type: "ERROR", code, message: "engine text" });

    const screenEl = screen.getByTestId("ticket-error");
    expect(screenEl).toHaveTextContent(copy);
    expect(screenEl).not.toHaveTextContent(code);
    expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute(
      "href",
      "/tournaments?t=autumn-skirmish&m=m2-1",
    );
    expect(screen.queryByText("Get a fresh ticket and retry") !== null).toBe(retry);
    expect(screen.queryByText("Create a new room instead")).not.toBeInTheDocument();
  });

  it("a tournament room that's gone is a retry, not 'create a new room'", async () => {
    await mount({ ...LOCKED, room: "GONE" });
    await deliver({ type: "ERROR", code: "ROOM_NOT_FOUND", message: "no room" });
    expect(screen.getByTestId("ticket-error")).toHaveTextContent("This room expired");
    expect(screen.getByText("Get a fresh ticket and retry")).toBeInTheDocument();
  });

  it("the retry re-asks with a RECORDED ready when the answer is create (rule 6), and reloads with it", async () => {
    const fetchMock = jest.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        action: "create",
        ticket: init?.method === "POST" ? "fresh.sig" : "unrecorded.sig",
        gameIndex: 0, slot: "a", heroId: "kenshiro", map: null, ticketExpiresAt: "x", roomId: null,
      }),
    }));
    global.fetch = fetchMock as never;
    const assign = jest.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    await mount(LOCKED);
    await deliver({ type: "ERROR", code: "TICKET_EXPIRED", message: "expired" });
    await click(screen.getByText("Get a fresh ticket and retry"));
    const calls = fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`);
    expect(calls).toContainEqual(expect.stringMatching(/^POST .*\/tournaments\/autumn-skirmish\/matches\/m2-1\/ready$/));
    expect(assign).toHaveBeenCalledWith(expect.stringContaining("ticket=fresh.sig"));
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining("unrecorded"));
  });
});

describe("untagged /pro/game is unchanged", () => {
  it("an ordinary create sends no ticket key", async () => {
    await mount({});
    await deliver({ type: "HEROES", heroes: HEROES });
    await click(screen.getByLabelText(/^Random fighter/));
    await click(screen.getByRole("button", { name: "Create" }));
    const [create] = sentOfType("CREATE_ROOM");
    expect(create).toBeDefined();
    expect(create).not.toHaveProperty("ticket");
    expect(screen.queryByTestId("tournament-waiting")).not.toBeInTheDocument();
  });

  it("an ordinary ?room= join sends no ticket and keeps the old error screen", async () => {
    await mount({ room: "ABCD", hero: "kenshiro" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await click(screen.getByRole("button", { name: "Join" }));
    const [join] = sentOfType("JOIN_ROOM");
    expect(join).toMatchObject({ roomId: "ABCD", heroId: "kenshiro" });
    expect(join).not.toHaveProperty("ticket");
    await deliver({ type: "ERROR", code: "ROOM_NOT_FOUND", message: "no room" });
    expect(screen.getByText("Create a new room instead")).toBeInTheDocument();
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
  });
});

describe("the seat identity rides on an auto-launched ticket (review #1)", () => {
  it("waits for the account probe, then sends the nameplate — once", async () => {
    let answerMe!: () => void;
    const me = new Promise<void>((r) => (answerMe = r));
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/me")) {
        await me;
        return { ok: true, status: 200, json: async () => ({ user: { id: "u2", username: "hokuto_shin" } }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response; // badges, cosmetics: settle as unavailable
    }) as unknown as typeof fetch;
    __resetAccountStoreForTests();

    await mount(LOCKED);
    await flush();
    expect(sentOfType("CREATE_ROOM")).toHaveLength(0); // the account hasn't answered yet
    expect(screen.getByTestId("ticket-loading")).toBeInTheDocument(); // …and no picker meanwhile
    expect(screen.queryByText("CREATE A ROOM")).not.toBeInTheDocument();

    answerMe();
    await flush(10);
    const creates = sentOfType("CREATE_ROOM");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ ticket: "payload.sig", heroId: "kenshiro", displayName: "hokuto_shin" });
    __resetAccountStoreForTests();
  });

  it("a guest launches as soon as the probe says guest", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    __resetAccountStoreForTests();
    await mount(LOCKED);
    await flush();
    expect(sentOfType("CREATE_ROOM")).toHaveLength(1);
    expect(sentOfType("CREATE_ROOM")[0]).not.toHaveProperty("displayName");
    __resetAccountStoreForTests();
  });
});

describe("one ticket, one room (review #5a)", () => {
  it("StrictMode's double mount still sends ONE CREATE_ROOM and strips the URL once", async () => {
    await mount(LOCKED, { strict: true });
    await flush();
    expect(sentOfType("CREATE_ROOM")).toHaveLength(1);
    expect(replaceCalls).toHaveLength(1); // the ticket is captured once, not per effect run
  });

  it("an identity that settles AFTER the 8s fallback launch doesn't launch again", async () => {
    jest.useFakeTimers();
    try {
      let answerMe!: () => void;
      const me = new Promise<void>((r) => (answerMe = r));
      global.fetch = jest.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/me")) {
          await me;
          return { ok: true, status: 200, json: async () => ({ user: { id: "u2", username: "hokuto_shin" } }) } as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      }) as unknown as typeof fetch;
      __resetAccountStoreForTests();
      await mount(LOCKED);
      await act(async () => jest.advanceTimersByTimeAsync(100));
      expect(sentOfType("CREATE_ROOM")).toHaveLength(0);
      await act(async () => jest.advanceTimersByTimeAsync(8000)); // the probe is stuck: launch anyway
      expect(sentOfType("CREATE_ROOM")).toHaveLength(1);
      answerMe(); // …then it answers: signed in, badges/cosmetics load, identity settles
      for (let i = 0; i < 10; i++) await act(async () => jest.advanceTimersByTimeAsync(10));
      expect(sentOfType("CREATE_ROOM")).toHaveLength(1);
    } finally {
      jest.useRealTimers();
      __resetAccountStoreForTests();
    }
  });

  it("…and ONE JOIN_ROOM", async () => {
    await mount({ ...LOCKED, room: "SF2ROOM" }, { strict: true });
    await flush();
    expect(sentOfType("JOIN_ROOM")).toHaveLength(1);
  });
});

describe("game over in a tournament room (review #5b)", () => {
  const bundle = (): ReplayBundle =>
    ({
      v: 1,
      engine: { schemaVersion: 1, dslVersion: "0" },
      config: {
        seed: 7,
        formatId: "duel",
        options: { mulligan: true },
        players: { p1: { heroId: "kenshiro", hero: {}, cards: [] }, p2: { heroId: "boba-fett", hero: {}, cards: [] } },
        map: BASE_VIEW.map,
      },
      actionLog: [],
      meta: { winner: "p1", heroes: { p1: "kenshiro", p2: "boba-fett" }, turns: 3, endedAt: 0, mapTitle: "x" },
    }) as unknown as ReplayBundle;

  const finish = async () => {
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await deliver({ type: "STATE", view: { ...BASE_VIEW, you: "p1", phase: "GAME_OVER", winner: "p1", prompt: null }, legalActions: [], events: [] });
    await deliver({ type: "REPLAY_BUNDLE", bundle: bundle() });
  };

  it("swaps Rematch for 'Back to the match'", async () => {
    await mount(LOCKED);
    await flush();
    await finish();
    const back = screen.getAllByTestId("back-to-match", { hidden: true } as never);
    expect(back.length).toBeGreaterThan(0);
    expect(back[0]).toHaveAttribute("href", "/tournaments?t=autumn-skirmish&m=m2-1");
    expect(screen.queryAllByRole("link", { name: /rematch/i, hidden: true })).toHaveLength(0);
  });

  it("(control) the same finish in an untagged room shows Rematch — so the swap above is real", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-SF2ROOM", "tok");
    await mount({ room: "SF2ROOM" });
    await flush();
    await finish();
    expect(screen.queryAllByRole("link", { name: /rematch/i, hidden: true }).length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("back-to-match")).toHaveLength(0);
  });

  it("…and a refresh into the finished room still knows it is a tournament room", async () => {
    rememberTournamentRoom("SF2ROOM", { slug: "autumn-skirmish", matchId: "m2-1" });
    window.sessionStorage.setItem("unbrewed-pro-token-SF2ROOM", "tok");
    await mount({ room: "SF2ROOM" });
    await flush();
    await finish();
    expect(screen.getAllByTestId("back-to-match", { hidden: true } as never).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("link", { name: /rematch/i, hidden: true })).toHaveLength(0);
  });
});

describe("'Back to game' in a new tab or on another device (review #2)", () => {
  it("a remembered tournament room resumes with ANY seat token this browser holds", async () => {
    rememberTournamentRoom("SF2ROOM", { slug: "autumn-skirmish", matchId: "m2-1" });
    window.localStorage.setItem("unbrewed-pro-token-SF2ROOM", "tok"); // another tab's seat
    await mount({ room: "SF2ROOM" });
    await flush();
    expect(sentOfType("RECONNECT")).toEqual([expect.objectContaining({ roomId: "SF2ROOM", token: "tok" })]);
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);
  });

  it("with no token it never sends a ticketless JOIN_ROOM: it offers a fresh ticket", async () => {
    rememberTournamentRoom("SF2ROOM", { slug: "autumn-skirmish", matchId: "m2-1" });
    await mount({ room: "SF2ROOM" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);
    expect(screen.queryByText("JOIN ROOM SF2ROOM")).not.toBeInTheDocument();
    expect(screen.getByTestId("ticket-error")).toHaveTextContent("another tab or device");
    expect(screen.getByText("Get a fresh ticket and retry")).toBeInTheDocument();
  });

  it("an untagged room keeps the old two-tab rule: another tab's token alone doesn't resume", async () => {
    window.localStorage.setItem("unbrewed-pro-token-CASUAL", "tok");
    await mount({ room: "CASUAL" });
    await flush();
    expect(sentOfType("RECONNECT")).toHaveLength(0);
  });
});

describe("the tournament-room note doesn't leak into casual rooms (review #4)", () => {
  it("an untagged create into a reused code drops the note and shows the invite link", async () => {
    rememberTournamentRoom("ABCD", { slug: "old", matchId: "m1-0" });
    await mount({});
    await deliver({ type: "HEROES", heroes: HEROES });
    await click(screen.getByLabelText(/^Random fighter/));
    await click(screen.getByRole("button", { name: "Create" }));
    await deliver({ type: "ROOM_CREATED", roomId: "ABCD", token: "tok", you: "p1" });
    expect(screen.queryByTestId("tournament-waiting")).not.toBeInTheDocument();
    expect(screen.getByText("copy link")).toBeInTheDocument();
    expect(tournamentRoomOf("ABCD")).toBeNull();
  });
});
