/**
 * Quick Match end to end through the REAL Pro game page (issue #687 ↔ engine #391).
 *
 * The unit tests in `lib/pro/quickMatch.test.ts` pin the decision — who to join,
 * when to give up on a lobby, when to create. What they cannot see is whether the
 * page actually DRIVES that decision onto the socket, and that is the whole risk
 * here: the join/next-lobby/create walk is a state machine spread over two effects,
 * and a broken one either spams the server or dead-ends the player on an error
 * screen for a race that is completely normal.
 *
 * So this mounts the page with no `?room`, feeds it a hero roster and a lobby
 * list exactly as the socket would, clicks the button, and reads the frames that
 * come back out. Mount recipe is the render-fuzz one shared with
 * `opponentMovePrompt.test.tsx` (fake WebSocket, fake router).
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { HeroListing, LobbyListing } from "@/lib/pro/protocol";
import { randomMapPool } from "@/lib/pro/mapCatalog";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

// `hero_picked` (#1512): one per search, however many lobbies it walks.
const mockTrack = jest.fn();
jest.mock("../../lib/analytics", () => ({
  ...jest.requireActual("../../lib/analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

const HERO = "king-kong";

const heroes: HeroListing[] = [
  {
    heroId: HERO,
    name: "King Kong",
    hp: 20,
    move: 3,
    reach: "MELEE",
    tier: "community",
    deckSection: "recommended",
  },
];

/** Listings as TODAY's engine sends them: no formatId, no host, no timer. */
const lobby = (roomId: string, ageMs: number): LobbyListing => ({
  roomId,
  heroId: HERO,
  heroName: "King Kong",
  ageMs,
});

let SENT: string[] = [];
const mockReplace = jest.fn(async (..._a: unknown[]) => true);

const frames = (type: string): Record<string, unknown>[] =>
  SENT.map((raw) => JSON.parse(raw)).filter((m) => m.type === type);

const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    // `?hero=` preselects the fighter, so the test never has to click a hero
    // tile (which opens a Chakra modal jsdom can't focus-lock). Quick Match
    // itself is what we're exercising.
    query: { hero: HERO },
    asPath: `/pro/game?hero=${HERO}`,
    basePath: "",
    isReady: true,
    isFallback: false,
    isPreview: false,
    isLocaleDomain: false,
    events: { on() {}, off() {}, emit() {} },
    push: async () => true,
    replace: (...a: unknown[]) => mockReplace(...a),
    reload() {},
    back() {},
    forward() {},
    prefetch: async () => {},
    beforePopState() {},
  }) as never;

let ws: FakeWebSocket;

/** Mount the picker with a roster and a lobby list already delivered. */
const mountPicker = async (lobbies: LobbyListing[]) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter()}>
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
  SENT = []; // drop the handshake + LIST_LOBBIES poll chatter
};

const deliver = async (msg: Record<string, unknown>) => {
  await act(async () => {
    ws.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) });
  });
};

/** The server's answer when a listed lobby filled or closed under us. */
const raceAway = (code: "ROOM_FULL" | "ROOM_NOT_FOUND") =>
  deliver({ type: "ERROR", code, message: "gone" });

/** The dock panel mounts twice (desktop rail + mobile bar; CSS shows one), like Create. */
const dock = (testId: string) => screen.getAllByTestId(testId)[0];

