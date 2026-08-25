/**
 * Slow mode's action spotlight (issue #703), end to end through the REAL Pro
 * game page.
 *
 * The player report this comes from: "when an AI opponent does anything, their
 * action flashes by in an instant… I'd like the card and details to pop up and
 * let me click OK." The unit tests pin the queue's flush rules; what only a
 * mounted page can prove is the part the player actually sees — that the panel
 * appears for an opponent's action, that it says what the ACTIVITY LOG says
 * (never a second, divergent narration), that OK advances one action at a time,
 * and that with the toggle off the page renders exactly as it always has.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, seeded reconnect
 * token, STATE frames over a real recorded view).
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { GameEvent, PlayerView } from "@/lib/pro/protocol";
import { SLOW_MODE_KEY } from "@/lib/pro/useSlowMode";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "SLOW";

/** A real recorded seat view: the viewer is p1 (Alpha on w1); p2 is Beta on e1. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8"
  )
    .trim()
    .split("\n")[0]
).view;

/** The opponent's turn, with their hero standing wherever we say. */
const oppTurn = (betaSpace: string, over: Partial<PlayerView> = {}): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p2",
  turnPhase: "ACTION_SELECT",
  fighters: BASE_VIEW.fighters.map((f) => (f.id === "p2/hero" ? { ...f, space: betaSpace } : f)),
  ...over,
});

/** One opponent maneuver: they spend the action and their hero walks a space. */
const maneuver = (to: string): GameEvent[] => [
  { type: "ACTION_SPENT", player: "p2", action: "MANEUVER" },
  { type: "FIGHTER_MOVED", fighter: "p2/hero", path: [to] },
];

/** An opponent scheme that damages the viewer's hero — three of these in a row
 *  read as three DISTINCT log lines ("Alpha takes 1/2/3 damage"), which is what
 *  makes "the board is still on the first one" observable. */
const ALPHA_HP = 9;
const HITS = [1, 2, 3];
/** The n-th hit (0-based): the view after it, and the events that caused it. */
const hit = (n: number): { view: PlayerView; events: GameEvent[] } => {
  const dealt = HITS.slice(0, n + 1).reduce((a, b) => a + b, 0);
  return {
    view: {
      ...oppTurn("e1"),
      fighters: BASE_VIEW.fighters.map((f) =>
        f.id === "p1/hero" ? { ...f, hp: ALPHA_HP - dealt } : f
      ),
    },
    events: [
      { type: "ACTION_SPENT", player: "p2", action: "SCHEME" },
      { type: "DAMAGE_APPLIED", fighter: "p1/hero", amount: HITS[n], source: "EFFECT" },
    ],
  };
};

let SENT: string[] = [];

const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query: { room: ROOM },
    asPath: `/pro/game?room=${ROOM}`,
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

/** Mount the page and deliver the join STATE (no events — it bypasses the queue). */
const mount = async () => {
  const { container, unmount } = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterContext.Provider value={fakeRouter()}>
        <ChakraProvider theme={theme}>
          <ProGamePage />
        </ChakraProvider>
      </RouterContext.Provider>
    </QueryClientProvider>
  );
  const ws = FakeWebSocket.latest();
  if (!ws) throw new Error("the page never opened a socket");
  await act(async () => {
    ws.readyState = FakeWebSocket.OPEN;
    ws.onopen?.({});
  });
  await act(async () => {
    ws.onmessage?.({
      data: JSON.stringify({
        v: PROTOCOL_VERSION,
        type: "STATE",
        view: oppTurn("e1"),
        legalActions: [],
      }),
    });
  });
  SENT = [];
  return {
    container,
    unmount,
    state: async (view: PlayerView, events: GameEvent[]) => {
      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view, legalActions: [], events }),
        });
      });
    },
  };
};

const spotlight = () => screen.queryByTestId("action-spotlight");
/** Everything the spotlight is telling the player right now. */
const spotlightText = () => spotlight()?.textContent ?? "";
/** Let the one-snapshot-per-tick flush drain. */
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await act(async () => void jest.advanceTimersByTime(1));
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(data: string) {
    SENT.push(data);
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  jest.useFakeTimers();
  FakeWebSocket.reset();
  SENT = [];
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "slow-mode-test-token");
});

