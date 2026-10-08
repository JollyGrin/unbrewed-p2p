/**
 * Rematch offer/confirm through the REAL Pro game page (p2p #880, engine #607).
 *
 * The hook + winner screen wiring the pure reducer tests can't see: which `v`
 * each bind goes out at (34 unless the engine's own frames said 35), the
 * game-over re-bind at v35, the frames Rematch / Accept / Decline / Cancel
 * send, the notices, the new room's token on REMATCH_READY — and that a v34
 * engine or a vs-AI room keeps the one-tap link. Harness as rematchRefresh.
 */
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { resetEngineVersions } from "@/lib/pro/wireVersion";
import { PRO_WS_URL } from "@/lib/pro/wsUrl";
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

// The `v` this tab binds a seat at — PROTOCOL_VERSION unless a test plays an
// older client against an older engine window.
let mockBindV: number | null = null;
jest.mock("../../lib/pro/wireVersion", () => {
  const actual = jest.requireActual("../../lib/pro/wireVersion");
  return { ...actual, wireVersionFor: (url: string) => mockBindV ?? actual.wireVersionFor(url) };
});

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

// `v` is what the ENGINE stamps on its frames. Since engine #754 an engine accepts only
// the accepted window ({36, 37} since engine #755), so this client always binds at PROTOCOL_VERSION — #1201.
let ENGINE_V = PROTOCOL_VERSION;
const deliver = async (msg: Record<string, unknown>) => {
  const socket = FakeWebSocket.latest();
  if (!socket) throw new Error("the page never opened a socket");
  await act(async () => {
    socket.onmessage?.({ data: JSON.stringify({ v: ENGINE_V, ...msg }) });
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
  resetEngineVersions();
  ENGINE_V = PROTOCOL_VERSION;
  mockBindV = null;
  window.sessionStorage.clear();
  window.localStorage.clear();
});


const PVP_BUNDLE = (): ReplayBundle =>
  ({
    v: 1,
    engine: { schemaVersion: 1, dslVersion: "0" },
    config: {
      seed: 7,
      formatId: "duel",
      options: { mulligan: true },
      players: {
        p1: { heroId: "king-kong", hero: {}, cards: [] },
        p2: { heroId: "COUNT", hero: {}, cards: [] },
      },
      map: BASE_VIEW.map,
    },
    actionLog: [],
    meta: { winner: "p1", heroes: { p1: "king-kong", p2: "COUNT" }, turns: 3, endedAt: 0, mapTitle: "x" },
  }) as unknown as ReplayBundle;

/**
 * Mount seated in finished room OLD1 as `you`, and play the game-over frames.
 * `bots` is what this browser recorded for the room — `{}` for PvP, as the
 * ROOM_STATUS handler writes it when the other player joins.
 */
const finishGame = async (you: "p1" | "p2", opts: { bots?: Record<string, string> | null } = {}) => {
  const bots = opts.bots === undefined ? {} : opts.bots;
  if (bots) setRoomBots("OLD1", bots as never);
  window.sessionStorage.setItem("unbrewed-pro-token-OLD1", `tok-${you}`);
  await mount({ room: "OLD1" });
  await deliver({ type: "HEROES", heroes: [] });
  await deliver({ type: "ROOM_JOINED", roomId: "OLD1", token: `tok-${you}`, you });
  await deliver({
    type: "STATE",
    view: { ...BASE_VIEW, you, phase: "GAME_OVER", winner: "p1", prompt: null },
    legalActions: [],
    events: [],
  });
  await deliver({ type: "REPLAY_BUNDLE", bundle: PVP_BUNDLE() });
};

const rematchButton = () => screen.getAllByRole("button", { name: /rematch — same setup/i, hidden: true })[0];
const statusText = () => screen.getAllByRole("status", { hidden: true }).map((n) => n.textContent ?? "");

describe("against an engine at the current PROTOCOL_VERSION", () => {

  it("a first visit binds at PROTOCOL_VERSION straight away and never re-binds at game over", async () => {
    await finishGame("p1");
    expect(sentOfType("RECONNECT")).toEqual([{ v: PROTOCOL_VERSION, type: "RECONNECT", roomId: "OLD1", token: "tok-p1" }]);
    expect(SENT.every((m) => m.v === PROTOCOL_VERSION)).toBe(true);
  });

  it("a refresh mid-offer binds at PROTOCOL_VERSION at once and shows the waiting offer again — no replay bundle needed", async () => {
    window.sessionStorage.setItem("unbrewed-pro-engine-v-" + FakeWebSocketUrl(), "36");
    window.sessionStorage.setItem("unbrewed-pro-token-OLD1", "tok-p1");
    setRoomBots("OLD1", {});
    await mount({ room: "OLD1" });
    expect(sentOfType("RECONNECT")).toEqual([{ v: PROTOCOL_VERSION, type: "RECONNECT", roomId: "OLD1", token: "tok-p1" }]);
    await deliver({ type: "ROOM_JOINED", roomId: "OLD1", token: "tok-p1", you: "p1" });
    await deliver({
      type: "STATE",
      view: { ...BASE_VIEW, you: "p1", phase: "GAME_OVER", winner: "p1", prompt: null },
      legalActions: [],
      events: [],
    });
    // The engine re-sends the open offer, `from` ourselves; it sends no second REPLAY_BUNDLE.
    await deliver({ type: "REMATCH_OFFERED", from: "p1" });
    expect(statusText().join(" ")).toMatch(/Waiting for Opponent to accept/);
    fireEvent.click(screen.getAllByRole("button", { name: /^cancel$/i, hidden: true })[0]);
    expect(sentOfType("REMATCH_CANCEL")).toHaveLength(1);
  });

  it("Rematch asks the opponent; Cancel withdraws", async () => {
    await finishGame("p1");
    expect(screen.queryAllByRole("link", { name: /rematch/i, hidden: true })).toHaveLength(0);
    fireEvent.click(rematchButton());
    expect(sentOfType("REMATCH_OFFER")).toEqual([{ v: PROTOCOL_VERSION, type: "REMATCH_OFFER", roomId: "OLD1" }]);
    expect(statusText().join(" ")).toMatch(/Waiting for Opponent to accept/);

    fireEvent.click(screen.getAllByRole("button", { name: /^cancel$/i, hidden: true })[0]);
    expect(sentOfType("REMATCH_CANCEL")).toEqual([{ v: PROTOCOL_VERSION, type: "REMATCH_CANCEL", roomId: "OLD1" }]);
    expect(rematchButton()).toBeTruthy();
  });

  it("a double tap on Rematch sends one offer", async () => {
    await finishGame("p1");
    const button = rematchButton();
    // Both taps land before React re-renders the button away.
    await act(async () => {
      button.click();
      button.click();
    });
    expect(sentOfType("REMATCH_OFFER")).toHaveLength(1);
  });

  it("the requester sees a decline, and the button comes back", async () => {
    await finishGame("p1");
    fireEvent.click(rematchButton());
    await deliver({ type: "REMATCH_CLOSED", reason: "declined", player: "p2" });
    expect(statusText().join(" ")).toMatch(/Opponent declined the rematch/);
    expect(rematchButton()).toBeTruthy();
  });

  it("the requester sees the opponent leave", async () => {
    await finishGame("p1");
    fireEvent.click(rematchButton());
    await deliver({ type: "REMATCH_CLOSED", reason: "disconnected", player: "p2" });
    expect(statusText().join(" ")).toMatch(/Opponent left/);
  });

  it("an offer refused because the opponent's client is too old says so — never the error screen", async () => {
    await finishGame("p1");
    fireEvent.click(rematchButton());
    await deliver({ type: "ERROR", code: "REMATCH_UNAVAILABLE", message: "Another player's client cannot answer a rematch offer" });
    expect(statusText().join(" ")).toMatch(/Your opponent needs to refresh to rematch/);
    expect(rematchButton()).toBeTruthy();
    expect(screen.getAllByText(/VICTORY!/).length).toBeGreaterThan(0);
  });

  it("the other player gets Accept / Decline; Accept answers yes and READY seats it in the new room", async () => {
    await finishGame("p2");
    await deliver({ type: "REMATCH_OFFERED", from: "p1" });
    expect(statusText().join(" ")).toMatch(/Opponent wants a rematch, same setup/);
    fireEvent.click(screen.getAllByRole("button", { name: /^accept$/i, hidden: true })[0]);
    expect(sentOfType("REMATCH_RESPOND")).toEqual([{ v: PROTOCOL_VERSION, type: "REMATCH_RESPOND", roomId: "OLD1", accept: true }]);

    await deliver({ type: "REMATCH_READY", roomId: "NEW1", token: "tok-new" });
    expect(window.sessionStorage.getItem("unbrewed-pro-token-NEW1")).toBe("tok-new");
    expect(statusText().join(" ")).toMatch(/Starting the rematch/);
    // Never a ?rematch= CREATE_ROOM.
    expect(sentOfType("CREATE_ROOM")).toHaveLength(0);
  });

  it("Decline answers no", async () => {
    await finishGame("p2");
    await deliver({ type: "REMATCH_OFFERED", from: "p1" });
    fireEvent.click(screen.getAllByRole("button", { name: /^decline$/i, hidden: true })[0]);
    expect(sentOfType("REMATCH_RESPOND")).toEqual([{ v: PROTOCOL_VERSION, type: "REMATCH_RESPOND", roomId: "OLD1", accept: false }]);
    expect(rematchButton()).toBeTruthy();
  });

  it("a READY naming the room this tab already sits in is ignored", async () => {
    await finishGame("p1");
    fireEvent.click(rematchButton());
    await deliver({ type: "REMATCH_READY", roomId: "OLD1", token: "other" });
    expect(window.sessionStorage.getItem("unbrewed-pro-token-OLD1")).toBe("tok-p1");
    expect(statusText().join(" ")).toMatch(/Waiting for Opponent/);
  });

  it("bot seats never recorded in this browser: the link, not a question the engine would refuse", async () => {
    await finishGame("p1", { bots: null });
    expect(screen.getAllByRole("link", { name: /rematch/i, hidden: true }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /rematch — same setup/i, hidden: true })).toHaveLength(0);
  });

  it("vs bot keeps the one-tap link (nobody to ask)", async () => {
    await finishGame("p1", { bots: { p2: "hard" } });
    expect(screen.getAllByRole("link", { name: /rematch/i, hidden: true }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: /rematch — same setup/i, hidden: true })).toHaveLength(0);
  });
});

