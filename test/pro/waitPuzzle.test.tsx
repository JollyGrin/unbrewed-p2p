/**
 * A puzzle while you wait (issue #1681), through the REAL Pro game page.
 *
 * What is pinned here is the page's wiring: WHEN the panel is mounted (a Quick
 * Match search sitting in its own room; a created lobby nobody has joined),
 * when it is not (a tournament room, a rematch wait, someone else's room, a bot
 * room, a small viewport, the off switch), what the bar above it says, that the
 * opponent arriving sets `paused` and turns the bar gold, and that the table is
 * held back until the countdown or "Go".
 *
 * The panel itself is a stand-in that shows the props it was given: its own
 * states (the paused cover, dead inputs, the second lap) are pinned in
 * puzzlePanel.test.tsx, and the two-browser run is scripts/pro/waitPuzzleCheck.mjs.
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ChakraProvider } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { HeroListing, LobbyListing, PlayerView } from "@/lib/pro/protocol";
import { dropTicketFragment } from "@/lib/pro/tournamentTicket";
import { fixtureMatch } from "@/lib/tournaments/fixtures";
import { __resetNextMatchForTests } from "@/lib/tournaments/useNextMatch";
import { sfx } from "@/lib/pro/sfx";
import { LOBBY_HOLD_MS, LOBBY_HOLD_SHORT_MS, WAIT_PUZZLE_HIDDEN_KEY, WAIT_PUZZLE_SKIP_ROOMS_KEY, lobbyHoldMs, waitPuzzleMedia } from "@/lib/pro/waitPuzzle";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

// The stand-in panel: its props on data attributes, a way to fail, and its
// `onStatus` report: "ready" as it mounts (a puzzle is up) unless a test holds
// that back to play the loading stretch itself.
const mockPanel = { readyAtMount: true, mounts: 0 };
jest.mock("../../components/Pro/Puzzle/PuzzlePanel", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useEffect } = require("react");
  const Stub = (props: { context: string; paused?: boolean; onStatus?: (status: string) => void }) => {
    useEffect(() => {
      mockPanel.mounts += 1;
      props.onStatus?.(mockPanel.readyAtMount ? "ready" : "loading");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div data-testid="puzzle-panel" data-context={props.context} data-paused={props.paused ? "true" : "false"}>
        <button type="button" data-testid="stub-puzzle-ready" onClick={() => props.onStatus?.("ready")} />
        <button type="button" data-testid="stub-puzzle-loading" onClick={() => props.onStatus?.("loading")} />
        <button type="button" data-testid="stub-puzzle-fail" onClick={() => props.onStatus?.("unavailable")} />
      </div>
    );
  };
  return { __esModule: true, default: Stub, PuzzlePanel: Stub };
});

const HERO = "king-kong";
const heroes: HeroListing[] = [{ heroId: HERO, name: "King Kong", hp: 20, move: 3, reach: "MELEE", tier: "community", deckSection: "recommended" }];
const lobby = (roomId: string, ageMs: number): LobbyListing => ({ roomId, heroId: HERO, heroName: "King Kong", ageMs, turnTimerSeconds: 60 });

const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"), "utf8")
    .trim()
    .split("\n")[0],
).view;
const STATE = { type: "STATE", view: { ...BASE_VIEW, you: "p1", phase: "PLAY", winner: null, prompt: null }, legalActions: [], events: [] };

type Query = Record<string, string>;
let SENT: Record<string, unknown>[] = [];
const frames = (type: string) => SENT.filter((m) => m.type === type);

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

let ws: FakeWebSocket;
const deliver = async (msg: Record<string, unknown>) => {
  await act(async () => {
    ws.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
  });
};
const click = async (el: Element) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
/** Let the lazily loaded panel (next/dynamic) and pending fetches settle. */
const flush = async (n = 6) => {
  for (let i = 0; i < n; i += 1)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};

const mount = async (query: Query = { hero: HERO }, lobbies: LobbyListing[] = []) => {
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
  ws = socket;
  await act(async () => {
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.({});
  });
  await deliver({ type: "HEROES", heroes });
  await deliver({ type: "LOBBIES", lobbies });
  SENT = [];
};

