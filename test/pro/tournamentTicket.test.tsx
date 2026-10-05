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
import { act, cleanup, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import { RANDOM_HERO_ID } from "@/lib/pro/randomHero";
import { catalogEntry } from "@/lib/pro/mapCatalog";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

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

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const sentOfType = (type: string) => SENT.filter((m) => m.type === type);

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

  it("the retry asks the api for a fresh ticket and reloads with it", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ action: "create", ticket: "fresh.sig", gameIndex: 0, slot: "a", heroId: "kenshiro", map: null, ticketExpiresAt: "x", roomId: null }),
    }));
    global.fetch = fetchMock as never;
    const assign = jest.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    await mount(LOCKED);
    await deliver({ type: "ERROR", code: "TICKET_EXPIRED", message: "expired" });
    await click(screen.getByText("Get a fresh ticket and retry"));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/tournaments\/autumn-skirmish\/matches\/m2-1\/ticket$/);
    expect(assign).toHaveBeenCalledWith(expect.stringContaining("ticket=fresh.sig"));
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
