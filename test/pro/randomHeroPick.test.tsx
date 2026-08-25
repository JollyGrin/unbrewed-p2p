/**
 * The Random FIGHTER tile, end to end through the REAL Pro picker (#697).
 *
 * Same shape of promise as the Random stage tile (#685) and the same single
 * place it can be broken: the frame that leaves. Clicking the tile chooses
 * nothing — `selectedHeroId` holds a sentinel — so the things worth pinning are
 *
 *  - CREATE_ROOM / JOIN_ROOM carry a CONCRETE hero id, never the sentinel;
 *  - the roll draws from the roster the player is LOOKING AT, so the reach
 *    filter and the search box narrow it (a "random melee fighter" is those two
 *    controls plus this tile), and it goes disabled when they narrow it to
 *    nothing;
 *  - a hand-picked fighter is still sent verbatim, and the AI-hero picker's own
 *    "Random" (server-side, via an omitted `bot.heroId`) is untouched;
 *  - once the room exists the lobby NAMES the fighter that was rolled.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, real page), with
 * the roster pushed as a HEROES frame — this test lives entirely in the
 * pre-room picker.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { ClientMsg } from "@/lib/pro/protocol";
import { RANDOM_HERO_ID } from "@/lib/pro/randomHero";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const HEROES = [
  { heroId: "hero-a", name: "Ellen Ripley", hp: 12, move: 3, reach: "MELEE" },
  { heroId: "hero-b", name: "King Kong", hp: 18, move: 2, reach: "MELEE" },
  { heroId: "hero-c", name: "Robin Hood", hp: 14, move: 3, reach: "RANGED" },
];
const ALL_IDS = HEROES.map((h) => h.heroId);

const fakeRouter = (query: Record<string, string> = {}) =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query,
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
const mountPicker = async (query: Record<string, string> = {}) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter(query)}>
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

const type = async (el: Element, value: string) => {
  await act(async () => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const randomTile = () => screen.getByLabelText(/^Random fighter/);

/** Press Create and return the hero id on the CREATE_ROOM frame that went out. */
const createdHeroId = () => {
  const created = sent.filter((m) => m.type === "CREATE_ROOM");
  expect(created).toHaveLength(1);
  return (created[0] as ClientMsg & { heroId: string }).heroId;
};