/** Which viewport the page thinks it has: only the waiting puzzle's own queries are answered. */
let viewportFits: { quick: boolean; lobby: boolean } = { quick: true, lobby: true };
const realMatchMedia = window.matchMedia;
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
  mockPanel.readyAtMount = true;
  mockPanel.mounts = 0;
  viewportFits = { quick: true, lobby: true };
  window.matchMedia = ((query: string) => ({
    matches: (query === waitPuzzleMedia("quick") && viewportFits.quick) || (query === waitPuzzleMedia("lobby") && viewportFits.lobby),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  act(() => toast.remove());
  jest.useRealTimers();
  window.matchMedia = realMatchMedia;
  global.fetch = realFetch;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const panel = () => screen.queryByTestId("puzzle-panel");
/** The real table (the in-game view) is on screen. */
const table = () => screen.queryAllByTestId("pro-game-view").length > 0;
const bar = () => screen.queryByTestId("wait-bar");
const dock = (testId: string) => screen.getAllByTestId(testId)[0];

/** Quick Match with nobody waiting: the search opens its own room and sits in it. */
const searchInOwnRoom = async (query: Query = { hero: HERO }) => {
  await mount(query);
  await click(await screen.findByTestId("quick-match"));
  await deliver({ type: "ROOM_CREATED", roomId: "MINE", token: "tok", you: "p1", turnTimerSeconds: 60 });
  await flush();
};
const opponentSits = (roomId: string) =>
  deliver({
    type: "ROOM_STATUS",
    roomId,
    formatId: "duel",
    requiredPlayers: 2,
    seats: [
      { player: "p1", heroId: HERO, connected: true, bot: null },
      { player: "p2", heroId: HERO, connected: true, bot: null, displayName: "Moritz" },
    ],
  });

/** Create a private lobby from the picker and land on its waiting screen. */
const createLobby = async (created: Record<string, unknown> = {}) => {
  await mount();
  await click(screen.getAllByTestId("pro-create-button")[0]);
  expect(frames("CREATE_ROOM")).toHaveLength(1);
  await deliver({ type: "ROOM_CREATED", roomId: "MINE", token: "tok", you: "p1", ...created });
  await flush();
};

describe("Quick Match search", () => {
  it("shows the panel over the roster, with the search's status in a thin bar", async () => {
    await searchInOwnRoom();
    expect(panel()).toHaveAttribute("data-context", "quick_search");
    expect(panel()).toHaveAttribute("data-paused", "false");
    expect(bar()).toHaveAttribute("data-gold", "false");
    expect(screen.getByTestId("wait-bar-title")).toHaveTextContent("Finding a match");
    expect(screen.getByTestId("wait-bar-elapsed")).toHaveTextContent(/^\d+:\d\d$/);
    expect(screen.getByTestId("wait-cancel")).toBeInTheDocument();
    // The roster gave up its place (kept mounted, so its filters survive); the
    // dock's own searching panel is still there.
    expect(screen.getByTestId("pro-roster-scroll").parentElement).toHaveStyle({ display: "none" });
    expect(dock("quick-match-searching")).toBeInTheDocument();
  });

  it("the match landing pauses the panel and turns the bar gold; the table opens after the countdown", async () => {
    await searchInOwnRoom();
    await opponentSits("MINE");
    expect(panel()).toHaveAttribute("data-paused", "true");
    expect(bar()).toHaveAttribute("data-gold", "true");
    expect(screen.getByTestId("wait-bar-title")).toHaveTextContent("Match found · Moritz");
    expect(screen.getByTestId("wait-bar-seconds")).toHaveTextContent("3");
    expect(screen.getByTestId("wait-go")).toBeInTheDocument();

    await deliver(STATE);
    expect(panel()).toBeInTheDocument(); // the countdown is not spent yet
    // Real time: the search's own ticker was started before this point.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3_400));
    });
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-match-found")).not.toBeInTheDocument();
    expect(table()).toBe(true);
  }, 20_000);

  it("Go enters the table at once (when the first STATE is in)", async () => {
    await searchInOwnRoom();
    await opponentSits("MINE");
    await deliver(STATE);
    expect(panel()).toHaveAttribute("data-paused", "true");
    expect(table()).toBe(false);
    await click(screen.getByTestId("wait-go"));
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(table()).toBe(true);
  });

  it("Go before the first STATE waits for it, then enters without the rest of the countdown", async () => {
    await searchInOwnRoom();
    await opponentSits("MINE");
    await click(screen.getByTestId("wait-go"));
    expect(panel()).toHaveAttribute("data-paused", "true"); // nothing to enter yet
    expect(screen.getByTestId("wait-go")).toBeDisabled();
    await deliver(STATE);
    expect(panel()).not.toBeInTheDocument();
    expect(table()).toBe(true);
  });

  it("Cancel on the bar leaves the search like the dock's Cancel: the room is unlisted first", async () => {
    await searchInOwnRoom();
    await deliver({ type: "VISIBILITY", roomId: "MINE", public: true });
    SENT = [];
    await click(screen.getByTestId("wait-cancel"));
    expect(frames("SET_VISIBILITY")).toEqual([expect.objectContaining({ roomId: "MINE", public: false })]);
  });

  it("a search that joins someone at once never mounts the panel", async () => {
    await mount({ hero: HERO }, [lobby("a", 120_000)]);
    await click(await screen.findByTestId("quick-match"));
    await deliver({ type: "ROOM_JOINED", roomId: "a", token: "tok", you: "p2" });
    await flush();
    expect(panel()).not.toBeInTheDocument();
    await opponentSits("a");
    await flush();
    expect(dock("quick-match-found")).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
  });

  it("a panel that fails is not there: the picker looks as it does today", async () => {
    await searchInOwnRoom();
    await click(screen.getByTestId("stub-puzzle-fail"));
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(screen.getByTestId("pro-roster-scroll").parentElement).not.toHaveStyle({ display: "none" });
    expect(dock("quick-match-searching")).toBeInTheDocument();
    expect(screen.queryByTestId("wait-show")).not.toBeInTheDocument();
  });

  it("is not shown on a viewport smaller than the panel's minimum", async () => {
    viewportFits = { quick: false, lobby: true }; // big enough for the lobby screen, not for the picker's column
    await searchInOwnRoom();
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(screen.queryByTestId("wait-show")).not.toBeInTheDocument();
  });
});

describe("a created lobby", () => {
  it("keeps its essentials in one bar, with the panel below", async () => {
    await createLobby({ turnTimerSeconds: 45 });
    expect(panel()).toHaveAttribute("data-context", "lobby_wait");
    expect(panel()).toHaveAttribute("data-paused", "false");
    expect(bar()).toHaveAttribute("data-gold", "false");
    expect(screen.getByTestId("waiting-title")).toHaveTextContent("ROOM MINE");
    expect(screen.getByTestId("wait-bar-waiting")).toHaveTextContent("You are King Kong");
    expect(screen.getByTestId("wait-bar-waiting")).toHaveTextContent("45s per decision");
    // The board the room plays on is still said (#1687).
    expect(screen.getByTestId("wait-bar-waiting")).toHaveTextContent(/playing on \S/);
    expect(screen.getByTestId("wait-bar-link")).toHaveTextContent("/pro/game?room=MINE");
    expect(screen.getByTestId("wait-copy")).toBeInTheDocument();
    expect(screen.getByTestId("lobby-sound-toggle")).toBeInTheDocument();
    await click(screen.getByTestId("wait-public"));
    expect(frames("SET_VISIBILITY")).toEqual([expect.objectContaining({ roomId: "MINE", public: true })]);
  });

  it("keeps the classic waiting screen until the panel has a puzzle up, then swaps without remounting it (#1687)", async () => {
    mockPanel.readyAtMount = false;
    await createLobby();
    // The panel is mounted (loading, out of sight); the screen is the classic one.
    expect(panel()).toBeInTheDocument();
    expect(screen.getByTestId("lobby-wait-puzzle")).toHaveAttribute("data-ready", "false");
    expect(screen.getByTestId("lobby-wait-puzzle")).toHaveStyle({ visibility: "hidden" });
    expect(bar()).not.toBeInTheDocument();
    expect(screen.getByTestId("waiting-title")).toHaveTextContent("ROOM MINE");
    expect(screen.getByText("copy link")).toBeInTheDocument();
    expect(screen.getByText(/playing on/)).toBeInTheDocument();

    const mounted = panel();
    await click(screen.getByTestId("stub-puzzle-ready"));
    expect(screen.getByTestId("lobby-wait-puzzle")).toHaveAttribute("data-ready", "true");
    expect(screen.getByTestId("lobby-wait-puzzle")).not.toHaveStyle({ visibility: "hidden" });
    expect(bar()).toBeInTheDocument();
    expect(screen.queryByText("copy link")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("waiting-title")).toHaveLength(1);
    // The very same panel (and so its socket and its room): not a second one.
    expect(panel()).toBe(mounted);
    expect(mockPanel.mounts).toBe(1);
    // "Next puzzle" loads a new room: the classic screen does not flash back.
    await click(screen.getByTestId("stub-puzzle-loading"));
    expect(bar()).toBeInTheDocument();
    expect(screen.queryByText("copy link")).not.toBeInTheDocument();
  });

  it("a game that starts while the panel is still loading opens the table at once: no hold for a puzzle nobody saw (#1687)", async () => {
    mockPanel.readyAtMount = false;
    await createLobby();
    await opponentSits("MINE");
    await deliver(STATE);
    expect(table()).toBe(true);
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
  });

  it("the game starting pauses the panel behind the gold bar, then opens the table", async () => {
    await createLobby();
    jest.useFakeTimers();
    await opponentSits("MINE");
    expect(panel()).toHaveAttribute("data-paused", "false"); // seated, not started: still playable
    await deliver(STATE);
    expect(panel()).toHaveAttribute("data-paused", "true");
    expect(bar()).toHaveAttribute("data-gold", "true");
    expect(screen.getByTestId("wait-bar-title")).toHaveTextContent("Opponent joined");
    expect(screen.getByTestId("wait-bar-seconds")).toHaveTextContent("3");
    await act(async () => {
      jest.advanceTimersByTime(LOBBY_HOLD_MS - 200);
    });
    expect(panel()).toBeInTheDocument();
    expect(table()).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(screen.queryByTestId("lobby-wait-puzzle")).not.toBeInTheDocument();
    expect(table()).toBe(true);
  });

  it("the match-found chime still plays exactly once, hold or no hold", async () => {
    const play = jest.spyOn(sfx, "play").mockImplementation(() => undefined as never);
    const chimes = () => play.mock.calls.filter(([name]) => name === "match-found").length;
    const realNow = Date.now.bind(Date);
    let skew = 0;
    const clock = jest.spyOn(Date, "now").mockImplementation(() => realNow() + skew);
    try {
      await createLobby();
      expect(chimes()).toBe(0);
      skew = 60_000; // the cue only rings for a host who really waited (lobbyCue's dwell)
      await opponentSits("MINE");
      await deliver(STATE);
      expect(chimes()).toBe(1);
      expect(bar()).toHaveAttribute("data-gold", "true");
      await deliver(STATE);
      await click(screen.getByTestId("wait-go"));
      await deliver(STATE);
      expect(table()).toBe(true);
      expect(chimes()).toBe(1);
    } finally {
      clock.mockRestore();
      play.mockRestore();
    }
  });

  it("a tab nobody is looking at gets no hold: the table opens with the game", async () => {
    await createLobby();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    try {
      await deliver(STATE);
      expect(panel()).not.toBeInTheDocument();
      expect(table()).toBe(true);
    } finally {
      delete (document as unknown as { hidden?: boolean }).hidden;
    }
  });

  it("a host who refreshes while waiting gets the puzzle back", async () => {
    await createLobby();
    cleanup();
    FakeWebSocket.reset();
    await mount({ room: "MINE" }); // this tab's own seat: the page RECONNECTs
    await deliver({ type: "ROOM_JOINED", roomId: "MINE", token: "tok2", you: "p1", seats: ["p1"], requiredPlayers: 2 });
    await flush();
    expect(panel()).toHaveAttribute("data-context", "lobby_wait");
  });

  it("Go opens the table at once, and later STATEs never bring the waiting screen back", async () => {
    await createLobby();
    await deliver(STATE);
    expect(bar()).toHaveAttribute("data-gold", "true");
    await click(screen.getByTestId("wait-go"));
    expect(panel()).not.toBeInTheDocument();
    expect(table()).toBe(true);
    await deliver(STATE);
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(table()).toBe(true);
  });

  it("a room on a short move timer holds the table for half as long", async () => {
    expect(lobbyHoldMs(undefined)).toBe(LOBBY_HOLD_MS);
    expect(lobbyHoldMs(0)).toBe(LOBBY_HOLD_MS);
    expect(lobbyHoldMs(60)).toBe(LOBBY_HOLD_MS);
    expect(lobbyHoldMs(30)).toBe(LOBBY_HOLD_MS);
    expect(lobbyHoldMs(10)).toBe(LOBBY_HOLD_SHORT_MS);
    await createLobby({ turnTimerSeconds: 10 });
    jest.useFakeTimers();
    await deliver(STATE);
    expect(panel()).toHaveAttribute("data-paused", "true");
    await act(async () => {
      jest.advanceTimersByTime(LOBBY_HOLD_SHORT_MS + 200);
    });
    expect(panel()).not.toBeInTheDocument();
  });

  it("a panel that fails puts today's waiting screen back, and the table then opens with no hold", async () => {
    await createLobby();
    await click(screen.getByTestId("stub-puzzle-fail"));
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(screen.getByTestId("waiting-title")).toHaveTextContent("ROOM MINE");
    expect(screen.getByText("copy link")).toBeInTheDocument();
    await deliver(STATE);
    expect(screen.queryByTestId("waiting-title")).not.toBeInTheDocument();
  });

  it("is not shown on a viewport smaller than the panel's minimum", async () => {
    viewportFits = { quick: true, lobby: false };
    await createLobby();
    expect(panel()).not.toBeInTheDocument();
    expect(screen.getByText("copy link")).toBeInTheDocument();
    expect(screen.queryByTestId("wait-show")).not.toBeInTheDocument();
  });
});

describe("the off switch", () => {
  it("'Hide puzzles while waiting' removes the panel, is remembered, and has a way back", async () => {
    await createLobby();
    await click(screen.getByTestId("wait-hide"));
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(WAIT_PUZZLE_HIDDEN_KEY)).toBe("1");
    expect(screen.getByText("copy link")).toBeInTheDocument(); // today's screen

    // A later visit: still off.
    cleanup();
    FakeWebSocket.reset();
    await createLobby();
    expect(panel()).not.toBeInTheDocument();

    await click(screen.getByTestId("wait-show"));
    await flush();
    expect(panel()).toHaveAttribute("data-context", "lobby_wait");
    expect(window.localStorage.getItem(WAIT_PUZZLE_HIDDEN_KEY)).toBeNull();
  });

  it("holds for a Quick Match search too, with the way back in the dock", async () => {
    window.localStorage.setItem(WAIT_PUZZLE_HIDDEN_KEY, "1");
    await searchInOwnRoom();
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    await click(dock("wait-show"));
    await flush();
    expect(panel()).toHaveAttribute("data-context", "quick_search");
    await click(screen.getByTestId("wait-hide"));
    expect(panel()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(WAIT_PUZZLE_HIDDEN_KEY)).toBe("1");
  });
});