const clickQuickMatch = async () => {
  const button = await screen.findByTestId("quick-match");
  await act(async () => {
    fireEvent.click(button);
  });
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(data: string) {
    SENT.push(data);
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  SENT = [];
  mockReplace.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks(); // drop any Math.random stub a board-roll test installed
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("Quick Match on the pre-join picker", () => {
  it("joins the longest-waiting open lobby", async () => {
    await mountPicker([lobby("young", 5_000), lobby("oldest", 120_000), lobby("middle", 60_000)]);
    await clickQuickMatch();
    expect(frames("JOIN_ROOM")).toEqual([
      expect.objectContaining({ type: "JOIN_ROOM", roomId: "oldest", heroId: HERO }),
    ]);
    expect(frames("CREATE_ROOM")).toEqual([]);
  });

  it("falls through to the next lobby when one fills mid-click, then creates", async () => {
    await mountPicker([lobby("a", 120_000), lobby("b", 60_000)]);
    await clickQuickMatch();
    expect(frames("JOIN_ROOM").map((m) => m.roomId)).toEqual(["a"]);

    await raceAway("ROOM_FULL"); // "a" filled between the poll and our join
    expect(frames("JOIN_ROOM").map((m) => m.roomId)).toEqual(["a", "b"]);

    await raceAway("ROOM_NOT_FOUND"); // "b" closed too — the list is spent
    expect(frames("JOIN_ROOM").map((m) => m.roomId)).toEqual(["a", "b"]);
    expect(frames("CREATE_ROOM")).toEqual([
      expect.objectContaining({ type: "CREATE_ROOM", heroId: HERO, quickMatch: true }),
    ]);
  });

  it("reports one hero_picked per search, as quickmatch, across skipped lobbies (#1512)", async () => {
    mockTrack.mockClear();
    await mountPicker([lobby("a", 120_000), lobby("b", 60_000)]);
    await clickQuickMatch();
    await raceAway("ROOM_FULL");
    await raceAway("ROOM_NOT_FOUND"); // two stale lobbies, then our own room
    expect(frames("CREATE_ROOM")).toHaveLength(1);
    expect(mockTrack.mock.calls.filter(([e]) => e === "hero_picked")).toEqual([
      ["hero_picked", { hero_id: HERO, tier: "community", mode: "quickmatch" }],
    ]);
  });

  it("never shows the dead-end room error screen for a race it is absorbing", async () => {
    await mountPicker([lobby("a", 120_000)]);
    await clickQuickMatch();
    await raceAway("ROOM_FULL");
    expect(screen.queryByText(/Create a new room instead/i)).not.toBeInTheDocument();
  });

  it("creates a public searching room straight away when nobody is waiting", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0); // → the server-default board
    await mountPicker([]);
    await clickQuickMatch();
    const created = frames("CREATE_ROOM");
    expect(created).toEqual([
      expect.objectContaining({ type: "CREATE_ROOM", heroId: HERO, quickMatch: true }),
    ]);
    // A matchmade room is the plainest possible duel: no timer, and duel is the
    // omitted default. The BOARD is the one thing it does roll (#685) — here the
    // roll landed on the server-default board, which sends no customMap at all.
    expect(created[0]).not.toHaveProperty("customMap");
    expect(created[0]).not.toHaveProperty("turnTimerSeconds");
    expect(created[0]).not.toHaveProperty("formatId");
  });

  it("rolls the board rather than pinning every matchmade room to one stage", async () => {
    // #685 made Random the default precisely so lobbies stop all opening on The
    // Mended Drum; a Quick Match room — which nobody hand-picks a board for —
    // must not walk that back. Roll from the duel pool, same as Create.
    const pool = randomMapPool("duel");
    jest.spyOn(Math, "random").mockReturnValue(0.99); // → last of the duel pool
    await mountPicker([]);
    await clickQuickMatch();
    expect(frames("CREATE_ROOM")[0]).toMatchObject({
      quickMatch: true,
      customMap: expect.objectContaining({ id: pool.at(-1)!.id }),
    });
  });

  it("publishes the room it just created, so the next searcher can find it", async () => {
    await mountPicker([]);
    await clickQuickMatch();
    // Nothing can be published before ROOM_CREATED — SET_VISIBILITY needs the id.
    expect(frames("SET_VISIBILITY")).toEqual([]);
    await deliver({ type: "ROOM_CREATED", roomId: "MINE", token: "tok", you: "p1" });
    // Public-by-default is the engine's half (#391); this is what makes Quick
    // Match work against the engine as deployed today, and a no-op after.
    expect(frames("SET_VISIBILITY")).toEqual([
      expect.objectContaining({ type: "SET_VISIBILITY", roomId: "MINE", public: true }),
    ]);
  });

  it("keeps the picker up while searching, then fills the P2 plate when the match lands (#1542)", async () => {
    // A join can succeed into a room that is still waiting, so ROOM_JOINED alone
    // is not "found": the opponent has to show up on the live roster.
    await mountPicker([lobby("a", 120_000)]);
    await clickQuickMatch();
    expect(dock("quick-match-searching")).toBeInTheDocument();
    expect(screen.getByTestId("p2-plate-status")).toHaveTextContent("Searching…");
    // The roster is still there to browse — only the dock buttons were swapped.
    expect(screen.getByTestId("pro-roster-scroll")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-match")).not.toBeInTheDocument();

    await deliver({ type: "ROOM_JOINED", roomId: "a", token: "tok", you: "p2" });
    expect(dock("quick-match-searching")).toBeInTheDocument();

    await deliver({
      type: "ROOM_STATUS",
      roomId: "a",
      formatId: "duel",
      requiredPlayers: 2,
      matchedVia: "lobby",
      xpMultiplier: 2,
      seats: [
        { player: "p1", heroId: HERO, connected: true, bot: null, displayName: "Moritz" },
        { player: "p2", heroId: HERO, connected: true, bot: null },
      ],
    });
    expect(screen.queryByTestId("quick-match-searching")).not.toBeInTheDocument();
    const found = dock("quick-match-found");
    expect(found).toHaveTextContent("Match found · Moritz");
    expect(found).toHaveTextContent("King Kong");
    expect(dock("quick-match-found-xp")).toHaveTextContent("2× XP match");
    const p2 = screen.getByTestId("p2-plate-status");
    expect(p2).toHaveTextContent("King Kong");
    expect(p2).toHaveAttribute("data-found", "true");
  });

  it("says nothing about a multiplier when the room locked none in", async () => {
    await mountPicker([lobby("a", 120_000)]);
    await clickQuickMatch();
    await deliver({ type: "ROOM_JOINED", roomId: "a", token: "tok", you: "p2" });
    await deliver({
      type: "ROOM_STATUS",
      roomId: "a",
      formatId: "duel",
      requiredPlayers: 2,
      seats: [
        { player: "p1", heroId: HERO, connected: true, bot: null },
        { player: "p2", heroId: HERO, connected: true, bot: null },
      ],
    });
    expect(dock("quick-match-found")).toHaveTextContent("Match found · Anonymous");
    expect(dock("quick-match-found-xp")).toBeEmptyDOMElement();
  });

  it("stops the search on an error that is NOT a race", async () => {
    await mountPicker([lobby("a", 120_000)]);
    await clickQuickMatch();
    await deliver({ type: "ERROR", code: "UNKNOWN_HERO", message: "no such hero" });
    // No second join, no create — a real error is the player's to see.
    expect(frames("JOIN_ROOM").map((m) => m.roomId)).toEqual(["a"]);
    expect(frames("CREATE_ROOM")).toEqual([]);
  });
});

describe("the Quick Match searching panel (#1542)", () => {
  const reachOwnTable = async (lobbies: LobbyListing[] = []) => {
    await mountPicker(lobbies);
    await clickQuickMatch();
    await deliver({ type: "ROOM_CREATED", roomId: "MINE", token: "tok", you: "p1" });
  };

  it("replaces only the dock buttons, and offers invite, chime, bot and cancel", async () => {
    await reachOwnTable();
    expect(dock("quick-match-searching")).toHaveTextContent("Finding a match");
    expect(screen.queryByTestId("pro-create-button")).not.toBeInTheDocument();
    expect(dock("quick-match-invite")).toBeInTheDocument();
    expect(dock("lobby-sound-toggle")).toBeInTheDocument();
    expect(dock("quick-match-bot")).toBeInTheDocument();
    expect(dock("quick-match-cancel")).toBeInTheDocument();
    // The old full-screen waiting room is gone for Quick Match.
    expect(screen.queryByText(/ROOM MINE/)).not.toBeInTheDocument();
  });

  it("counts the other people searching, excluding our own room", async () => {
    await reachOwnTable();
    expect(dock("quick-match-searching")).toHaveTextContent(/No one else is searching right now/);
    await deliver({
      type: "LOBBIES",
      lobbies: [lobby("MINE", 1_000), lobby("someone", 2_000), lobby("else", 3_000)],
    });
    expect(dock("quick-match-searching")).toHaveTextContent("2 others are waiting too.");
    // …and the ribbon never offers our own table back to us.
    expect(screen.getAllByTestId("ribbon-lobby").map((c) => c.getAttribute("data-room"))).toEqual(["else", "someone"]);
  });
});

describe("the Here now ribbon (#1542)", () => {
  it("renders a bare listing (today's engine) as an Anonymous gold chip, no 2× anywhere", async () => {
    await mountPicker([lobby("aaa", 60_000)]);
    const chip = await screen.findByTestId("ribbon-lobby");
    expect(chip).toHaveTextContent("Anonymous");
    expect(chip).toHaveTextContent("King Kong · 1m 00s");
    expect(chip).not.toHaveTextContent("XP");
    expect(screen.queryByTestId("ribbon-bonus")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-match-bonus")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bonus-summary")).not.toBeInTheDocument();
    // No presence socket answered: the pill reads "looking" alone.
    const pill = screen.getByTestId("presence-pill");
    expect(pill).toHaveTextContent("1 looking");
    expect(pill).not.toHaveTextContent("here");
    expect(screen.getByTestId("quick-match-subline")).toHaveTextContent("1 looking right now");
    // The old strip under the picker is gone.
    expect(screen.queryByText(/Open lobbies — join someone waiting/)).not.toBeInTheDocument();
  });

  it("renders the #391 enrichments when the server sends them", async () => {
    await mountPicker([
      { ...lobby("bbb", 60_000), turnTimerSeconds: 45, host: { displayName: "Dean" } },
    ]);
    const chip = await screen.findByTestId("ribbon-lobby");
    expect(chip).toHaveTextContent("Dean");
    expect(chip).toHaveTextContent("⏱ 45s");
  });

  it("is absent, not an empty box, with nothing to show", async () => {
    await mountPicker([]);
    expect(screen.queryByTestId("lobby-ribbon")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-match-subline")).toHaveTextContent("no one waiting");
  });

  it("Join routes through ?room= with the current fighter kept", async () => {
    await mountPicker([lobby("aaa", 60_000)]);
    const join = await screen.findByRole("button", { name: /Join Anonymous/ });
    await act(async () => {
      fireEvent.click(join);
    });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ room: "aaa", hero: HERO }) }),
      undefined,
      { shallow: true },
    );
  });

  it("marks the roster tile a lobby host is playing with their pip", async () => {
    await mountPicker([{ ...lobby("aaa", 60_000), host: { displayName: "Kay" } }]);
    expect(await screen.findByTestId("roster-pip")).toHaveTextContent("K");
  });
});

