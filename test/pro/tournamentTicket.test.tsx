/**
 * Tournament tickets through the REAL Pro game page (#1218, engine #755 / v37).
 *
 *  - create vs join: `?ticket=` alone → one tagged CREATE_ROOM; with `?room=` →
 *    JOIN_ROOM into it. Either way the ticket's keys leave the URL at once.
 *  - a ticket that sets the hero skips the picker; one that doesn't shows the
 *    picker with the setup fixed and still sends the ticket.
 *  - the engine's ticket codes read as copy with a retry and a way back.
 *  - untagged /pro/game is unchanged: no `ticket` key, the old error screen.
 *  - a raw `?room=` into a tagged room on a seatless device is never a dead end (#1230).
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
import { webcrypto } from "node:crypto";
import { dropTicketFragment, rememberTournamentRoom, tournamentRoomOf } from "@/lib/pro/tournamentTicket";
import { canonicalJson, mapLockHash, sha256Hex } from "@/lib/tournaments/mapHash";
import { ROOM_STILL_GONE } from "@/lib/tournaments/usePlayMatch";
import type { PlayerView, ReplayBundle } from "@/lib/pro/protocol";
import { fixtureMatch, fixtureMyTournaments } from "@/lib/tournaments/fixtures";
import { __resetNextMatchForTests } from "@/lib/tournaments/useNextMatch";

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
const REAL_LOCATION = window.location;

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
  Object.defineProperty(window, "location", { configurable: true, value: REAL_LOCATION });
  window.history.replaceState(null, "", "/");
  dropTicketFragment();
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

describe("the ticket in the fragment (F5, #1268)", () => {
  it("a #ticket= link launches with it, and the address bar loses it on the first render", async () => {
    window.history.replaceState(null, "", "/pro/game?tour=autumn-skirmish&match=m2-1&lockHero=kenshiro&lockMap=catalog:counts-castle#ticket=frag.sig");
    const { ticket: _none, ...query } = LOCKED;
    await mount(query);
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("frag.sig");
    const creates = sentOfType("CREATE_ROOM");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ ticket: "frag.sig", heroId: "kenshiro" });
    expect(replaceCalls[0].query).toEqual({});
  });

  it("StrictMode's double render still launches ONE room with the fragment's ticket", async () => {
    window.history.replaceState(null, "", "/pro/game?tour=autumn-skirmish&match=m2-1&lockHero=kenshiro#ticket=frag.sig");
    await mount({ tour: "autumn-skirmish", match: "m2-1", lockHero: "kenshiro" }, { strict: true });
    expect(sentOfType("CREATE_ROOM")).toEqual([expect.objectContaining({ ticket: "frag.sig" })]);
    expect(window.location.hash).toBe("");
  });

  it("the fragment's ticket wins over a stale ?ticket=; a ticket-less load stays a casual one", async () => {
    window.history.replaceState(null, "", "/pro/game?ticket=old.sig&tour=autumn-skirmish&match=m2-1&lockHero=kenshiro#ticket=frag.sig");
    await mount({ ...LOCKED, ticket: "old.sig" });
    expect(sentOfType("CREATE_ROOM")).toEqual([expect.objectContaining({ ticket: "frag.sig" })]);
  });

  it("the CREATE_ROOM's customMap hashes to the organizer's stored map-lock hash (no drift, contract item 3)", async () => {
    const jsdomCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
    try {
      for (const id of ["counts-castle", "weathertop"]) {
        cleanup();
        FakeWebSocket.reset();
        SENT = [];
        await mount({ ...LOCKED, lockMap: `catalog:${id}` });
        const [create] = sentOfType("CREATE_ROOM"); // parsed off the wire, as the engine sees it
        expect((create.customMap as { id: string }).id).toBe(id);
        const stored = await mapLockHash({ kind: "catalog", id });
        expect(stored).toMatch(/^[0-9a-f]{64}$/);
        expect(await sha256Hex(canonicalJson(create.customMap))).toBe(stored);
      }
    } finally {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: jsdomCrypto });
    }
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
    const fetchMock = jest.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        action: "create",
        ticket: url.endsWith("/ready") ? "fresh.sig" : "unrecorded.sig",
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
    // the ticket is a POST now (#1268), never a GET; no room to report on a ticket code
    expect(calls).toContainEqual(expect.stringMatching(/^POST .*\/matches\/m2-1\/ticket$/));
    expect(calls.filter((c) => c.startsWith("GET ") && c.endsWith("/ticket"))).toEqual([]);
    expect(calls.filter((c) => c.endsWith("/room-gone"))).toEqual([]);
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

describe("a raw ?room= link on a device without the seat (#1230)", () => {
  it("TICKET_REQUIRED for a room we can't place reads as the ticket card, never 'create a new room'", async () => {
    await mount({ room: "SF2ROOM", hero: "kenshiro" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    await click(screen.getByRole("button", { name: "Join" }));
    await deliver({ type: "ERROR", code: "TICKET_REQUIRED", message: "engine text" });
    const card = screen.getByTestId("ticket-error");
    expect(card).toHaveTextContent("This is a tournament room");
    expect(card).not.toHaveTextContent("TICKET_REQUIRED");
    expect(screen.getByText("My tournaments").closest("a")).toHaveAttribute("href", "/tournaments");
    expect(screen.queryByText("Create a new room instead")).not.toBeInTheDocument();
  });

  it("one of MY match rooms (from GET /me/tournaments) skips the picker: back to the match, or a fresh ticket", async () => {
    const now = new Date().toISOString();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
      if (url.endsWith("/me")) return ok({ user: { id: "u3", username: "bountyhuntr" } });
      if (url.endsWith("/me/tournaments")) return ok(fixtureMyTournaments("you_ready", now));
      if (url.includes("/matches/m2-1")) return ok(fixtureMatch("you_ready", now).detail);
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    __resetAccountStoreForTests();
    __resetNextMatchForTests();

    await mount({ room: "SF2ROOM" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush(10);
    expect(screen.queryByText("JOIN ROOM SF2ROOM")).not.toBeInTheDocument();
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);
    expect(screen.getByTestId("ticket-error")).toHaveTextContent("another tab or device");
    expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute(
      "href",
      "/tournaments?t=fixture-match-you-ready&m=m2-1",
    );
    expect(screen.getByText("Get a fresh ticket and retry")).toBeInTheDocument();
    // …and a refresh knows without asking again.
    expect(tournamentRoomOf("SF2ROOM")).toEqual({ slug: "fixture-match-you-ready", matchId: "m2-1" });
    __resetAccountStoreForTests();
    __resetNextMatchForTests();
  });

  it("a room of a match that ISN'T nextMatch is found by walking my running tournaments", async () => {
    const now = new Date().toISOString();
    const mine = fixtureMyTournaments("you_ready", now);
    const other = fixtureMatch("you_ready", now);
    const otherDetail = { ...other.detail, liveRoom: { ...other.detail.liveRoom!, roomId: "OTHER" } };
    const running = { ...mine.tournaments[0], status: "running" as const };
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
      if (url.endsWith("/me")) return ok({ user: { id: "u2", username: "hokuto_shin" } });
      if (url.endsWith("/me/tournaments"))
        return ok({ ...mine, tournaments: [running], nextMatch: { ...mine.nextMatch!, match: { ...mine.nextMatch!.match, id: "elsewhere" } } });
      if (url.includes("/matches/elsewhere")) return ok({ ...other.detail, liveRoom: null, match: { ...other.detail.match, id: "elsewhere" } });
      if (url.includes("/matches/m2-1")) return ok(otherDetail);
      if (url.endsWith(`/tournaments/${running.slug}`))
        return ok({ tournament: running, entries: other.entries, matches: other.matches, standings: null });
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    __resetAccountStoreForTests();
    __resetNextMatchForTests();

    await mount({ room: "OTHER" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush(15);
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);
    expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute(
      "href",
      `/tournaments?t=${running.slug}&m=m2-1`,
    );
    __resetAccountStoreForTests();
    __resetNextMatchForTests();
  });

  describe("useTaggedRoomLookup never strands a casual ?room= link (#1233 review)", () => {
    const signedIn = (mine: unknown | Promise<never>) => {
      const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
        if (url.endsWith("/me")) return ok({ user: { id: "u9", username: "casual" } });
        if (url.endsWith("/me/tournaments")) return mine instanceof Promise ? mine : ok(mine);
        if (url.includes("/matches/m2-1")) return ok(fixtureMatch("you_ready").detail);
        if (url.includes("/tournaments/")) {
          const f = fixtureMatch("you_ready");
          return ok({ tournament: f.tournament, entries: f.entries, matches: f.matches, standings: null });
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response;
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      __resetAccountStoreForTests();
      __resetNextMatchForTests();
      return fetchMock;
    };
    afterEach(() => {
      __resetAccountStoreForTests();
      __resetNextMatchForTests();
    });

    it("no running tournaments: one /me/tournaments call, then the picker — no per-tournament walk", async () => {
      const fetchMock = signedIn({ tournaments: [], nextMatch: null });
      await mount({ room: "CASUAL", hero: "kenshiro" });
      await deliver({ type: "HEROES", heroes: HEROES });
      await flush(10);
      expect(screen.getByText("JOIN ROOM CASUAL")).toBeInTheDocument();
      expect(screen.queryByTestId("room-lookup")).not.toBeInTheDocument();
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.filter((u) => u.endsWith("/me/tournaments"))).toHaveLength(1);
      expect(urls.some((u) => /\/tournaments\/[^/]+(\/matches\/|$)/.test(u.replace(/\/me\/tournaments$/, "")))).toBe(false);
      await click(screen.getByRole("button", { name: "Join" }));
      expect(sentOfType("JOIN_ROOM")).toEqual([expect.objectContaining({ roomId: "CASUAL" })]);
    });

    it("a miss (none of my matches has this room) goes to the hero picker", async () => {
      const now = new Date().toISOString();
      signedIn(fixtureMyTournaments("you_ready", now)); // my live room is SF2ROOM, not NOTMINE
      await mount({ room: "NOTMINE", hero: "kenshiro" });
      await deliver({ type: "HEROES", heroes: HEROES });
      await flush(15);
      expect(screen.getByText("JOIN ROOM NOTMINE")).toBeInTheDocument();
      expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
      expect(tournamentRoomOf("NOTMINE")).toBeNull();
    });

    it("an api that never answers holds the picker for 3s at most, then shows it", async () => {
      signedIn(new Promise<never>(() => {}));
      await mount({ room: "SLOW", hero: "kenshiro" });
      await deliver({ type: "HEROES", heroes: HEROES });
      await flush(5);
      expect(screen.getByTestId("room-lookup")).toBeInTheDocument();
      expect(screen.queryByText("JOIN ROOM SLOW")).not.toBeInTheDocument();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 3100));
      });
      expect(screen.queryByTestId("room-lookup")).not.toBeInTheDocument();
      expect(screen.getByText("JOIN ROOM SLOW")).toBeInTheDocument();
    }, 10_000);
  });
});

describe("refresh at the tournament hero picker (E1, #1236)", () => {
  it("remembers the launch for the tab, then a reload with no ticket and no room shows the ticket card, not the lobby", async () => {
    await mount({ ...TICKET, lockMap: "catalog:counts-castle" });
    await deliver({ type: "HEROES", heroes: HEROES });
    expect(screen.getByText("TOURNAMENT · pick your hero")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("unbrewed-pro-tournament-pending")).toContain("m2-1");
    cleanup();
    FakeWebSocket.reset();
    SENT = [];

    await mount({}); // F5: the ticket was stripped from the URL
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    expect(screen.getByTestId("ticket-error")).toBeInTheDocument();
    expect(screen.getByText("Get a fresh ticket and retry")).toBeInTheDocument();
    expect(screen.getByText("Back to the match")).toBeInTheDocument();
    expect(screen.queryByText("CREATE A ROOM")).not.toBeInTheDocument();
    expect(sentOfType("CREATE_ROOM")).toHaveLength(0); // the ticket is never reused
  });

  it("an ordinary reload with nothing remembered still shows the casual lobby", async () => {
    await mount({});
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
  });
});

describe("the remembered launch never blocks the casual lobby (review #2, #1236)", () => {
  it("a ticket error clears it: /pro/game?quick=1 in the same tab shows the lobby", async () => {
    await mount(LOCKED);
    expect(window.sessionStorage.getItem("unbrewed-pro-tournament-pending")).not.toBeNull();
    await deliver({ type: "ERROR", code: "TICKET_EXPIRED", message: "x" });
    expect(screen.getByTestId("ticket-error")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("unbrewed-pro-tournament-pending")).toBeNull();
    cleanup();
    FakeWebSocket.reset();
    await mount({ quick: "1" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
  });

  it("'Play casual instead' on the reload card clears the note", async () => {
    await mount({ ...TICKET });
    await deliver({ type: "HEROES", heroes: HEROES });
    cleanup();
    FakeWebSocket.reset();
    await mount({});
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush();
    const link = screen.getByText("Play casual instead");
    expect(link.closest("a")).toHaveAttribute("href", "/pro/game");
    await click(link);
    expect(window.sessionStorage.getItem("unbrewed-pro-tournament-pending")).toBeNull();
  });
});

describe("a tagged room whose match is decided (C3, #1236)", () => {
  it("says the match is finished, with only 'Back to the match'", async () => {
    rememberTournamentRoom("SF2ROOM", { slug: "autumn-skirmish", matchId: "m2-1" });
    const decided = fixtureMatch("decided").detail;
    global.fetch = jest.fn(async (url: RequestInfo | URL) =>
      String(url).includes("/matches/")
        ? ({ ok: true, status: 200, json: async () => decided } as Response)
        : ({ ok: false, status: 404, json: async () => ({}) } as Response),
    ) as unknown as typeof fetch;
    await mount({ room: "SF2ROOM" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush(8);
    expect(screen.getByTestId("ticket-error")).toHaveTextContent("This match is finished");
    expect(screen.queryByText("Get a fresh ticket and retry")).not.toBeInTheDocument();
    expect(screen.getByText("Back to the match")).toBeInTheDocument();
  });
});

describe("host's waiting room after a refresh (E7, #1236)", () => {
  it("names the hero from the room's roster and does not claim a default board", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-HOSTROOM", "tok");
    await mount({ room: "HOSTROOM" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await deliver({ type: "ROOM_JOINED", roomId: "HOSTROOM", you: "p1", seats: ["p1"], requiredPlayers: 2, formatId: "duel" });
    await deliver({
      type: "ROOM_STATUS",
      roomId: "HOSTROOM",
      formatId: "duel",
      requiredPlayers: 2,
      seats: [{ player: "p1", heroId: "kenshiro", connected: true, bot: null }],
    });
    await flush();
    expect(screen.getByText(/You are Kenshiro/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for an opponent/)).not.toHaveTextContent("playing on");
  });
});

// p2p #1250: the ready path's dead ends on the game page.
const grantJson = (over: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => ({ action: "join", ticket: "fresh.sig", gameIndex: 0, slot: "a", heroId: "kenshiro", map: null, ticketExpiresAt: "x", roomId: "DQJ6", ...over }),
});

describe("a tagged room the engine lost (ROOM_NOT_FOUND, #1268 contract item 2)", () => {
  type Answers = {
    roomGone: () => { status: number; body: unknown };
    ticket: () => Record<string, unknown>;
    ready?: () => Record<string, unknown>;
    /** `GET …/matches/m2-1` (the screen's decided-check and the too_soon wait). */
    detail?: () => unknown;
  };
  const api = (a: Answers) => {
    const calls: { path: string; method: string; body: unknown }[] = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace(/^.*\/tournaments\/autumn-skirmish\/matches\/m2-1/, "");
      calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === "/room-gone") {
        const r = a.roomGone();
        return { ok: r.status === 200, status: r.status, json: async () => r.body };
      }
      if (path === "/ticket") return grantJson(a.ticket());
      if (path === "/ready") return grantJson(a.ready?.() ?? { action: "create", roomId: null, ticket: "created.sig" });
      if (path === "" && a.detail) return { ok: true, status: 200, json: async () => a.detail!() };
      return { ok: false, status: 404, json: async () => ({}) };
    }) as never;
    return calls;
  };
  const deadRoomCard = async () => {
    rememberTournamentRoom("GONE", { slug: "autumn-skirmish", matchId: "m2-1" });
    window.localStorage.setItem("unbrewed-pro-token-GONE", "tok");
    await mount({ room: "GONE" });
    await flush();
    expect(sentOfType("RECONNECT")).toEqual([expect.objectContaining({ roomId: "GONE" })]);
    await deliver({ type: "ERROR", code: "ROOM_NOT_FOUND", message: "no room" });
    expect(screen.getByTestId("ticket-error")).toHaveTextContent("This room expired");
    const assign = jest.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, reload: jest.fn() } });
    return assign;
  };
  const retry = async () => {
    await click(screen.getByText("Get a fresh ticket and retry"));
    await flush();
  };

  it("reports the room gone ONCE, then a cleared room's fresh grant is a recorded create into a NEW room", async () => {
    const calls = api({
      roomGone: () => ({ status: 200, body: { cleared: true } }),
      ticket: () => ({ action: "create", roomId: null, ticket: "unrecorded.sig" }),
    });
    const assign = await deadRoomCard();
    await retry();
    expect(calls.map((c) => `${c.method} ${c.path}`).filter((c) => !c.startsWith("GET"))).toEqual([
      "POST /room-gone",
      "POST /ticket",
      "POST /ready",
    ]);
    expect(calls[calls.findIndex((c) => c.path === "/room-gone")].body).toEqual({ roomId: "GONE" });
    expect(assign).toHaveBeenCalledTimes(1);
    const href = String(assign.mock.calls[0][0]);
    expect(href).toContain("#ticket=created.sig");
    expect(href).not.toContain("room=GONE");
  });

  it("the api still points at the dead room: says so, never navigates back in, and never re-reports", async () => {
    const calls = api({
      roomGone: () => ({ status: 200, body: { cleared: false } }),
      ticket: () => ({ action: "join", roomId: "GONE", ticket: "again.sig" }),
    });
    const assign = await deadRoomCard();
    await retry();
    expect(screen.getByRole("alert")).toHaveTextContent(ROOM_STILL_GONE);
    await retry();
    await retry();
    expect(assign).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.path === "/room-gone")).toHaveLength(1);
    expect(calls.filter((c) => c.path === "/ticket")).toHaveLength(3);
    expect(screen.getByRole("alert")).toHaveTextContent(ROOM_STILL_GONE);
  });

  it("an api without the route (404): today's behaviour — the plain fresh grant", async () => {
    const calls = api({
      roomGone: () => ({ status: 404, body: { error: "not_found" } }),
      ticket: () => ({ action: "join", roomId: "GONE", ticket: "legacy.sig" }),
    });
    const assign = await deadRoomCard();
    await retry();
    expect(calls.filter((c) => c.path === "/room-gone")).toHaveLength(1);
    expect(assign).toHaveBeenCalledWith(expect.stringMatching(/room=GONE.*#ticket=legacy\.sig$/));
  });

  // p2p #1269 follow-ups (a) + (b).
  const reports = (calls: { path: string }[]) => calls.filter((c) => c.path === "/room-gone").length;
  /** The match detail with the dead room's create check made `agoMs` ago. */
  const detailWithRoom = (agoMs: number) => ({
    match: { id: "m2-1", status: "open", slotA: "e1", slotB: "e2", games: [] },
    tournament: { slug: "autumn-skirmish", status: "running" },
    players: {},
    readyChecks: [
      { id: "rc", gameIndex: 0, entryId: "e1", createdAt: new Date(Date.now() - agoMs).toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(), roomId: "GONE", outcome: "pending", role: "create" },
    ],
    liveRoom: null,
  });
  const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

  it("a network blip on room-gone is not remembered: the next press reports again", async () => {
    let n = 0;
    const calls = api({
      roomGone: () => (n++ === 0 ? { status: 503, body: {} } : { status: 200, body: { cleared: true } }),
      ticket: () => ({ action: "join", roomId: "GONE", ticket: "again.sig" }),
    });
    await deadRoomCard();
    await retry();
    expect(screen.getByRole("alert")).toHaveTextContent(ROOM_STILL_GONE);
    await retry();
    expect(reports(calls)).toBe(2);
    await retry();
    expect(reports(calls)).toBe(2); // the real answer is kept
  });

  it("too_soon: says it is releasing the room, waits out the age gate, retries ONCE, then goes on", async () => {
    let n = 0;
    const calls = api({
      roomGone: () => (n++ === 0 ? { status: 200, body: { cleared: false, reason: "too_soon" } } : { status: 200, body: { cleared: true } }),
      ticket: () => ({ action: "create", roomId: null, ticket: "unrecorded.sig" }),
      detail: () => detailWithRoom(29_800), // 0.2s left of the 30s gate (+1s slack)
    });
    const assign = await deadRoomCard();
    await click(screen.getByText("Get a fresh ticket and retry"));
    await flush();
    expect(screen.getByTestId("room-releasing")).toHaveTextContent(/This match's room closed\. Releasing it in [12] s…/);
    expect(reports(calls)).toBe(1);
    await wait(1400);
    await flush();
    expect(reports(calls)).toBe(2);
    expect(screen.queryByTestId("room-releasing")).toBeNull();
    expect(assign).toHaveBeenCalledWith(expect.stringContaining("#ticket=created.sig"));
  });

  it("too_soon twice: no second wait, no loop — the still-gone copy", async () => {
    const calls = api({
      roomGone: () => ({ status: 200, body: { cleared: false, reason: "too_soon" } }),
      ticket: () => ({ action: "join", roomId: "GONE", ticket: "again.sig" }),
      detail: () => detailWithRoom(29_800),
    });
    const assign = await deadRoomCard();
    await retry();
    await wait(1400);
    await flush();
    expect(reports(calls)).toBe(2);
    expect(screen.getByRole("alert")).toHaveTextContent(ROOM_STILL_GONE);
    await wait(1400);
    expect(reports(calls)).toBe(2);
    // A later press asks once more, but never waits again on this screen.
    await retry();
    expect(screen.queryByTestId("room-releasing")).toBeNull();
    await wait(1400);
    expect(reports(calls)).toBe(3);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["not_room_creator", "room_not_live", "match_in_play"])("%s never waits or retries", async (reason) => {
    const calls = api({
      roomGone: () => ({ status: 200, body: { cleared: false, reason } }),
      ticket: () => ({ action: "join", roomId: "GONE", ticket: "again.sig" }),
      detail: () => detailWithRoom(0),
    });
    await deadRoomCard();
    await retry();
    expect(screen.queryByTestId("room-releasing")).toBeNull();
    await wait(1200);
    expect(reports(calls)).toBe(1);
  });

  it("leaving the screen during the wait cancels the retry", async () => {
    const calls = api({
      roomGone: () => ({ status: 200, body: { cleared: false, reason: "too_soon" } }),
      ticket: () => ({ action: "create", roomId: null, ticket: "x.sig" }),
      detail: () => detailWithRoom(29_800),
    });
    await deadRoomCard();
    await click(screen.getByText("Get a fresh ticket and retry"));
    await flush();
    expect(screen.getByTestId("room-releasing")).toBeInTheDocument();
    cleanup();
    await wait(1400);
    expect(reports(calls)).toBe(1);
  });

  it("any other engine error never calls room-gone", async () => {
    const calls = api({
      roomGone: () => ({ status: 200, body: { cleared: true } }),
      ticket: () => ({ action: "join", roomId: "GONE", ticket: "fresh.sig" }),
    });
    rememberTournamentRoom("GONE", { slug: "autumn-skirmish", matchId: "m2-1" });
    window.localStorage.setItem("unbrewed-pro-token-GONE", "tok");
    await mount({ room: "GONE" });
    await flush();
    await deliver({ type: "ERROR", code: "ROOM_FULL", message: "full" });
    const assign = jest.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, reload: jest.fn() } });
    await retry();
    expect(calls.filter((c) => c.path === "/room-gone")).toEqual([]);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});

describe("a seat the engine released (LV-3, #1250)", () => {
  it("'Back to your room' with a dead stored token: BAD_TOKEN forgets it and shows the ticket card, whose retry carries a join ticket back in", async () => {
    rememberTournamentRoom("DQJ6", { slug: "autumn-skirmish", matchId: "m2-1" });
    window.localStorage.setItem("unbrewed-pro-token-DQJ6", "dead");
    await mount({ room: "DQJ6" });
    await flush();
    expect(sentOfType("RECONNECT")).toEqual([expect.objectContaining({ roomId: "DQJ6", token: "dead" })]);
    await deliver({ type: "ERROR", code: "BAD_TOKEN", message: "Reconnect token not recognized" });

    const card = screen.getByTestId("ticket-error");
    expect(card).not.toHaveTextContent("BAD_TOKEN");
    expect(card).toHaveTextContent("Your seat was released while you were away. We'll get you back in.");
    expect(card).not.toHaveTextContent(/expired/i);
    expect(screen.getByText("Get a fresh ticket and retry")).toBeInTheDocument();
    expect(screen.getByText("Back to the match")).toBeInTheDocument();
    expect(screen.getByText("Play casual instead")).toBeInTheDocument();
    expect(window.localStorage.getItem("unbrewed-pro-token-DQJ6")).toBeNull();

    // The api answers seat_held: a join ticket back into the caller's own room.
    const fetchMock = jest.fn(async () => grantJson({ decision: "seat_held" }));
    global.fetch = fetchMock as never;
    const assign = jest.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    await click(screen.getByText("Get a fresh ticket and retry"));
    await flush();
    expect(assign).toHaveBeenCalledWith(expect.stringMatching(/ticket=fresh\.sig.*room=DQJ6|room=DQJ6.*ticket=fresh\.sig/));
  });

  it("arriving WITH a fresh ticket and a dead stored token: no bare RECONNECT race; BAD_TOKEN → the ticket JOIN re-seats", async () => {
    rememberTournamentRoom("DQJ6", { slug: "autumn-skirmish", matchId: "m2-1" });
    window.localStorage.setItem("unbrewed-pro-token-DQJ6", "dead");
    await mount({ ...LOCKED, room: "DQJ6" });
    await flush();
    // One RECONNECT (the ticket's own launch), never a second ticketless one after the URL strip.
    expect(sentOfType("RECONNECT")).toEqual([expect.objectContaining({ roomId: "DQJ6", token: "dead" })]);
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);
    await deliver({ type: "ERROR", code: "BAD_TOKEN", message: "Reconnect token not recognized" });
    expect(sentOfType("JOIN_ROOM")).toEqual([expect.objectContaining({ roomId: "DQJ6", heroId: "kenshiro", ticket: "payload.sig" })]);
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
    expect(screen.queryByText(/BAD_TOKEN/)).not.toBeInTheDocument();
    await deliver({ type: "ROOM_JOINED", roomId: "DQJ6", token: "fresh", you: "p2", seats: ["p1", "p2"], requiredPlayers: 2, formatId: "duel" });
    expect(window.localStorage.getItem("unbrewed-pro-token-DQJ6")).toBe("fresh");
  });

  it("…the seat still held: the RECONNECT takes it and the ticket is never spent", async () => {
    window.localStorage.setItem("unbrewed-pro-token-DQJ6", "live");
    await mount({ ...LOCKED, room: "DQJ6" });
    await flush();
    await deliver({ type: "ROOM_JOINED", roomId: "DQJ6", token: "live", you: "p1", seats: ["p1"], requiredPlayers: 2, formatId: "duel" });
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);
  });

  it("a ticket that leaves the hero open + a dead token: BAD_TOKEN goes straight to the hero picker (no error card), the pick sends the ticket JOIN (#1252)", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    window.localStorage.setItem("unbrewed-pro-token-DQJ6", "dead");
    await mount({ ...TICKET, room: "DQJ6" });
    await flush();
    expect(sentOfType("RECONNECT")).toHaveLength(1);
    await deliver({ type: "ERROR", code: "BAD_TOKEN", message: "Reconnect token not recognized" });
    await deliver({ type: "HEROES", heroes: HEROES });
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
    expect(screen.getByText("TOURNAMENT · pick your hero")).toBeInTheDocument();
    expect(window.localStorage.getItem("unbrewed-pro-token-DQJ6")).toBeNull();
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);

    await click(screen.getByLabelText(/^Random fighter/));
    await click(screen.getByRole("button", { name: "Play" }));
    expect(sentOfType("JOIN_ROOM")).toEqual([expect.objectContaining({ roomId: "DQJ6", heroId: "kenshiro", ticket: "payload.sig" })]);
  });

  it("(control) a casual room's BAD_TOKEN keeps the old screen", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-CASUAL", "dead");
    await mount({ room: "CASUAL" });
    await flush();
    await deliver({ type: "ERROR", code: "BAD_TOKEN", message: "Reconnect token not recognized" });
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
    expect(screen.getByText(/BAD_TOKEN/)).toBeInTheDocument();
  });
});

