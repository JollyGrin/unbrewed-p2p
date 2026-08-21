/**
 * Snake-step movement for LARGE (two-space) fighters, end to end through the REAL
 * Pro game page (issue #658 ↔ engine #415).
 *
 * `moveSteps.test.ts` pins the pose state machine; this pins the WIRING — which
 * click walks the body, which one settles the one genuinely ambiguous case, and
 * exactly what reaches the server. The claim under test is the ticket's point:
 * Triceratops' Stampede and Batman's Remote Control move a LARGE body, and the
 * route walked is the route that tramples, so the LEADING END's path has to reach
 * the server verbatim — `MOVE_FIGHTER{path}` for a maneuver, `RESPOND_PROMPT
 * {optionId, path}` for an effect move. No tail prompt; no "click the second gold
 * space to finish the move".
 *
 * Mount recipe is the same as `effectMoveStepping.test.tsx` (fake WebSocket,
 * seeded reconnect token, one STATE frame over a real recorded view); the only
 * doctoring is giving p1's hero a two-space body.
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
import type {
  Action,
  LargeMoveGraph,
  PlayerView,
  SpaceId,
  ViewPrompt,
} from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "LARGE";

/** A real recorded seat view (map, catalog, hands, plates) to hang the body on. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

// The recorded map's west corner, trimmed to the spaces this walk can reach:
//   w1 — w2, w3, w4     w2 — w1, w4, w5     w3 — w1, w4
//   w4 — w1, w2, w3, c4 w5 — w2, c4         c4 — w4, w5
// The body lies on (w1, w4) — head w1, tail w4 — with 2 movement.
const ADJACENT: Record<SpaceId, SpaceId[]> = {
  w1: ["w2", "w3", "w4"],
  w2: ["w1", "w4", "w5"],
  w3: ["w1", "w4"],
  w4: ["w1", "w2", "w3", "c4"],
  w5: ["w2", "c4"],
  c4: ["w4", "w5"],
};
const HEAD: SpaceId = "w1";
const TAIL: SpaceId = "w4";

/** The pose graph the engine emits: ordered poses + one edge per snake step. */
const largeGraph = (allowance: number): LargeMoveGraph => {
  const pairs: [SpaceId, SpaceId][] = [];
  for (const [lead, neighbours] of Object.entries(ADJACENT)) {
    for (const trail of neighbours) pairs.push([lead, trail]);
  }
  const isStart = (a: SpaceId, b: SpaceId) =>
    (a === HEAD && b === TAIL) || (a === TAIL && b === HEAD);
  return {
    fighter: "p1/hero",
    allowance,
    // The body's own pose is never a resting place — "stay put" is END_MANEUVER
    // (maneuver) or the `decline` option (effect move), not a zero-length move.
    poses: pairs.map(([lead, trail]) => ({ lead, trail, canStop: !isStart(lead, trail) })),
    edges: pairs.flatMap(([lead, trail]) =>
      ADJACENT[lead]
        .filter((next) => next !== trail) // the body cannot pass through itself
        .map((next): [[SpaceId, SpaceId], [SpaceId, SpaceId]] => [
          [lead, trail],
          [next, lead],
        ]),
    ),
  };
};

/** The body poses reachable within 2 steps, as the prompt's sorted option ids. */
const DESTINATIONS = ["w1|w2", "w1|w3", "w2|w4", "w3|w4", "c4|w4", "w2|w5", "c4|w5"];

const largeFighters = (): PlayerView["fighters"] =>
  BASE_VIEW.fighters.map((f) =>
    f.id === "p1/hero" ? { ...f, size: "LARGE" as const, space: HEAD, tailSpace: TAIL } : f,
  );

/** A card's "move up to 2 spaces" on the LARGE body — destinations are POSES. */
const movePrompt = (over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId: "prompt-large-1",
  player: "p1",
  kind: "CHOOSE_SPACE",
  description: "Move up to 2 spaces",
  source: { card: "hero-a/stampede#1" },
  options: [
    ...DESTINATIONS.map((id) => ({ id, label: id })),
    { id: "decline", label: "Decline move" },
  ],
  largeMoveGraph: largeGraph(2),
  ...over,
});