describe("no puzzle where the wait is not ours to fill", () => {
  it("joining someone else's room", async () => {
    await mount({ hero: HERO, room: "THEIRS" });
    await click(screen.getAllByTestId("pro-create-button")[0]);
    expect(frames("JOIN_ROOM")).toHaveLength(1);
    // A three-seat room: the joiner waits too, but it is not their lobby.
    await deliver({ type: "ROOM_JOINED", roomId: "THEIRS", token: "tok", you: "p2", formatId: "ffa-3", requiredPlayers: 3 });
    await flush();
    expect(screen.getByTestId("waiting-title")).toHaveTextContent("ROOM THEIRS");
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem(WAIT_PUZZLE_SKIP_ROOMS_KEY) ?? "[]")).toEqual(["THEIRS"]);
  });

  it("a duel joined by its link whose host then left: still not the joiner's lobby", async () => {
    await mount({ hero: HERO, room: "THEIRS" });
    await click(screen.getAllByTestId("pro-create-button")[0]);
    await deliver({ type: "ROOM_JOINED", roomId: "THEIRS", token: "tok", you: "p2", seats: ["p2"], requiredPlayers: 2 });
    await flush();
    expect(panel()).not.toBeInTheDocument();
  });

  it("a rematch wait, also after a refresh", async () => {
    await mount({ rematch: "1", hero: HERO });
    await deliver({ type: "ROOM_CREATED", roomId: "AGAIN", token: "tok", you: "p1" });
    await flush();
    expect(screen.getByTestId("waiting-title")).toHaveTextContent("ROOM AGAIN");
    expect(panel()).not.toBeInTheDocument();
    expect(JSON.parse(window.sessionStorage.getItem(WAIT_PUZZLE_SKIP_ROOMS_KEY) ?? "[]")).toEqual(["AGAIN"]);

    // The refresh: the rematch keys left the URL when the link fired, so this
    // load looks like any host coming back to a room. It is still a rematch wait.
    cleanup();
    FakeWebSocket.reset();
    await mount({ room: "AGAIN" });
    await deliver({ type: "ROOM_JOINED", roomId: "AGAIN", token: "tok2", you: "p1", seats: ["p1"], requiredPlayers: 2 });
    await flush();
    expect(screen.getByTestId("waiting-title")).toHaveTextContent("ROOM AGAIN");
    expect(panel()).not.toBeInTheDocument();
  });

  it("a three-seat or 2v2 room: the host keeps the waiting screen with its seat roster", async () => {
    await createLobby({ formatId: "ffa-3", requiredPlayers: 3 });
    expect(screen.getByTestId("waiting-title")).toHaveTextContent("ROOM MINE");
    expect(screen.getByText(/1\/3 seats joined/)).toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
  });

  it("a room with a bot in it", async () => {
    await mount({ hero: HERO, vs: "ai" });
    await click(screen.getAllByTestId("pro-create-button")[0]);
    await deliver({ type: "ROOM_CREATED", roomId: "BOT", token: "tok", you: "p1" });
    await flush();
    expect(panel()).not.toBeInTheDocument();
  });

  it("a tournament room", async () => {
    const REAL_LOCATION = window.location;
    const detail = JSON.parse(JSON.stringify(fixtureMatch("waiting").detail)) as ReturnType<typeof fixtureMatch>["detail"];
    detail.players = { a: null, b: null };
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (/\/tournaments\/autumn-skirmish\/matches\/m2-1$/.test(String(url)))
        return { ok: true, status: 200, headers: new Headers(), json: async () => detail } as Response;
      return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    try {
      await mount({ ticket: "payload.sig", tour: "autumn-skirmish", match: "m2-1", lockHero: HERO, lockMap: "catalog:counts-castle" });
      await deliver({ type: "ROOM_CREATED", roomId: "TOUR", token: "tok", you: "p1" });
      await flush(8);
      expect(screen.getByTestId("tournament-waiting")).toBeInTheDocument();
      expect(panel()).not.toBeInTheDocument();
      expect(bar()).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: REAL_LOCATION });
      window.history.replaceState(null, "", "/");
      dropTicketFragment();
      __resetNextMatchForTests();
    }
  });
});
