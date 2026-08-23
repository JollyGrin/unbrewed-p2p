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
    replace: async () => true,
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

  it("shows the waiting room — not 'trying lobby 1 of 1' — once a join LANDS", async () => {
    // Caught in a real browser: a join can succeed into a room that is still
    // waiting (a reconnect to our own room, or a format needing a third seat).
    // No STATE is coming until it fills, so gating the search screen on the
    // candidate list alone parks the player on "searching" forever.
    await mountPicker([lobby("a", 120_000)]);
    await clickQuickMatch();
    expect(screen.getByText(/SEARCHING FOR AN OPPONENT/i)).toBeInTheDocument();
    await deliver({ type: "ROOM_JOINED", roomId: "a", token: "tok", you: "p2" });
    expect(screen.queryByText(/SEARCHING FOR AN OPPONENT/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ROOM a/i)).toBeInTheDocument();
    expect(screen.getByTestId("quick-match-bot")).toBeInTheDocument();
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

describe("the Quick Match waiting screen", () => {
  const reachWaitingRoom = async (lobbies: LobbyListing[] = []) => {
    await mountPicker(lobbies);
    await clickQuickMatch();
    await deliver({ type: "ROOM_CREATED", roomId: "MINE", token: "tok", you: "p1" });
  };

  it("says it is searching, and offers the invite link and the bot fallback", async () => {
    await reachWaitingRoom();
    expect(screen.getByTestId("quick-match-searching")).toBeInTheDocument();
    expect(screen.getByText(/Waiting\? Invite a friend directly/i)).toBeInTheDocument();
    expect(screen.getByText("copy link")).toBeInTheDocument();
    expect(screen.getByTestId("quick-match-bot")).toBeInTheDocument();
  });

  it("counts the other people searching, excluding our own room", async () => {
    await reachWaitingRoom();
    expect(screen.getByText(/no one else is searching right now/i)).toBeInTheDocument();
    // Our own room is listed publicly now; only the other two count.
    await deliver({
      type: "LOBBIES",
      lobbies: [lobby("MINE", 1_000), lobby("someone", 2_000), lobby("else", 3_000)],
    });
    expect(screen.getByText(/2 other players are waiting/i)).toBeInTheDocument();
  });
});

describe("the open-lobbies strip", () => {
  it("renders a bare listing exactly as it always has", async () => {
    await mountPicker([lobby("aaa", 60_000)]);
    expect(await screen.findByText(/vs King Kong · room aaa/)).toBeInTheDocument();
  });

  it("renders the #391 enrichments when the server sends them", async () => {
    await mountPicker([
      {
        ...lobby("bbb", 60_000),
        formatId: "team-2v2",
        turnTimerSeconds: 45,
        host: { displayName: "Dean" },
      },
    ]);
    const row = await screen.findByText(/Dean · vs King Kong/);
    expect(row).toHaveTextContent("2v2");
    expect(row).toHaveTextContent("⏱ 45s");
  });
});