const promptView = (prompt: ViewPrompt | null): PlayerView => ({
  ...BASE_VIEW,
  turnPhase: "ACTION_SELECT",
  fighters: largeFighters(),
  prompt,
});

/** The same body, mid-maneuver: the graph rides the view and the moves are actions. */
const maneuverView = (): PlayerView => ({
  ...BASE_VIEW,
  turnPhase: "MANEUVER_MOVE",
  maneuver: { boostApplied: 0, boosted: false, moved: [] },
  fighters: largeFighters(),
  largeMoveGraphs: [largeGraph(2)],
  prompt: null,
});

/** What the server would enumerate as one-click destinations for that maneuver. */
const MANEUVER_ACTIONS: Action[] = [
  { type: "MOVE_FIGHTER", player: "p1", fighter: "p1/hero", path: ["w4", "c4"] },
  { type: "MOVE_FIGHTER", player: "p1", fighter: "p1/hero", path: ["w4", "c4", "w5"] },
  { type: "MOVE_FIGHTER", player: "p1", fighter: "p1/hero", path: ["w1", "w2"] },
  { type: "MOVE_FIGHTER", player: "p1", fighter: "p1/hero", path: ["w4", "w2"] },
];

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
const mountWithView = async (view: PlayerView, legalActions: Action[] = []): Promise<HTMLElement> => {
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
      data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view, legalActions, events: [] }),
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
/** The HEAD token of the two-space body (both segments carry the same title). */
const clickBody = () => fireEvent.click(screen.getAllByTitle(/^Alpha —/)[0]);

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
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "large-stepping-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("LARGE effect movement — walking the body (issue #658)", () => {
  it("sends nothing per hop, then answers with the pose walked to and the route taken", async () => {
    const container = await mountWithView(promptView(movePrompt()));

    // c4 touches only the TAIL, so the tail is the end that leads — one reading,
    // one click. The head is dragged into w4 behind it.
    clickSpace(container, "c4");
    expect(sentActions()).toHaveLength(0);
    expect(screen.getByText("Move up to 2 spaces · 1 move left")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Commit here" }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-large-1",
        optionId: "c4|w4", // the destination pose the prompt already offered
        path: ["w4", "c4"], // the LEADING END's route, starting where it led from
      },
    ]);
  });

  it("walks 1+1 and commits the ROUTE, not a canonical hop", async () => {
    const container = await mountWithView(promptView(movePrompt()));
    clickSpace(container, "c4"); // tail leads: body (c4, w4)
    clickSpace(container, "w5"); // and on: body (w5, c4) — spends the allowance
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-large-1",
        optionId: "c4|w5",
        path: ["w4", "c4", "w5"],
      },
    ]);
  });

  it("asks which body position was meant when EITHER end could lead there", async () => {
    const container = await mountWithView(promptView(movePrompt()));
    // w2 touches both w1 (head) and w4 (tail): leading with the head keeps w1,
    // leading with the tail keeps w4. The click can't say which, so it asks.
    clickSpace(container, "w2");
    expect(sentActions()).toHaveLength(0);
    expect(screen.getByText(/click the gold space it should KEEP/)).toBeInTheDocument();

    clickSpace(container, "w4"); // keep the tail's space → the tail led
    expect(screen.queryByText(/click the gold space it should KEEP/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Commit here" }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-large-1",
        optionId: "w2|w4",
        path: ["w4", "w2"],
      },
    ]);
  });

  it("the other answer to that same question keeps the head's space instead", async () => {
    const container = await mountWithView(promptView(movePrompt()));
    clickSpace(container, "w2");
    clickSpace(container, "w1"); // keep the head's space → the head led
    fireEvent.click(screen.getByRole("button", { name: "Commit here" }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-large-1",
        optionId: "w1|w2",
        path: ["w1", "w2"],
      },
    ]);
  });

  it("drops the 'click the second gold space' pose pick from the walking flow", async () => {
    await mountWithView(promptView(movePrompt()));
    expect(screen.queryByText(/click the second gold space/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/click a near gold space to step one at a time/),
    ).toBeInTheDocument();
  });

  it("refuses a mid-walk jump to a far pose instead of silently dropping the route", async () => {
    const container = await mountWithView(promptView(movePrompt()));
    clickSpace(container, "c4"); // one hop walked
    clickSpace(container, "w3"); // a far offered pose end — NOT a legal next step
    expect(sentActions()).toHaveLength(0); // the walked route is not thrown away
    fireEvent.click(screen.getByRole("button", { name: "Commit here" }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-large-1",
        optionId: "c4|w4",
        path: ["w4", "c4"],
      },
    ]);
  });

  it("cancels a walked route without sending anything", async () => {
    const container = await mountWithView(promptView(movePrompt()));
    clickSpace(container, "c4");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sentActions()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Commit here" })).not.toBeInTheDocument();
    expect(screen.getByText("Move up to 2 spaces")).toBeInTheDocument();
  });

  it("leaves `decline` a plain panel button — the optional move is still declinable", async () => {
    await mountWithView(promptView(movePrompt()));
    fireEvent.click(screen.getByRole("button", { name: /Decline move/ }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-large-1",
        optionId: "decline",
      },
    ]);
  });

  it("commits on the click when the single hop spends the whole allowance", async () => {
    const container = await mountWithView(
      promptView(
        movePrompt({
          description: "Move up to 1 space",
          options: [
            { id: "c4|w4", label: "c4|w4" },
            { id: "decline", label: "Decline move" },
          ],
          largeMoveGraph: largeGraph(1),
        }),
      ),
    );
    clickSpace(container, "c4");
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-large-1",
        optionId: "c4|w4",
        path: ["w4", "c4"],
      },
    ]);
  });

  it("keeps the old two-tap pose pick when the server sent no graph", async () => {
    // Older engine / a prompt with no graph: the #132 gesture is untouched — tap an
    // end, tap its partner, answer with the option id and no path.
    const container = await mountWithView(
      promptView(movePrompt({ largeMoveGraph: undefined })),
    );
    expect(screen.queryByText(/step one at a time/)).not.toBeInTheDocument();
    clickSpace(container, "c4"); // c4 is in two offered poses → anchors
    expect(sentActions()).toHaveLength(0);
    expect(screen.getByText(/click the second gold space to finish the move/)).toBeInTheDocument();
    clickSpace(container, "w4");
    expect(sentActions()).toEqual([
      { type: "RESPOND_PROMPT", player: "p1", promptId: "prompt-large-1", optionId: "c4|w4" },
    ]);
  });
});