const rollWith = async (value: number, query?: Record<string, string>) => {
  jest.spyOn(Math, "random").mockReturnValue(value);
  const ws = await mountPicker(query);
  return ws;
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
  document.body.innerHTML = "";
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("Random fighter tile", () => {
  it("leads the roster grid and is not selected until clicked", async () => {
    await mountPicker();
    const random = randomTile();
    expect(random).toHaveAttribute("aria-pressed", "false");
    // …and it is the FIRST tile, mirroring the stage strip
    expect(random.parentElement!.firstElementChild).toBe(random);
    // Nothing is picked yet, so Create is still asking for a fighter
    expect(screen.getByRole("button", { name: "Pick a fighter" })).toBeDisabled();

    await click(random);
    expect(randomTile()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/Ellen Ripley/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("is offered in every format, not just duel", async () => {
    await mountPicker();
    for (const format of ["3P FFA", "2v2", "Duel"]) {
      await click(screen.getByRole("button", { name: format }));
      expect(randomTile()).toBeInTheDocument();
    }
  });

  it("sends a concrete hero from the roster on create — never the sentinel", async () => {
    // One rng value per roster slot, nudged off the boundary, so the sweep both
    // stays inside the roster AND actually reaches all three fighters.
    const rolls: string[] = [];
    for (let i = 0; i < HEROES.length; i++) {
      FakeWebSocket.reset();
      sent = [];
      await rollWith((i + 0.5) / HEROES.length);
      await click(randomTile());
      await click(screen.getByRole("button", { name: "Create" }));
      rolls.push(createdHeroId());
      jest.restoreAllMocks();
      document.body.innerHTML = "";
    }
    expect(rolls).toEqual(ALL_IDS);
    expect(rolls).not.toContain(RANDOM_HERO_ID);
  }, 60_000);

  it("rolls only over the reach-filtered roster", async () => {
    await rollWith(0); // first of whatever pool survives the filter
    await click(screen.getByLabelText("Ranged fighters"));
    await click(randomTile());
    await click(screen.getByRole("button", { name: "Create" }));
    // Robin Hood is the only ranged fighter — rng=0 would otherwise give hero-a
    expect(createdHeroId()).toBe("hero-c");
  });

  it("rolls only over the search-filtered roster", async () => {
    await rollWith(0.99); // last of whatever pool survives the search
    await type(screen.getByLabelText("Search fighters"), "kong");
    await click(randomTile());
    await click(screen.getByRole("button", { name: "Create" }));
    expect(createdHeroId()).toBe("hero-b");
  });

  it("goes disabled — with Create — when the filters leave nothing to roll", async () => {
    await mountPicker();
    await click(randomTile());
    await type(screen.getByLabelText("Search fighters"), "nobody at all");
    expect(randomTile()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    await click(randomTile());
    await click(screen.getByRole("button", { name: "Create" }));
    expect(sent.filter((m) => m.type === "CREATE_ROOM")).toHaveLength(0);

    // Clearing the search brings both back
    await type(screen.getByLabelText("Search fighters"), "");
    expect(randomTile()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("names the rolled fighter in the lobby, not 'Random'", async () => {
    const ws = await rollWith(0.5); // → King Kong, the middle of three
    await click(randomTile());
    await click(screen.getByRole("button", { name: "Create" }));
    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "ROOM_CREATED",
          roomId: "ROLL",
          token: "random-hero-test-token",
          you: "p1",
        }),
      });
    });
    expect(screen.getByText(/You are King Kong 🎲/)).toBeInTheDocument();
    expect(screen.queryByText(/You are Random/)).not.toBeInTheDocument();
  });

  it("rolls on the JOIN flow too", async () => {
    const ws = await rollWith(0.99, { room: "ABCD" }); // → Robin Hood, last of three
    await click(randomTile());
    await click(screen.getByRole("button", { name: "Join" }));
    const joins = sent.filter((m) => m.type === "JOIN_ROOM") as (ClientMsg & {
      heroId: string;
      roomId: string;
    })[];
    expect(joins).toHaveLength(1);
    expect(joins[0].roomId).toBe("ABCD");
    expect(joins[0].heroId).toBe("hero-c");
    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          v: PROTOCOL_VERSION,
          type: "ROOM_JOINED",
          roomId: "ABCD",
          token: "random-hero-join-token",
          you: "p2",
        }),
      });
    });
    expect(screen.getByText(/You are Robin Hood 🎲/)).toBeInTheDocument();
  });

  it("still sends the hand-picked fighter when a tile is clicked", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99); // would roll Robin Hood
    await mountPicker();
    await click(screen.getByLabelText(/Ellen Ripley/));
    await click(screen.getByRole("button", { name: "Create" }));
    expect(createdHeroId()).toBe("hero-a");
    // …and the lobby doesn't claim it was rolled
    expect(screen.queryByText(/🎲/)).not.toBeInTheDocument();
  });

  it("leaves the AI-hero 'Random' alone — the server still picks the bot", async () => {
    await mountPicker();
    await click(screen.getByLabelText(/Ellen Ripley/));
    await click(screen.getByTestId("seat-chip-medium"));
    await click(screen.getByRole("button", { name: "Play vs AI" }));
    const created = sent.filter((m) => m.type === "CREATE_ROOM") as (ClientMsg & {
      heroId: string;
      bot?: { difficulty: string; heroId?: string };
    })[];
    expect(created).toHaveLength(1);
    expect(created[0].heroId).toBe("hero-a");
    // AI hero left on "Random" ⇒ `bot.heroId` is OMITTED, the server rolls it
    expect(created[0].bot?.difficulty).toBe("medium");
    expect(created[0].bot).not.toHaveProperty("heroId");
  });
});