afterEach(() => {
  jest.useRealTimers();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("slow mode OFF (the default)", () => {
  it("renders no spotlight, however many opponent actions land", async () => {
    const { state } = await mount();
    await state(oppTurn("e2"), maneuver("e2"));
    await state(oppTurn("e3"), maneuver("e3"));
    expect(spotlight()).toBeNull();
  });
});

describe("slow mode ON", () => {
  beforeEach(() => window.localStorage.setItem(SLOW_MODE_KEY, "on"));

  it("holds an opponent action in a spotlight that says what the log says", async () => {
    const { container, state } = await mount();
    await state(oppTurn("e2"), maneuver("e2"));

    expect(spotlight()).not.toBeNull();
    // Labelled with the actor and the action group…
    expect(spotlightText()).toContain("Opponent");
    expect(spotlightText()).toContain("Maneuver");
    // …and described in the activity feed's OWN words for this batch, not a
    // second renderer's: the same string appears in both surfaces.
    expect(spotlightText()).toContain("Beta moved");
    expect(within(container).getAllByText("Beta moved").length).toBeGreaterThanOrEqual(2);
  });

  it("advances one action per OK, and offers Skip all while more are queued", async () => {
    const { state } = await mount();
    for (const n of [0, 1, 2]) await state(hit(n).view, hit(n).events);

    // The board is still on the FIRST of the three — that is the whole feature.
    expect(spotlightText()).toContain("1 damage");
    expect(spotlightText()).toContain("+2 more");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await settle();
    expect(spotlightText()).toContain("2 damage");
    expect(spotlightText()).toContain("+1 more");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await settle();
    expect(spotlightText()).toContain("3 damage");
    expect(spotlightText()).not.toContain("more");

    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await settle();
    expect(spotlight()).toBeNull();
  });

  it("Skip all drains the backlog and clears the panel", async () => {
    const { state } = await mount();
    for (const n of [0, 1]) await state(hit(n).view, hit(n).events);

    fireEvent.click(screen.getByText(/Skip all/));
    await settle();
    expect(spotlight()).toBeNull();
  });

  it("clicking anywhere advances too — the backdrop is the OK button", async () => {
    const { state } = await mount();
    await state(oppTurn("e2"), maneuver("e2"));
    fireEvent.click(screen.getByTestId("action-spotlight-backdrop"));
    await settle();
    expect(spotlight()).toBeNull();
  });

  it("shows the card the opponent played beside the description", async () => {
    const { state } = await mount();
    await state(oppTurn("e1"), [
      { type: "ACTION_SPENT", player: "p2", action: "SCHEME" },
      { type: "SCHEME_PLAYED", player: "p2", card: "hero-b/dodge#1" },
    ]);
    // The card slot renders through the same CardFace/resolveCard pair the hand
    // and the log's hover preview use; with no art snapshot loaded in jsdom it
    // falls back to the printed title, which is what we can assert on.
    expect(spotlightText()).toContain("Dodge");
  });

  it("leaves the cards to CombatPanel — no second reveal over a combat batch", async () => {
    const { state } = await mount();
    await state(oppTurn("e1"), [
      { type: "ATTACK_DECLARED", attacker: "p2/hero", target: "p1/hero" },
      { type: "CARDS_REVEALED", attackerCard: "hero-b/volley#1", defenderCard: null },
      { type: "COMBAT_DAMAGE", amount: 2 },
    ]);
    // The batch is still paced (the panel is up, so the bot can't yank the
    // combat reveal away) — it just doesn't draw the card a second time.
    expect(spotlight()).not.toBeNull();
    expect(spotlightText()).not.toContain("Volley");
  });

  it("never gets between the player and a prompt aimed at them", async () => {
    const { state } = await mount();
    await state(oppTurn("e2"), maneuver("e2"));
    expect(spotlight()).not.toBeNull();

    await state(
      oppTurn("e3", {
        prompt: {
          promptId: "p-defend",
          player: "p1",
          kind: "CHOOSE_SPACE",
          description: "Move this fighter 1 space",
          options: [{ id: "w2", label: "w2", data: { path: ["w1", "w2"] } }],
        },
      }),
      maneuver("e3")
    );
    await settle();

    expect(spotlight()).toBeNull();
    expect(screen.getByText("Move this fighter 1 space")).toBeInTheDocument();
  });
});

describe("the activity log is the same either way", () => {
  /** Play the identical three-action sequence and return the feed's own text. */
  const playAndReadLog = async (slow: boolean) => {
    if (slow) window.localStorage.setItem(SLOW_MODE_KEY, "on");
    const { container, state, unmount } = await mount();
    for (const n of [0, 1, 2]) await state(hit(n).view, hit(n).events);
    if (slow) {
      // Drain the queue so both runs have applied all three batches.
      fireEvent.click(screen.getByText(/Skip all/));
      await settle();
    }
    // The feed panel, found by its own header rather than a test hook — slow
    // mode must not touch ProLog's rendering in any way.
    const panel = within(container).getByText("Activity").closest("div")?.parentElement;
    if (!panel) throw new Error("no activity panel");
    const text = panel.textContent ?? "";
    unmount();
    return text;
  };

  it("logs the same lines, in the same order, with slow mode on as with it off", async () => {
    const off = await playAndReadLog(false);
    // A fresh page for the second run — same frames, same seat, slow mode on.
    FakeWebSocket.reset();
    window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "slow-mode-test-token");
    const on = await playAndReadLog(true);
    expect(on).toEqual(off);
    expect(off).toContain("3 damage"); // …and it is not vacuously empty
  });
});