describe("LARGE maneuver movement — walking the body (issue #658)", () => {
  it("steps the selected body one space at a time and commits ONE MOVE_FIGHTER", async () => {
    const container = await mountWithView(maneuverView(), MANEUVER_ACTIONS);
    clickBody(); // select the mover
    clickSpace(container, "c4"); // tail leads into c4 — local preview only
    expect(sentActions()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "End move here" }));
    expect(sentActions()).toEqual([
      { type: "MOVE_FIGHTER", player: "p1", fighter: "p1/hero", path: ["w4", "c4"] },
    ]);
  });

  it("auto-commits the hop that spends the last of the allowance", async () => {
    const container = await mountWithView(maneuverView(), MANEUVER_ACTIONS);
    clickBody();
    clickSpace(container, "c4");
    clickSpace(container, "w5"); // second and last step
    expect(sentActions()).toEqual([
      { type: "MOVE_FIGHTER", player: "p1", fighter: "p1/hero", path: ["w4", "c4", "w5"] },
    ]);
  });

  it("asks which end led before committing an ambiguous maneuver step", async () => {
    const container = await mountWithView(maneuverView(), MANEUVER_ACTIONS);
    clickBody();
    clickSpace(container, "w2");
    expect(sentActions()).toHaveLength(0);
    expect(screen.getByText(/click the gold space it should KEEP/)).toBeInTheDocument();
    clickSpace(container, "w1"); // keep the head's space
    fireEvent.click(screen.getByRole("button", { name: "End move here" }));
    expect(sentActions()).toEqual([
      { type: "MOVE_FIGHTER", player: "p1", fighter: "p1/hero", path: ["w1", "w2"] },
    ]);
  });

  it("cancels a maneuver walk without sending anything", async () => {
    const container = await mountWithView(maneuverView(), MANEUVER_ACTIONS);
    clickBody();
    clickSpace(container, "c4");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sentActions()).toHaveLength(0);
  });
});