describe("the lobby socket (#1542 ↔ engine #1034)", () => {
  const lobbySocket = () => {
    const sock = FakeWebSocket.instances.find((w) => w.url.endsWith("/lobby"));
    if (!sock) throw new Error("the picker never opened the lobby socket");
    return sock;
  };
  const openLobby = async () => {
    const sock = lobbySocket();
    await act(async () => {
      sock.readyState = FakeWebSocket.OPEN;
      sock.onopen?.({});
    });
    return sock;
  };
  const snapshot = (sock: FakeWebSocket, extra: Record<string, unknown> = {}) =>
    act(async () => {
      sock.onmessage?.({
        data: JSON.stringify({
          v: 1,
          type: "SNAPSHOT",
          you: "me",
          here: 3,
          looking: 1,
          players: [
            { id: "me", state: "picking", sinceMs: 1_000 },
            { id: "sam", state: "picking", sinceMs: 5_000, displayName: "Sam_B" },
          ],
          lobbies: [lobby("aaa", 60_000)],
          tablesInPlay: 1,
          ...extra,
        }),
      });
    });

  it("says HELLO once the game socket is up, and fills the pill and ribbon from SNAPSHOT", async () => {
    await mountPicker([]);
    const sock = await openLobby();
    expect(frames("HELLO")).toEqual([expect.objectContaining({ v: 1, type: "HELLO", state: "picking", heroId: HERO })]);
    await snapshot(sock);
    expect(screen.getByTestId("presence-pill")).toHaveTextContent("3 here · 1 looking");
    expect(screen.getAllByTestId("ribbon-lobby")).toHaveLength(1);
    const player = screen.getByTestId("ribbon-player");
    expect(player).toHaveTextContent("Sam_B");
    expect(player).toHaveTextContent("picking a fighter…");
    expect(screen.getByTestId("ribbon-tail")).toHaveTextContent("1 table in play");
    // Our own presence entry is never a chip.
    expect(screen.getAllByTestId("ribbon-player")).toHaveLength(1);
  });

  it("sends NUDGE on 👋", async () => {
    await mountPicker([]);
    const sock = await openLobby();
    await snapshot(sock);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wave at Sam_B" }));
    });
    expect(frames("NUDGE")).toEqual([{ v: 1, type: "NUDGE", to: "sam" }]);
  });

  it("puts 2× on the ribbon, Quick Match, every Join and the summary during the bonus", async () => {
    await mountPicker([]);
    const sock = await openLobby();
    await snapshot(sock, { bonus: { multiplier: 2, endsAt: new Date(Date.now() + 86_400_000).toISOString() } });
    expect(screen.getByTestId("ribbon-bonus")).toHaveTextContent("2×");
    expect(screen.getByTestId("quick-match-bonus")).toHaveTextContent("2× XP");
    expect(screen.getByRole("button", { name: /Join Anonymous/ })).toHaveTextContent("2× XP");
    expect(screen.getByTestId("bonus-summary")).toHaveTextContent("Quick Match pays 2× XP · Create room is 1×");
  });

  it("ignores an expired bonus", async () => {
    await mountPicker([]);
    const sock = await openLobby();
    await snapshot(sock, { bonus: { multiplier: 2, endsAt: new Date(Date.now() - 1_000).toISOString() } });
    expect(screen.queryByTestId("quick-match-bonus")).not.toBeInTheDocument();
  });

  it("stays up through a Quick Match search, as `searching`, so the dock keeps its counts", async () => {
    await mountPicker([]);
    const sock = await openLobby();
    await snapshot(sock);
    await clickQuickMatch();
    expect(sock.readyState).toBe(FakeWebSocket.OPEN);
    expect(frames("STATE").at(-1)).toMatchObject({ v: 1, type: "STATE", state: "searching" });
    // The server now counts us as a watcher AND as our own listed lobby: once here.
    await snapshot(sock, {
      here: 4,
      players: [
        { id: "me", state: "searching", sinceMs: 1_000 },
        { id: "sam", state: "picking", sinceMs: 5_000, displayName: "Sam_B" },
      ],
      lobbies: [lobby("aaa", 60_000), lobby("MINE", 1_000)],
    });
    expect(screen.getByTestId("presence-pill")).toHaveTextContent("3 here");
  });
});
