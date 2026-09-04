/**
 * The Random stage tile, end to end through the REAL Pro create flow (#685).
 *
 * The tile is a lie until create time: nothing is chosen when you click it, so
 * the only place the promise can be broken is the CREATE_ROOM frame. Two things
 * have to hold there and nowhere else:
 *
 *  - the board actually sent comes from the FORMAT'S pool — for 1v1 that's every
 *    board authored for at most four players (all fourteen of them today), and a
 *    format's pool must never leak a board that format can't seat;
 *  - a rolled board keeps the same `customMap` semantics as a clicked tile —
 *    The Mended Drum is the server's own default board and must still send NO
 *    customMap, exactly as it does when you click its card.
 *
 * And once the room exists, the lobby has to NAME the board that was rolled:
 * "Random" on the waiting screen would leave both players guessing.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, real page), with
 * the roster pushed as a HEROES frame instead of a STATE — this test lives
 * entirely in the pre-room picker.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { ClientMsg, ProMapDef } from "@/lib/pro/protocol";
import { randomMapPool } from "@/lib/pro/mapCatalog";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const HEROES = [
  { heroId: "hero-a", name: "Ellen Ripley", hp: 12, move: 3, reach: "MELEE" },
  { heroId: "hero-b", name: "King Kong", hp: 18, move: 2, reach: "MELEE" },
];

const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query: {},
    asPath: "/pro/game",
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

/** Every frame the page has sent so far, newest last. */
let sent: ClientMsg[] = [];

/** Mount the picker with a roster on the wire. */
const mountPicker = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter()}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>,
  );
  const ws = FakeWebSocket.latest();
  if (!ws) throw new Error("the page never opened a socket");
  await act(async () => {
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.({});
  });
  await act(async () => {
    ws.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, type: "HEROES", heroes: HEROES }) });
  });
  return ws;
};

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** Lock a fighter and press Create; returns the CREATE_ROOM frame that went out. */
const createRoom = async (label = "Create") => {
  await click(screen.getByLabelText(/Ellen Ripley/));
  await click(screen.getByRole("button", { name: label }));
  const created = sent.filter((m) => m.type === "CREATE_ROOM");
  expect(created).toHaveLength(1);
  return created[0] as ClientMsg & { customMap?: ProMapDef };
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(data: string) {
    sent.push(JSON.parse(data));
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  sent = [];
});

afterEach(() => {
  jest.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("Random stage tile", () => {
  it("is the default selection, ahead of every board", async () => {
    await mountPicker();
    const random = screen.getByLabelText(/^Random board/);
    expect(random).toHaveAttribute("aria-pressed", "true");
    // ...and it is the FIRST tile in the stage strip
    const strip = random.parentElement!;
    expect(strip.firstElementChild).toBe(random);
    // no board card claims the selection alongside it
    expect(screen.getByLabelText("The Mended Drum")).toHaveAttribute("aria-pressed", "false");
  });

  it("hides boards the current format can't host instead of dimming them", async () => {
    await mountPicker();
    // duel: everything is eligible, including the two duel-only boards
    expect(screen.getByLabelText("The Bog")).toBeInTheDocument();
    expect(screen.getByLabelText("USCSS Nostromo")).toBeInTheDocument();
    expect(screen.getByLabelText("Wedding Crashers")).toBeInTheDocument();
    expect(screen.queryByText(/needs \d start slots/)).not.toBeInTheDocument();

    await click(screen.getByRole("button", { name: "2v2" }));
    expect(screen.queryByLabelText("The Bog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("USCSS Nostromo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Wedding Crashers")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Island of Despair")).toBeInTheDocument();
    // Random survives the format switch — it's eligible everywhere
    expect(screen.getByLabelText(/^Random board/)).toHaveAttribute("aria-pressed", "true");
  });

  it("rolls every board in the 1v1 pool, and nothing outside it", async () => {
    const pool = randomMapPool("duel").map((e) => e.id);
    expect(pool).toHaveLength(14); // all fourteen authored boards seat <= 4 players
    const rolls: string[] = [];
    // One rng value per pool slot, nudged off the boundary, so the sweep both
    // stays inside the pool AND actually reaches all fourteen boards.
    for (let i = 0; i < pool.length; i++) {
      jest.spyOn(Math, "random").mockReturnValue((i + 0.5) / pool.length);
      FakeWebSocket.reset();
      sent = [];
      await mountPicker();
      const msg = await createRoom();
      // The Mended Drum (the server-default board) sends no customMap at all.
      rolls.push(msg.customMap?.id ?? "mended-drum");
      jest.restoreAllMocks();
      document.body.innerHTML = "";
    }
    expect(rolls).toEqual(pool);
    // Fourteen full page mounts: slow on purpose (this is the REAL create flow),
    // and well past Jest's 5s default once coverage instrumentation is on.
  }, 60_000);

  it("keeps the server-default board's no-customMap wire when it is the one rolled", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0); // → The Mended Drum
    await mountPicker();
    const msg = await createRoom();
    expect(msg.customMap).toBeUndefined();
  });

  it("sends the full board for a rolled non-default board", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99); // → last of the duel pool
    await mountPicker();
    const msg = await createRoom();
    expect(msg.customMap?.id).toBe(randomMapPool("duel").at(-1)!.id);
  });

  it("names the rolled board in the lobby, not 'Random'", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.25); // → Polus, the 4th of 14
    const ws = await mountPicker();
    await createRoom();
    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "ROOM_CREATED",
          roomId: "ROLL",
          token: "random-stage-test-token",
          you: "p1",
        }),
      });
    });
    expect(screen.getByText(/playing on Polus/)).toBeInTheDocument();
    expect(screen.queryByText(/playing on Random/)).not.toBeInTheDocument();
  });

  it("still sends the hand-picked board when a board is clicked", async () => {
    // Clicking a card must override the Random default and send that board.
    await mountPicker();
    await click(screen.getByLabelText("Count's Castle"));
    const msg = await createRoom();
    expect(msg.customMap?.id).toBe("counts-castle");
  });
});
