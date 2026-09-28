/**
 * One-tap rematch through the REAL Pro game page (#876).
 *
 * Three wiring bugs the pure lib/pro/rematch.ts tests can't see on their own:
 *  1. a rematch link that has fired must leave the URL — left beside `room=`, a
 *     refresh read it as a fresh rematch and CREATE_ROOMed an empty new room;
 *     and a URL that already names a room must RECONNECT, never create;
 *  2. the Rematch button needs no ROOM_STATUS roster — a bot room never gets
 *     one, and neither does a mid-game RECONNECT, so vs bot it never showed;
 *  3. an items-off game rematches items-off.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, fake router,
 * seeded reconnect token), as in faceUpCommit / quickMatch.
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
import type { PlayerView, ReplayBundle } from "@/lib/pro/protocol";
import { setRoomBots } from "@/lib/pro/recentRooms";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

type Query = Record<string, string>;

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

const sentOfType = (type: string) => SENT.filter((m) => m.type === type);

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
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("a rematch link firing (#876 part 1 + 3)", () => {
  const LINK: Query = { rematch: "1", hero: "king-kong", bots: "p2:medium:COUNT", items: "0", debug: "" };

  it("creates the room once — vs the same AI, items off — and strips its own params off the URL", async () => {
    await mount(LINK);

    const creates = sentOfType("CREATE_ROOM");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ heroId: "king-kong", bot: { difficulty: "medium", heroId: "COUNT" }, itemsEnabled: false });

    // The URL loses every rematch key (keeping unrelated ones like ?debug)…
    expect(replaceCalls.length).toBeGreaterThan(0);
    expect(replaceCalls[0].query).toEqual({ debug: "" });

    // …and the room id that lands next is written without them too.
    await deliver({ type: "ROOM_CREATED", roomId: "NEW1", token: "tok", you: "p1" });
    const last = replaceCalls[replaceCalls.length - 1].query;
    expect(last.room).toBe("NEW1");
    expect(last.rematch).toBeUndefined();
  });

  it("a URL that names a room RECONNECTs even with a stale rematch=1 beside it", async () => {
    window.sessionStorage.setItem("unbrewed-pro-token-NEW1", "tok"); // this tab's own seat
    // An ALREADY-open socket, so every frame the page asks for really goes out:
    // with a connecting one, the hook's onopen prefers the RECONNECT and would
    // quietly swallow a queued CREATE_ROOM, hiding the bug.
    class OpenSocket extends FakeWebSocket {
      readyState = FakeWebSocket.OPEN;
    }
    const g = globalThis as unknown as { WebSocket: unknown };
    const w = window as unknown as { WebSocket: unknown };
    const prev = g.WebSocket;
    g.WebSocket = w.WebSocket = OpenSocket;
    try {
      await mount({ ...LINK, room: "NEW1" });
    } finally {
      g.WebSocket = w.WebSocket = prev;
    }
    expect(sentOfType("CREATE_ROOM")).toHaveLength(0);
    // (mount() fires onopen again on the already-open socket, so the RECONNECT
    // may go out twice — both to the same seat.)
    const reconnects = sentOfType("RECONNECT");
    expect(reconnects.length).toBeGreaterThan(0);
    for (const r of reconnects) expect(r).toMatchObject({ roomId: "NEW1", token: "tok" });
  });
});

describe("the Rematch button vs bot after a mid-game reload (#876 part 2)", () => {
  const bundle = (): ReplayBundle =>
    ({
      v: 1,
      engine: { schemaVersion: 1, dslVersion: "0" },
      config: {
        seed: 7,
        formatId: "duel",
        options: { mulligan: true, itemsDisabled: true },
        players: {
          p1: { heroId: "king-kong", hero: {}, cards: [] },
          p2: { heroId: "COUNT", hero: {}, cards: [] },
        },
        map: BASE_VIEW.map,
      },
      actionLog: [],
      meta: { winner: "p1", heroes: { p1: "king-kong", p2: "COUNT" }, turns: 3, endedAt: 0, mapTitle: "x" },
    }) as unknown as ReplayBundle;

  it("shows a Rematch link seeding the same AI + items-off, with no ROOM_STATUS ever sent", async () => {
    // What this browser recorded when it created the bot room, before the reload.
    setRoomBots("BOT1", { p2: "hard" });
    window.sessionStorage.setItem("unbrewed-pro-token-BOT1", "tok");
    await mount({ room: "BOT1" });
    expect(sentOfType("RECONNECT")).toHaveLength(1);

    await deliver({ type: "ROOM_JOINED", roomId: "BOT1", token: "tok", you: "p1" });
    await deliver({
      type: "STATE",
      view: { ...BASE_VIEW, you: "p1", phase: "GAME_OVER", winner: "p1", prompt: null },
      legalActions: [],
      events: [],
    });
    await deliver({ type: "REPLAY_BUNDLE", bundle: bundle() });

    const links = screen.getAllByRole("link", { name: /rematch/i, hidden: true });
    expect(links.length).toBeGreaterThan(0);
    const href = new URL(links[0].getAttribute("href")!, "http://x");
    expect(href.searchParams.get("rematch")).toBe("1");
    expect(href.searchParams.get("hero")).toBe("king-kong");
    expect(href.searchParams.get("bots")).toBe("p2:hard:COUNT");
    expect(href.searchParams.get("items")).toBe("0");
    expect(href.searchParams.get("joinHero")).toBeNull();
  });
});