describe("a seat taken over by another tab (LV-4, #1250 ↔ engine #761)", () => {
  it("close 4001 shows 'This seat is open in another tab', never reconnects by itself, and 'Use this tab instead' does", async () => {
    rememberTournamentRoom("T1", { slug: "autumn-skirmish", matchId: "m2-1" });
    window.sessionStorage.setItem("unbrewed-pro-token-T1", "tok");
    await mount({ room: "T1" });
    await deliver({ type: "ROOM_JOINED", roomId: "T1", token: "tok", you: "p1", seats: ["p1"], requiredPlayers: 2, formatId: "duel" });
    const sockets = FakeWebSocket.instances.length;
    const socket = FakeWebSocket.latest()!;
    await act(async () => {
      socket.readyState = FakeWebSocket.CLOSED;
      socket.onclose?.({ code: 4001, reason: "seat_replaced" });
    });
    const panel = screen.getByTestId("seat-replaced");
    expect(panel).toHaveTextContent("This seat is open in another tab");
    expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute("href", "/tournaments?t=autumn-skirmish&m=m2-1");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1500)); // past the first backoff step
    });
    expect(FakeWebSocket.instances.length).toBe(sockets);

    await click(screen.getByText("Use this tab instead"));
    expect(FakeWebSocket.instances.length).toBe(sockets + 1);
    SENT = [];
    const next = FakeWebSocket.latest()!;
    await act(async () => {
      next.readyState = FakeWebSocket.OPEN;
      next.onopen?.({});
    });
    expect(sentOfType("RECONNECT")).toEqual([expect.objectContaining({ roomId: "T1", token: "tok" })]);
    expect(screen.queryByTestId("seat-replaced")).not.toBeInTheDocument();
  });
});

describe("the joiner's waiting room names the dealt board (LV-5, #1250)", () => {
  it("a ticket JOIN with a board names it", async () => {
    await mount({ ...LOCKED, room: "SF2ROOM" });
    await flush();
    await deliver({ type: "ROOM_JOINED", roomId: "SF2ROOM", token: "t", you: "p2", seats: ["p1", "p2"], requiredPlayers: 3, formatId: "duel" });
    await flush();
    expect(screen.getByText(/playing on/)).toHaveTextContent(catalogEntry("counts-castle")!.title);
    expect(screen.queryByText(/default board/)).not.toBeInTheDocument();
  });

  it("a ticket JOIN without one says nothing rather than 'the default board'", async () => {
    await mount({ ...TICKET, lockHero: "kenshiro", room: "SF2ROOM" });
    await flush();
    await deliver({ type: "ROOM_JOINED", roomId: "SF2ROOM", token: "t", you: "p2", seats: ["p1", "p2"], requiredPlayers: 3, formatId: "duel" });
    await flush();
    expect(screen.queryByText(/default board/)).not.toBeInTheDocument();
    expect(screen.queryByText(/playing on/)).not.toBeInTheDocument();
  });
});