// A fake engine with a two-version window: every frame outside it is answered
// ERROR{VERSION}, as the real engine does. The tournaments engine takes {36, 37};
// main's takes {35, 36}, where this client would bind at 36.
describe.each([
  { window: [36, 37], bindV: PROTOCOL_VERSION },
  { window: [35, 36], bindV: 36 },
])("rematch frames against an engine accepting $window", ({ window: accepted, bindV }) => {
  beforeEach(() => {
    mockBindV = bindV;
    ENGINE_V = Math.max(...accepted);
  });

  /** Answer the seat bind and every REMATCH_* frame outside the window the way the
   *  engine does, and return the refused ones. Only those: the other frames carry
   *  this build's PROTOCOL_VERSION, which a {35, 36} engine pairs with an older build. */
  const engineScreens = async () => {
    const screened = SENT.filter((m) => m.type === "RECONNECT" || String(m.type).startsWith("REMATCH_"));
    const refused = screened.filter((m) => !accepted.includes(m.v as number));
    for (const _ of refused) await deliver({ type: "ERROR", code: "VERSION", message: "unsupported protocol version" });
    return refused;
  };
  const lostScreen = () => screen.queryAllByText(/We lost your game/i);

  it("offer, cancel and a completed rematch all go out at the bound version", async () => {
    await finishGame("p1");
    expect(sentOfType("RECONNECT")).toMatchObject([{ v: bindV }]);
    fireEvent.click(rematchButton());
    expect(sentOfType("REMATCH_OFFER")).toEqual([{ v: bindV, type: "REMATCH_OFFER", roomId: "OLD1" }]);
    expect(await engineScreens()).toEqual([]);
    await deliver({ type: "REMATCH_OFFERED", from: "p1" });
    fireEvent.click(screen.getAllByRole("button", { name: /^cancel$/i, hidden: true })[0]);
    expect(sentOfType("REMATCH_CANCEL")).toEqual([{ v: bindV, type: "REMATCH_CANCEL", roomId: "OLD1" }]);
    expect(await engineScreens()).toEqual([]);
    await deliver({ type: "REMATCH_CLOSED", reason: "cancelled", player: "p1" });

    fireEvent.click(rematchButton());
    expect(await engineScreens()).toEqual([]);
    await deliver({ type: "REMATCH_OFFERED", from: "p1" });
    await deliver({ type: "REMATCH_READY", roomId: "NEW1", token: "tok-new" });
    expect(statusText().join(" ")).toMatch(/Starting the rematch/);
    expect(window.sessionStorage.getItem("unbrewed-pro-token-NEW1")).toBe("tok-new");
    expect(lostScreen()).toHaveLength(0);
  });

  it("the answer to an offer goes out at the bound version and the rematch starts", async () => {
    await finishGame("p2");
    await deliver({ type: "REMATCH_OFFERED", from: "p1" });
    fireEvent.click(screen.getAllByRole("button", { name: /^accept$/i, hidden: true })[0]);
    expect(sentOfType("REMATCH_RESPOND")).toEqual([{ v: bindV, type: "REMATCH_RESPOND", roomId: "OLD1", accept: true }]);
    expect(await engineScreens()).toEqual([]);
    await deliver({ type: "REMATCH_READY", roomId: "NEW1", token: "tok-new" });
    expect(statusText().join(" ")).toMatch(/Starting the rematch/);
    expect(lostScreen()).toHaveLength(0);
  });
});

describe("an engine that refuses a rematch frame's version", () => {
  it("fails the offer with a short notice and keeps the finished game on screen", async () => {
    await finishGame("p1");
    fireEvent.click(rematchButton());
    await deliver({ type: "ERROR", code: "VERSION", message: "unsupported protocol version" });
    expect(screen.queryAllByText(/We lost your game/i)).toHaveLength(0);
    expect(screen.getAllByText(/VICTORY!/).length).toBeGreaterThan(0);
    expect(statusText().join(" ")).toMatch(/Rematch unavailable/);
    expect(rematchButton()).toBeTruthy();
  });

  it("a VERSION error with no rematch frame out still takes the terminal path", async () => {
    await finishGame("p1");
    await deliver({ type: "ERROR", code: "VERSION", message: "unsupported protocol version" });
    expect(screen.queryAllByText(/We lost your game/i).length).toBeGreaterThan(0);
  });
});

function FakeWebSocketUrl(): string {
  return PRO_WS_URL;
}
