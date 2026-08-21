/**
 * Incremental EFFECT movement, end to end through the REAL Pro game page
 * (issue #654 ↔ engine #411).
 *
 * `moveSteps.test.ts` pins the state machine and `ProBoard.test.tsx` the click
 * targets; what neither can see is the wiring in `pages/pro/game.tsx` — which
 * clicks walk the ghost, which ones answer the prompt, and WHAT goes on the wire
 * when the route commits. So this mounts the actual page (the render-fuzz mount
 * recipe: a fake WebSocket, a seeded reconnect token, one STATE frame) over a
 * real recorded view, injects a `CHOOSE_SPACE` move prompt carrying a
 * `moveGraph`, and drives it by clicking board circles.
 *
 * The claim under test is the ticket's whole point: the route the player WALKS is
 * the route that reaches the server — `RESPOND_PROMPT{optionId, path}` — because
 * the "each fighter it moved through" cards (Chicken Legs, Stampede, Batman,
 * Keaton) read that path. One committed answer, one message.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { MoveGraph, PlayerView, SpaceId, ViewPrompt } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "STEP";

/** A real recorded seat view (map, catalog, hands, plates) to hang the prompt on. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

// p1/hero stands on w1. Its corner of the recorded map:
//   w1 — w2, w3, w4        w2 — w1, w4, w5, nw        w4 — w1, w2, w3, c4
// "Move up to 3 spaces": every neighbour within reach is offered EXCEPT w1
// itself (the mover's own space is never `canStop` — that is the `decline`
// option), and the graph carries the directed single steps among them.
const NODES: [SpaceId, boolean][] = [
  ["w1", false], // origin
  ["w2", true],
  ["w3", true],
  ["w4", true],
  ["w5", true],
];
const LINKS: [SpaceId, SpaceId][] = [
  ["w1", "w2"],
  ["w1", "w3"],
  ["w1", "w4"],
  ["w2", "w4"],
  ["w2", "w5"],
  ["w3", "w4"],
];
const GRAPH: MoveGraph = {
  fighter: "p1/hero",
  allowance: 3,
  nodes: NODES.map(([space, canStop]) => ({ space, canStop })),
  edges: LINKS.flatMap(([a, b]): [SpaceId, SpaceId][] => [
    [a, b],
    [b, a],
  ]),
};

/** The server's canonical (shortest) path to each offered destination. */
const CANONICAL: Record<string, SpaceId[]> = {
  w2: ["w1", "w2"],
  w3: ["w1", "w3"],
  w4: ["w1", "w4"],
  w5: ["w1", "w2", "w5"],
};

const movePrompt = (over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId: "prompt-move-1",
  player: "p1",
  kind: "CHOOSE_SPACE",
  description: "Move up to 3 spaces",
  source: { card: "hero-a/strike#1" },
  options: [
    ...Object.entries(CANONICAL).map(([space, path]) => ({ id: space, label: space, data: { path } })),
    { id: "decline", label: "Decline move", data: { path: [] } },
  ],
  moveGraph: GRAPH,
  ...over,
});

const viewWithPrompt = (prompt: ViewPrompt | null): PlayerView => ({
  ...BASE_VIEW,
  turnPhase: "ACTION_SELECT",
  prompt,
});

/** Every ACTION frame the page sent, newest last. */
const sentActions = (): Record<string, unknown>[] =>
  SENT.map((raw) => JSON.parse(raw))
    .filter((m) => m.type === "ACTION")
    .map((m) => m.action as Record<string, unknown>);

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

/** Mount the page and deliver one STATE frame, exactly as the socket would. */
const mountWithView = async (view: PlayerView): Promise<HTMLElement> => {
  const { container } = render(
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
    ws.onmessage?.({
      data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view, legalActions: [], events: [] }),
    });
  });
  SENT = []; // drop the join/handshake chatter — we only care about answers
  return container;
};

