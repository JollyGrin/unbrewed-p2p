/**
 * Cecil Palmer's two unusual prompts, end to end through the REAL Pro game page
 * (issue #668 ↔ engine #456). Neither is a new prompt KIND — both are the
 * `CHOOSE_OPTION` / `YES_NO` the client has always spoken — which is exactly why
 * they are worth mounting: nothing here would fail a unit test, and everything
 * here would hang a real game.
 *
 *  1. *They do not exist and you should not know about them* opens an EIGHT-option
 *     `chooseOne` (declare 0..7 — RULING R1 keeps the unbackable bluff legal). The
 *     widest option list any shipped deck opens; a panel that clipped or collapsed
 *     it would quietly make the top declarations unplayable.
 *
 *  2. The challenge that follows is addressed to the OPPONENT, mid-combat, on a turn
 *     that is not theirs (`optional{chooser:'OPPONENT'}` → a `YES_NO`). This is the
 *     #662 hazard restated: until v31 every prompt the client saw named the ACTIVE
 *     seat. If the non-active seat swallowed it, the game would stop dead with a
 *     prompt nobody could answer — and the bluff is the whole card.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, seeded reconnect
 * token, one STATE frame over a real recorded view), as in opponentMovePrompt.
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
import type { PlayerView, ViewPrompt } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "HOST";

/** A real recorded seat view (map, catalog, hands, plates). The viewer is p1. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

/** RULING R1: 0..7, because nothing in the deck prints above 5 — 6 and 7 are
 *  transparent, callable lies, and declaring one is a legal (terrible) play. */
const DECLARABLE = [0, 1, 2, 3, 4, 5, 6, 7];

const declarePrompt = (): ViewPrompt => ({
  promptId: "prompt-declare-value",
  player: "p1",
  kind: "CHOOSE_OPTION",
  description: "Choose this card's value",
  source: { card: "cecil-palmer/they-do-not-exist#1" },
  options: DECLARABLE.map((k) => ({
    id: `declare-${k}`,
    label: `Declare this card's value: ${k}`,
  })),
});

/** The challenge, as it reaches the seat being bluffed: p2 is ACTIVE (Cecil just
 *  played the card), the prompt names p1, and combat is open. */
const challengePrompt = (over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId: "prompt-challenge",
  player: "p1",
  kind: "YES_NO",
  description: "Ask them to reveal a card of value 4 from their hand",
  source: { card: "cecil-palmer/they-do-not-exist#1" },
  options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
  ...over,
});

const myTurn = (prompt: ViewPrompt | null): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p1",
  turnPhase: "ACTION_SELECT",
  prompt,
});

const theirTurn = (prompt: ViewPrompt | null): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p2", // Cecil's turn, not the viewer's
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
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "cecil-prompt-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("They do not exist — the eight-option declaration", () => {
  it("offers every declarable value, 0 through 7", async () => {
    await mountWithView(myTurn(declarePrompt()));
    for (const k of DECLARABLE) {
      expect(screen.getByText(`Declare this card's value: ${k}`)).toBeInTheDocument();
    }
  });

  it("sends the declaration the player actually picked", async () => {
    // 7 is the far end of the list and the one a clipped panel would lose first.
    await mountWithView(myTurn(declarePrompt()));
    fireEvent.click(screen.getByText("Declare this card's value: 7"));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-declare-value",
        optionId: "declare-7",
      },
    ]);
  });
});

describe("the challenge — a prompt for the NON-ACTIVE seat, mid-combat", () => {
  it("renders for the seat it NAMES even though it is the other player's turn", async () => {
    await mountWithView(theirTurn(challengePrompt()));
    expect(
      screen.getByText("Ask them to reveal a card of value 4 from their hand")
    ).toBeInTheDocument();
  });

  it("answers it — the call reaches the server", async () => {
    await mountWithView(theirTurn(challengePrompt()));
    fireEvent.click(screen.getByText("Yes"));
    expect(sentActions()).toEqual([
      { type: "RESPOND_PROMPT", player: "p1", promptId: "prompt-challenge", optionId: "yes" },
    ]);
  });

  it("declining is equally answerable — the bluff only works if you may fold", async () => {
    await mountWithView(theirTurn(challengePrompt()));
    fireEvent.click(screen.getByText("No"));
    expect(sentActions()).toEqual([
      { type: "RESPOND_PROMPT", player: "p1", promptId: "prompt-challenge", optionId: "no" },
    ]);
  });

  it("stays a spectator when the challenge names the OTHER seat", async () => {
    // The mirror case: Cecil is ours, so the challenge is theirs to answer.
    await mountWithView(myTurn(challengePrompt({ player: "p2" })));
    expect(screen.getByText("opponent is deciding…")).toBeInTheDocument();
    expect(sentActions()).toEqual([]);
  });
});
