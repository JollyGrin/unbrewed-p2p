/**
 * p2p #1279 (round-4 P4) through the REAL Pro game page: the waiting room's
 * live seat hold (B4), MATCHUP_LOCKED with the engine's sentence (S7), "We
 * lost your game" with a way back (S8), no raw "{code}: {message}" in a
 * tournament tab (S9), the opponent's forfeit clock + why the game ended
 * (S10) — and the untagged /pro flows, byte-identical.
 *
 * Mount recipe: the shared render-fuzz one, as in tournamentTicket.test.tsx.
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
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { dropTicketFragment, rememberTournamentRoom } from "@/lib/pro/tournamentTicket";
import type { PlayerView } from "@/lib/pro/protocol";
import { fixtureMatch, fixtureMyTournaments } from "@/lib/tournaments/fixtures";
import { catalogEntry } from "@/lib/pro/mapCatalog";
import { MOBILE_QUERY } from "@/lib/pro/useProLayout";
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

/** `socket: false`: TournamentGate holds the page before the game mounts — assert no socket was opened. */
const mount = async (query: Query, opts: { strict?: boolean; socket?: false } = {}) => {
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
  if (opts.socket === false) {
    expect(FakeWebSocket.latest()).toBeNull();
    return;
  }
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

/** The api: `GET …/matches/m2-1` answers `detail()`; everything else 404s (a guest, no /me). */
const api = (detail: () => unknown) => {
  const calls: string[] = [];
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u}`);
    if (/\/tournaments\/autumn-skirmish\/matches\/m2-1$/.test(u)) return { ok: true, status: 200, headers: new Headers(), json: async () => detail() } as Response;
    return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
  return calls;
};
const openDetail = () => {
  const d = JSON.parse(JSON.stringify(fixtureMatch("waiting").detail)) as ReturnType<typeof fixtureMatch>["detail"];
  d.players = { a: null, b: null };
  return d;
};
const iso = (ms: number) => new Date(ms).toISOString();
const inPlay = (over: Partial<PlayerView> = {}) => ({ ...BASE_VIEW, you: "p1", prompt: null, ...over });

describe("the creator's waiting room (B4)", () => {
  it("leads with 'Keep this tab open' and counts the hold down from the api, not a fixed '15 minutes'", async () => {
    api(() => ({ ...openDetail(), liveRoom: { gameIndex: 0, roomId: "SF2ROOM", readyEntryId: "e1", expiresAt: iso(Date.now() + 10 * 60_000 + 500) } }));
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await flush(8);
    const waiting = screen.getByTestId("tournament-waiting");
    expect(screen.getByTestId("tournament-hold-headline")).toHaveTextContent("Keep this tab open");
    expect(screen.getByTestId("tournament-hold")).toHaveTextContent(/seat held · (10 min [01]|9 min 59) s left/);
    expect(waiting).not.toHaveTextContent("15 minutes");
  });

  it("once the api's hold for this room ran out: says so, with the link back to press Play again", async () => {
    const d = openDetail();
    api(() => ({
      ...d,
      liveRoom: null,
      readyChecks: [{ id: "rc", gameIndex: 0, entryId: "e1", createdAt: iso(Date.now() - 16 * 60_000), expiresAt: iso(Date.now() - 60_000), roomId: "SF2ROOM", outcome: "pending", role: "create" }],
    }));
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await flush(8);
    expect(screen.getByTestId("hold-expired-banner")).toHaveTextContent(
      "Your 15-minute hold ran out and this room closed. Go back to the match page and press Play again.",
    );
    expect(screen.queryByTestId("tournament-hold")).not.toBeInTheDocument();
    expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute("href", "/tournaments?t=autumn-skirmish&m=m2-1");
  });
});

describe("MATCHUP_LOCKED keeps the engine's sentence (S7)", () => {
  it("a map edited after the lock names the organizer and what to do", async () => {
    api(() => ({ ...openDetail(), tournament: { ...openDetail().tournament, organizer: { userId: "u-o", username: "RavenDefeatsAll", avatarUrl: "" } } }));
    await mount(LOCKED);
    await flush(4);
    await deliver({
      type: "ERROR",
      code: "MATCHUP_LOCKED",
      message: "This match is locked to a different version of map counts-castle; ask the organizer to re-save the matchup",
    });
    await flush(4);
    const card = screen.getByTestId("ticket-error");
    expect(card).toHaveTextContent("This match's map was edited after it was locked. Ask RavenDefeatsAll to re-save the matchup, then press Play again.");
    expect(screen.getByTestId("engine-message")).toHaveTextContent("locked to a different version of map counts-castle");
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("any other lock shows the engine's sentence under the usual copy", async () => {
    api(openDetail);
    await mount(LOCKED);
    await deliver({ type: "ERROR", code: "MATCHUP_LOCKED", message: "This match is locked to kenshiro vs boba-fett" });
    expect(screen.getByTestId("ticket-error")).toHaveTextContent(/organizer set this match/);
    expect(screen.getByTestId("engine-message")).toHaveTextContent("This match is locked to kenshiro vs boba-fett");
  });
});

describe("no raw '{code}: {message}' in a tournament tab (S9)", () => {
  it("BAD_MESSAGE in a tagged room reads as the ticket card with a retry and the way back", async () => {
    api(openDetail);
    await mount(LOCKED);
    await deliver({ type: "ERROR", code: "BAD_MESSAGE", message: "malformed frame" });
    const card = screen.getByTestId("ticket-error");
    expect(card).toHaveTextContent("Something went wrong talking to the server");
    expect(card).not.toHaveTextContent("BAD_MESSAGE");
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByText("Back to the match")).toBeInTheDocument();
  });

  it("(control) the same error in a casual room keeps the old line", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-CASUAL1", "tok");
    await mount({ room: "CASUAL1" });
    await deliver({ type: "ERROR", code: "BAD_MESSAGE", message: "malformed frame" });
    expect(document.body).toHaveTextContent("BAD_MESSAGE: malformed frame");
    expect(screen.queryByTestId("ticket-error")).not.toBeInTheDocument();
  });
});

describe("'We lost your game' in a tournament (S8)", () => {
  const lose = async () => {
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await deliver({ type: "STATE", view: inPlay(), legalActions: [], events: [] });
    await deliver({ type: "ERROR", code: "RESUME_FAILED", message: "gone" });
  };
  it("offers 'Back to the match'", async () => {
    api(openDetail);
    await mount(LOCKED);
    await lose();
    expect(screen.getByText("We lost your game")).toBeInTheDocument();
    expect(screen.getByTestId("lost-back-to-match")).toHaveAttribute("href", "/tournaments?t=autumn-skirmish&m=m2-1");
  });
  it("(control) a casual room's lost game has no match link", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-SF2ROOM", "tok");
    await mount({ room: "SF2ROOM" });
    await deliver({ type: "STATE", view: inPlay(), legalActions: [], events: [] });
    await deliver({ type: "ERROR", code: "RESUME_FAILED", message: "gone" });
    expect(screen.getByText("We lost your game")).toBeInTheDocument();
    expect(screen.queryByTestId("lost-back-to-match")).not.toBeInTheDocument();
  });
});

describe("the opponent's forfeit clock in a tagged duel (S10)", () => {
  const away = (ms: number) => ({ type: "OPPONENT_STATUS", connected: false, player: "p2", autoForfeitAt: Date.now() + ms });

  it("says who left, when they forfeit, and to stay", async () => {
    api(openDetail);
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await deliver({ type: "STATE", view: inPlay({ opponent: { ...BASE_VIEW.opponent!, displayName: "bountyhuntr" } }), legalActions: [], events: [] });
    await deliver(away(15 * 60_000 - 500));
    expect(screen.getByTestId("opponent-away-note")).toHaveTextContent(
      "bountyhuntr disconnected. They forfeit in 15:00 if they don't come back. Stay in the room.",
    );
    await deliver({ type: "OPPONENT_STATUS", connected: true, player: "p2" });
    expect(screen.queryByTestId("opponent-away-note")).not.toBeInTheDocument();
  });

  it("the win screen says why: the api's endReason", async () => {
    api(() => {
      const d = openDetail();
      d.match.games = [{ ...(d.match.games[0] ?? {}), gameIndex: 0, roomId: "SF2ROOM", finishedAt: iso(Date.now()), winnerEntry: "e1", endReason: "disconnect" } as never];
      return d;
    });
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await deliver({ type: "STATE", view: inPlay(), legalActions: [], events: [] });
    await deliver({ type: "STATE", view: inPlay({ phase: "GAME_OVER", winner: "p1" }), legalActions: [], events: [] });
    await flush(6);
    expect(screen.getAllByTestId("game-end-note", { hidden: true } as never)[0]).toHaveTextContent(
      "Your opponent left and didn't come back in time. You win by forfeit.",
    );
  });

  it("…and with no endReason (older api), the engine's own sign: they were still away when it ended", async () => {
    api(openDetail);
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await deliver({ type: "STATE", view: inPlay(), legalActions: [], events: [] });
    await deliver(away(1_000));
    await deliver({ type: "STATE", view: inPlay({ phase: "GAME_OVER", winner: "p1" }), legalActions: [], events: [] });
    await flush(6);
    expect(screen.getAllByTestId("game-end-note", { hidden: true } as never)[0]).toHaveTextContent(/didn't come back in time/);
    expect(screen.queryByTestId("opponent-away-note")).not.toBeInTheDocument();
  });

  it("(control) a casual room: no forfeit note, no end note, no tournament fetch", async () => {
    const calls = api(openDetail);
    window.sessionStorage.setItem("unbrewed-pro-token-SF2ROOM", "tok");
    await mount({ room: "SF2ROOM" });
    await deliver({ type: "STATE", view: inPlay(), legalActions: [], events: [] });
    await deliver(away(60_000));
    expect(screen.queryByTestId("opponent-away-note")).not.toBeInTheDocument();
    await deliver({ type: "STATE", view: inPlay({ phase: "GAME_OVER", winner: "p1" }), legalActions: [], events: [] });
    await flush(6);
    expect(screen.queryAllByTestId("game-end-note", { hidden: true } as never)).toHaveLength(0);
    expect(calls.filter((c) => c.includes("/tournaments/"))).toEqual([]);
  });
});

describe("untagged /pro stays byte-identical (#1279 item 7)", () => {
  it("a casual create sends exactly the frame it always did", async () => {
    await mount({});
    await deliver({ type: "HEROES", heroes: HEROES });
    await click(screen.getByLabelText(/^Random fighter/));
    await click(screen.getByRole("button", { name: "Create" }));
    const [create] = sentOfType("CREATE_ROOM");
    expect(Object.keys(create).sort()).toEqual(expect.not.arrayContaining(["ticket", "tour", "match"]));
    await deliver({ type: "ROOM_CREATED", roomId: "CASUAL1", token: "tok", you: "p1" });
    // the casual waiting room: invite link, no hold copy, no tournament poll
    expect(screen.getByText("copy link")).toBeInTheDocument();
    expect(screen.queryByTestId("tournament-waiting")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tournament-hold")).not.toBeInTheDocument();
  });
});

describe("back to a tournament room after the browser died (journeys S6)", () => {
  const ROOM = "room-m2-1-0"; // the in-play fixture's game room
  const signedIn = () => {
    const now = new Date().toISOString();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const ok = (body: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;
      if (url.endsWith("/me")) return ok({ user: { id: "u3", username: "bountyhuntr" } });
      if (url.endsWith("/me/tournaments")) return ok(fixtureMyTournaments("in_play", now));
      // this player's in-play match owns the room (GET /me/tournament-room/:roomId)
      if (url.endsWith(`/me/tournament-room/${ROOM}`))
        return ok({ found: true, tournamentSlug: fixtureMyTournaments("in_play", now).nextMatch!.tournament.slug, matchId: "m2-1", gameIndex: 0, slot: "a", role: null });
      if (url.includes("/matches/m2-1")) return ok(fixtureMatch("in_play", now).detail);
      return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    __resetAccountStoreForTests();
    __resetNextMatchForTests();
  };
  afterEach(() => {
    __resetAccountStoreForTests();
    __resetNextMatchForTests();
  });

  it("a stored seat token that outlived the tab: resumes the seat, and a dead one becomes the ticket card", async () => {
    signedIn();
    window.localStorage.setItem(`unbrewed-pro-token-${ROOM}`, "oldtok");
    await mount({ room: ROOM });
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush(10);
    expect(sentOfType("RECONNECT")).toEqual([expect.objectContaining({ roomId: ROOM })]);
    expect(sentOfType("JOIN_ROOM")).toHaveLength(0);
    expect(screen.queryByText(`JOIN ROOM ${ROOM}`)).not.toBeInTheDocument();
    await deliver({ type: "ERROR", code: "BAD_TOKEN", message: "unknown token" });
    await flush(4);
    expect(screen.getByTestId("ticket-error")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute("href", "/tournaments?t=fixture-match-in-play&m=m2-1");
  });

  it("no token at all: the ticket card, never the casual join picker", async () => {
    signedIn();
    await mount({ room: ROOM }, { socket: false }); // the gate's card: the game page never mounts
    await flush(10);
    expect(screen.queryByText(`JOIN ROOM ${ROOM}`)).not.toBeInTheDocument();
    // This browser kept no record of the seat: offer one, never claim another tab holds it.
    expect(screen.getByTestId("ticket-error")).toHaveTextContent("Get your seat for this match to play here.");
    expect(screen.getByText("Get my seat")).toBeInTheDocument();
  });

  it("(control) a guest's ?room= link with a stored token for a casual room keeps the join picker", async () => {
    window.localStorage.setItem("unbrewed-pro-token-CASUAL9", "tok");
    await mount({ room: "CASUAL9" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await flush(10);
    expect(sentOfType("RECONNECT")).toHaveLength(0);
    expect(screen.getByText("JOIN ROOM CASUAL9")).toBeInTheDocument();
  });
});

describe("journeys polish in the room (#1279)", () => {
  it("a tournament room never shows its code: no 'room X' chip, no copy-link, no 'ROOM X' headline", async () => {
    api(openDetail);
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    expect(screen.getByText("YOUR MATCH ROOM")).toBeInTheDocument();
    expect(screen.queryByText("ROOM SF2ROOM")).not.toBeInTheDocument();
    await deliver({ type: "STATE", view: inPlay(), legalActions: [], events: [] });
    expect(document.body).not.toHaveTextContent("room SF2ROOM");
    expect(screen.queryByText(/Copy join link/)).not.toBeInTheDocument();
  });

  it("(control) a casual room keeps its code chip and headline", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-CASUAL1", "tok");
    await mount({ room: "CASUAL1" });
    await deliver({ type: "ROOM_JOINED", roomId: "CASUAL1", token: "tok", you: "p1", seats: ["p1"], requiredPlayers: 2, formatId: "duel" });
    expect(screen.getByText("ROOM CASUAL1")).toBeInTheDocument();
    await deliver({ type: "STATE", view: inPlay(), legalActions: [], events: [] });
    expect(document.body).toHaveTextContent("room CASUAL1");
  });

  it("the waiting room names the match's board again after a reload", async () => {
    rememberTournamentRoom("SF2ROOM", { slug: "autumn-skirmish", matchId: "m2-1" });
    window.sessionStorage.setItem("unbrewed-pro-token-SF2ROOM", "tok");
    api(() => {
      const d = openDetail();
      d.match.matchup = { heroes: { a: null, b: null }, map: { kind: "catalog", id: "counts-castle" } };
      return d;
    });
    await mount({ room: "SF2ROOM" });
    await deliver({ type: "HEROES", heroes: HEROES });
    await deliver({ type: "ROOM_JOINED", roomId: "SF2ROOM", token: "tok", you: "p1", seats: ["p1"], requiredPlayers: 2, formatId: "duel" });
    await flush(8);
    expect(screen.getByTestId("tournament-board")).toHaveTextContent(`Playing on ${catalogEntry("counts-castle")!.title}.`);
  });

  it("a ticket launch already names its board: no second board line", async () => {
    api(() => {
      const d = openDetail();
      d.match.matchup = { heroes: { a: null, b: null }, map: { kind: "catalog", id: "counts-castle" } };
      return d;
    });
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await flush(8);
    expect(screen.queryByTestId("tournament-board")).not.toBeInTheDocument();
  });

  it("the phone layout shows the opponent's forfeit clock too (journeys S5)", async () => {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === MOBILE_QUERY,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      api(openDetail);
      await mount(LOCKED);
      await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
      await deliver({ type: "STATE", view: inPlay({ activePlayer: "p2" }), legalActions: [], events: [] });
      expect(screen.getByTestId("pro-mobile-controls")).toBeInTheDocument();
      await deliver({ type: "OPPONENT_STATUS", connected: false, player: "p2", autoForfeitAt: Date.now() + 60_500 });
      expect(screen.getByTestId("opponent-away-note")).toHaveTextContent("Your opponent disconnected. They forfeit in 1:01");
    } finally {
      window.matchMedia = real;
    }
  });
});

it("the hero splash never tells a touch screen to hover (journeys polish)", async () => {
  await mount({});
  await deliver({ type: "HEROES", heroes: HEROES });
  const touch = screen.getByTestId("splash-hint-touch");
  expect(touch).toHaveTextContent("Tap a fighter to preview it and lock it in.");
  expect(screen.getByTestId("splash-hint-mouse")).toHaveTextContent("Hover a fighter to preview.");
  // jsdom has no (hover: none): assert the emitted rules swap the two there
  const css = Array.from(document.querySelectorAll("style")).map((s) => s.textContent ?? "").join("\n");
  const ruleFor = (el: Element) => {
    const cls = Array.from(el.classList).find((c) => c.startsWith("css-"))!;
    return css.split("}").filter((r) => r.includes(cls)).join("}") + Array.from(document.styleSheets)
      .flatMap((sh) => Array.from(sh.cssRules))
      .map((r) => r.cssText)
      .filter((t) => t.includes(cls))
      .join("\n");
  };
  expect(ruleFor(touch)).toMatch(/@media \(hover: ?none\)[^}]*\{[^}]*display: ?block/);
  expect(ruleFor(screen.getByTestId("splash-hint-mouse"))).toMatch(/@media \(hover: ?none\)[^}]*\{[^}]*display: ?none/);
});

describe("a room that is no longer this player's: only the notice", () => {
  /** The api signs in as u-me; the match's detail is `detail()`. */
  const signedInApi = (detail: () => unknown) => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith("/me")) return { ok: true, status: 200, headers: new Headers(), json: async () => ({ user: { id: "u-me", username: "final-ann" } }) } as Response;
      if (/\/tournaments\/autumn-skirmish\/matches\/m2-1$/.test(u)) return { ok: true, status: 200, headers: new Headers(), json: async () => detail() } as Response;
      return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
  };
  const board = () => screen.queryAllByTestId("plate-name-block", { hidden: true } as never);

  it("moved out of the match by the organizer: the board goes, the socket closes for good, the notice stays", async () => {
    __resetAccountStoreForTests();
    signedInApi(() => {
      const d = openDetail();
      d.players = { a: { ...fixtureMatch("waiting").detail.players.a!, userId: "u-ben" }, b: { ...fixtureMatch("waiting").detail.players.b!, userId: "u-dan" } };
      return d;
    });
    await mount(LOCKED);
    await deliver({ type: "ROOM_JOINED", roomId: "SF2ROOM", token: "tok", you: "p2" });
    await deliver({ type: "STATE", view: inPlay({ you: "p2" }), legalActions: [], events: [] });
    const socket = FakeWebSocket.latest()!;
    await flush(10);
    expect(screen.getByTestId("room-closed")).toHaveTextContent("You are no longer in this match (the organizer changed the bracket).");
    expect(screen.getByTestId("match-removed-banner").querySelector("a")).toHaveTextContent("Back to the match");
    expect(screen.getByTestId("match-removed-banner").querySelector("a")).toHaveAttribute("href", "/tournaments?t=autumn-skirmish&m=m2-1");
    expect(board()).toHaveLength(0);
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    // Being moved out is final: a late snapshot never brings the board back.
    await act(async () => {
      socket.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view: inPlay({ you: "p2" }), legalActions: [], events: [] }) });
    });
    await flush(4);
    expect(screen.getByTestId("room-closed")).toBeInTheDocument();
    expect(board()).toHaveLength(0);
    const sockets = FakeWebSocket.instances.length;
    await act(async () => {
      socket.onclose?.({ code: 1006 });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush(4);
    expect(FakeWebSocket.instances.length).toBe(sockets);
  });

  it("the waiting room's hold ran out: the expiry notice and ONE way back, no waiting copy or chime", async () => {
    api(() => ({
      ...openDetail(),
      liveRoom: null,
      readyChecks: [{ id: "rc", gameIndex: 0, entryId: "e1", createdAt: iso(Date.now() - 16 * 60_000), expiresAt: iso(Date.now() - 60_000), roomId: "SF2ROOM", outcome: "pending", role: "create" }],
    }));
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await flush(8);
    expect(screen.getByTestId("hold-expired-banner")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Waiting for an opponent");
    expect(document.body).not.toHaveTextContent("Go do something else");
    expect(screen.queryByTestId("lobby-sound-toggle")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").filter((a) => /back to the match/i.test(a.textContent ?? ""))).toHaveLength(1);
  });

  it("…but a join that lands after our expiry starts the game: the board shows and the notice goes", async () => {
    api(() => ({
      ...openDetail(),
      liveRoom: null,
      readyChecks: [{ id: "rc", gameIndex: 0, entryId: "e1", createdAt: iso(Date.now() - 16 * 60_000), expiresAt: iso(Date.now() - 60_000), roomId: "SF2ROOM", outcome: "pending", role: "create" }],
    }));
    await mount(LOCKED);
    await deliver({ type: "ROOM_CREATED", roomId: "SF2ROOM", token: "tok", you: "p1" });
    await flush(8);
    expect(screen.getByTestId("hold-expired-banner")).toBeInTheDocument();
    await deliver({ type: "STATE", view: inPlay(), legalActions: [], events: [] });
    await flush(4);
    expect(screen.queryByTestId("room-closed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hold-expired-banner")).not.toBeInTheDocument();
    expect(board().length).toBeGreaterThan(0);
    expect(FakeWebSocket.latest()!.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("(control) still in the match: the board stays and the socket stays open", async () => {
    __resetAccountStoreForTests();
    signedInApi(() => {
      const d = openDetail();
      d.players = { a: { ...fixtureMatch("waiting").detail.players.a!, userId: "u-me" }, b: { ...fixtureMatch("waiting").detail.players.b!, userId: "u-dan" } };
      return d;
    });
    await mount(LOCKED);
    await deliver({ type: "ROOM_JOINED", roomId: "SF2ROOM", token: "tok", you: "p2" });
    await deliver({ type: "STATE", view: inPlay({ you: "p2" }), legalActions: [], events: [] });
    await flush(10);
    expect(screen.queryByTestId("room-closed")).not.toBeInTheDocument();
    expect(board().length).toBeGreaterThan(0);
    expect(FakeWebSocket.latest()!.readyState).toBe(FakeWebSocket.OPEN);
  });
});

describe("a ticket load before the router is ready", () => {
  /** The static export's first render: no query yet, `isReady` false. */
  const page = (ready: boolean, query: Query) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={{ ...(fakeRouter(ready ? query : {}) as object), isReady: ready } as never}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>
  );

  it("holds 'Opening your room…' instead of flashing the casual 'CREATE A ROOM' lobby, then opens the tournament picker", async () => {
    api(openDetail);
    window.history.replaceState(null, "", "/pro/game?tour=autumn-skirmish&match=m2-1#ticket=payload.sig");
    const { rerender } = render(page(false, {}));
    expect(screen.getByTestId("ticket-arriving")).toHaveTextContent("OPENING YOUR ROOM…");
    // The game is already mounted (its socket stays), hidden under the hold.
    expect(screen.getByText("CREATE A ROOM")).not.toBeVisible();
    await act(async () => {
      rerender(page(true, { tour: "autumn-skirmish", match: "m2-1" }));
    });
    await deliver({ type: "HEROES", heroes: HEROES });
    expect(screen.queryByTestId("ticket-arriving")).not.toBeInTheDocument();
    expect(screen.getByText(/TOURNAMENT · /)).toBeInTheDocument();
    expect(screen.queryByText("CREATE A ROOM")).not.toBeInTheDocument();
  });

  it("(control) a casual load with no ticket keeps its usual first frame", async () => {
    window.history.replaceState(null, "", "/pro/game");
    render(page(false, {}));
    expect(screen.queryByTestId("ticket-arriving")).not.toBeInTheDocument();
    expect(screen.getByText("CREATE A ROOM")).toBeInTheDocument();
  });
});