const clickSpace = (container: HTMLElement, space: SpaceId) => {
  const circle = container.querySelector(`[data-space-id="${space}"]`);
  if (!circle) throw new Error(`no hit-circle for ${space}`);
  fireEvent.click(circle);
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  // Record what the page sends; the harness's own fake throws it away.
  FakeWebSocket.prototype.send = function send(data: string) {
    SENT.push(data);
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  SENT = [];
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "stepping-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("effect-move stepping — walking the route (issue #654)", () => {
  it("sends nothing per hop, then commits the WALKED route as one RESPOND_PROMPT", async () => {
    const container = await mountWithView(viewWithPrompt(movePrompt()));

    clickSpace(container, "w2"); // hop 1 — local preview only
    expect(sentActions()).toHaveLength(0);
    clickSpace(container, "w4"); // hop 2 — still local (1 move left)
    expect(sentActions()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Commit here" }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-move-1",
        optionId: "w4",
        // NOT the canonical ["w1","w4"] — the route the player actually walked.
        path: ["w1", "w2", "w4"],
      },
    ]);
  });

  it("counts the budget down live while the route is walked", async () => {
    const container = await mountWithView(viewWithPrompt(movePrompt()));
    expect(screen.getByText("Move up to 3 spaces")).toBeInTheDocument();

    clickSpace(container, "w2");
    expect(screen.getByText("Move up to 3 spaces · 2 moves left")).toBeInTheDocument();
    clickSpace(container, "w4");
    expect(screen.getByText("Move up to 3 spaces · 1 move left")).toBeInTheDocument();
  });

  it("walks BACK over the origin and auto-commits when the last step is spent", async () => {
    const container = await mountWithView(viewWithPrompt(movePrompt()));

    clickSpace(container, "w2"); // 2 left
    clickSpace(container, "w1"); // back home — legal, still 1 left to leave again
    expect(sentActions()).toHaveLength(0); // the origin is never an answer
    clickSpace(container, "w2"); // last step spent → auto-commit

    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-move-1",
        optionId: "w2",
        path: ["w1", "w2", "w1", "w2"], // three hops, ends one space from home
      },
    ]);
  });

  it("keeps the far one-click: a distant offered space still answers immediately", async () => {
    const container = await mountWithView(viewWithPrompt(movePrompt()));
    clickSpace(container, "w5"); // two hops away, budget to spare — commits anyway
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-move-1",
        optionId: "w5",
        path: ["w1", "w2", "w5"], // the server's own canonical route
      },
    ]);
  });

  it("cancels a walked route without sending anything, and starts the next one fresh", async () => {
    const container = await mountWithView(viewWithPrompt(movePrompt()));
    clickSpace(container, "w2");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sentActions()).toHaveLength(0); // the cancel is free — nothing was ever sent
    expect(screen.queryByRole("button", { name: "Commit here" })).not.toBeInTheDocument();

    // Back at the origin with the full allowance: a NEIGHBOUR is a hop (that is the
    // feature), so the route restarts rather than resuming the abandoned one.
    clickSpace(container, "w3");
    expect(sentActions()).toHaveLength(0);
    expect(screen.getByText("Move up to 3 spaces · 2 moves left")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Commit here" }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-move-1",
        optionId: "w3",
        path: ["w1", "w3"],
      },
    ]);
  });

  it("commits a one-space move on the click, exactly as it always did (allowance 1)", async () => {
    // "Move 1 space": the single hop spends the whole allowance, so there is nothing
    // to walk and the click answers straight away — no extra confirmation step.
    const container = await mountWithView(
      viewWithPrompt(
        movePrompt({
          description: "Move up to 1 space",
          options: [
            { id: "w2", label: "w2", data: { path: ["w1", "w2"] } },
            { id: "decline", label: "Decline move", data: { path: [] } },
          ],
          moveGraph: { ...GRAPH, allowance: 1 },
        }),
      ),
    );
    clickSpace(container, "w2");
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-move-1",
        optionId: "w2",
        path: ["w1", "w2"],
      },
    ]);
  });

  it("leaves `decline` a plain panel button — answered with no path", async () => {
    await mountWithView(viewWithPrompt(movePrompt()));
    fireEvent.click(screen.getByRole("button", { name: /Decline move/ }));
    expect(sentActions()).toEqual([
      { type: "RESPOND_PROMPT", player: "p1", promptId: "prompt-move-1", optionId: "decline" },
    ]);
  });

  it("falls back to today's one-click teleport when the server sends no moveGraph", async () => {
    const container = await mountWithView(
      viewWithPrompt(movePrompt({ moveGraph: undefined })), // older engine
    );
    clickSpace(container, "w2");
    expect(sentActions()).toEqual([
      // no `path` key at all — byte-identical to the pre-#654 wire shape
      { type: "RESPOND_PROMPT", player: "p1", promptId: "prompt-move-1", optionId: "w2" },
    ]);
  });
});
