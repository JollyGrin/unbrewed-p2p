/**
 * A move prompt addressed to the OTHER seat, end to end through the REAL Pro
 * game page (protocol v31 ↔ engine #445, `move.chooser:'OPPONENT'`).
 *
 * On the wire this is nothing new: an ordinary `CHOOSE_SPACE` whose `player` is
 * the non-active seat, which the client answers because it answers whatever
 * prompt NAMES it — `promptForMe = prompt.player === view.you`, with no turn
 * gate anywhere in the chain. But it has never been exercised with a hostile
 * mover: until v31 every prompt the client saw was addressed to the player whose
 * turn it was. A regression here would be invisible in unit tests and total in
 * play — the seat being pushed around would see a dead board and the game would
 * hang on a prompt nobody could answer.
 *
 * So this is a smoke test of exactly that: it is NOT your turn, the prompt names
 * you, and the board still lights up, the panel still explains itself, and the
 * click still reaches the server. Mount recipe is the render-fuzz one shared
 * with `effectMoveStepping.test.tsx` (fake WebSocket, seeded reconnect token,
 * one STATE frame over a real recorded view).
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
import type { PlayerView, SpaceId, ViewPrompt } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "HOST";

/** A real recorded seat view (map, catalog, hands, plates) to hang the prompt on.
 *  The viewer is p1, whose hero stands on w1; p2's hero stands on e1. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

/** "Your opponent moves your fighter": the ACTIVE seat is p2, the prompt names
 *  p1, and the spaces offered are p1's hero's neighbours. */
const hostilePrompt = (over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId: "prompt-hostile-move",
  player: "p1",
  kind: "CHOOSE_SPACE",
  description: "Move this fighter 1 space",
  source: { card: "skull-kid/majoras-thunder#1" },
  options: [
    { id: "w2", label: "w2", data: { path: ["w1", "w2"] } },
    { id: "w3", label: "w3", data: { path: ["w1", "w3"] } },
  ],
  ...over,
});

const opponentsTurn = (prompt: ViewPrompt | null): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p2", // NOT the viewer's turn
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
  FakeWebSocket.prototype.send = function send(data: string) {
    SENT.push(data);
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  SENT = [];
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "hostile-move-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("a move prompt addressed to the non-active seat (move.chooser:'OPPONENT')", () => {
  it("renders the prompt for the seat it NAMES, on the opponent's turn", async () => {
    await mountWithView(opponentsTurn(hostilePrompt()));
    expect(screen.getByText("Move this fighter 1 space")).toBeInTheDocument();
  });

  it("answers it from the board — the click reaches the server", async () => {
    const container = await mountWithView(opponentsTurn(hostilePrompt()));
    clickSpace(container, "w3");
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-hostile-move",
        optionId: "w3",
      },
    ]);
  });

  it("stays a spectator for a prompt addressed to the OTHER seat", async () => {
    // The mirror case, and the reason the gate is on `prompt.player` and not on
    // the turn: a prompt naming p2 must not become answerable here just because
    // the same board is otherwise idle. The panel still SUMMARISES it (the
    // redacted prompt rides every seat's view) — it just cannot be answered.
    const container = await mountWithView(opponentsTurn(hostilePrompt({ player: "p2" })));
    expect(screen.getByText("opponent is deciding…")).toBeInTheDocument();
    clickSpace(container, "w3");
    expect(sentActions()).toEqual([]);
  });
});
