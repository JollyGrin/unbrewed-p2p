/**
 * The setup-time sidekick choice (issue #1717 ↔ engine #1087, protocol v42), end to
 * end through the REAL Pro game page.
 *
 * A hero whose player chooses a sidekick (Harry Dresden: Mouse or Karrin Murphy) gets
 * one ordinary CHOOSE_OPTION prompt at game start, before the mulligan and before any
 * figure is placed. The generic panel used to title it "CHOOSE OPTION" and show bare
 * names; this pins what each seat now reads:
 *  - the chooser: what each option is (name + HP + reach), and the sidekicks the other
 *    seats already have (picks are sequential and public), and the answer on the wire;
 *  - everyone else: WHO is choosing, instead of "Choose your sidekick" about somebody
 *    else's pick.
 *
 * Mount recipe is the render-fuzz one shared with `clockTowerPrompt.test.tsx`.
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
import type { PlayerView, ViewFighter, ViewPrompt } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "HOST";

/** A real recorded seat view (map, catalog, plates); the viewer is p1. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

/** The prompt exactly as engine #1087's openSidekickChoicePrompt opens it. */
const sidekickPrompt = (over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId: "p0",
  player: "p1",
  kind: "CHOOSE_OPTION",
  options: [
    { id: "mouse", label: "Mouse", data: { name: "Mouse", hp: 7, reach: "MELEE", quantity: 1 } },
    { id: "murphy", label: "Karrin Murphy", data: { name: "Karrin Murphy", hp: 5, reach: "RANGED", quantity: 1 } },
  ],
  source: { hero: "p1" },
  description: "Choose your sidekick",
  ...over,
});

const sidekick = (owner: "p1" | "p2", name: string, hp: number, reach: ViewFighter["reach"]): ViewFighter => ({
  id: `${owner}/sidekick-1`,
  owner,
  kind: "SIDEKICK",
  name,
  space: null, // created at the pick, placed later in setup
  tailSpace: null,
  hp,
  maxHp: hp,
  reach,
  size: "NORMAL",
  defeated: false,
});

/** Setup, before any placement: heroes unplaced, the given extra figures, one prompt. */
const atSetup = (prompt: ViewPrompt, extra: ViewFighter[] = []): PlayerView => ({
  ...BASE_VIEW,
  phase: "SETUP",
  combat: null,
  fighters: [...BASE_VIEW.fighters.map((f) => ({ ...f, space: null })), ...extra],
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
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "sidekick-choice-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("the sidekick choice, for the seat choosing", () => {
  it("titles the panel for what it is and keeps the engine's wording", async () => {
    await mountWithView(atSetup(sidekickPrompt()));
    expect(screen.getByText("SIDEKICK")).toBeInTheDocument();
    expect(screen.queryByText("CHOOSE OPTION")).toBeNull();
    expect(screen.getByText("Choose your sidekick")).toBeInTheDocument();
  });

  it("says what each option is: name, HP and reach", async () => {
    await mountWithView(atSetup(sidekickPrompt()));
    const mouse = screen.getByRole("button", { name: /Mouse/ });
    const murphy = screen.getByRole("button", { name: /Karrin Murphy/ });
    expect(mouse).toHaveTextContent("7 HP · Melee");
    expect(murphy).toHaveTextContent("5 HP · Ranged");
  });

  it("answers it — the option id reaches the server", async () => {
    await mountWithView(atSetup(sidekickPrompt()));
    fireEvent.click(screen.getByRole("button", { name: /Karrin Murphy/ }));
    expect(sentActions()).toEqual([{ type: "RESPOND_PROMPT", player: "p1", promptId: "p0", optionId: "murphy" }]);
  });

  it("shows the second chooser the first seat's pick before choosing", async () => {
    // Mirror, seat order p1 then p2 seen from p1's side flipped: the opponent picked
    // Mouse first (its figure exists, unplaced) and now the viewer chooses.
    await mountWithView(atSetup(sidekickPrompt(), [sidekick("p2", "Mouse", 7, "MELEE")]));
    expect(screen.getByText("Opponent's sidekick: Mouse (7 HP · Melee)")).toBeInTheDocument();
  });

  it("adds no sidekick line when the other seat has none yet", async () => {
    await mountWithView(atSetup(sidekickPrompt()));
    expect(screen.queryByText(/sidekick:/)).toBeNull();
  });
});

describe("the sidekick choice, for everyone else", () => {
  it("says who is choosing instead of 'Choose your sidekick', with the redacted options", async () => {
    await mountWithView(atSetup(sidekickPrompt({ player: "p2", options: [] }), [sidekick("p1", "Mouse", 7, "MELEE")]));
    expect(screen.getByText("Opponent is choosing a sidekick")).toBeInTheDocument();
    expect(screen.queryByText("Choose your sidekick")).toBeNull();
    expect(screen.queryByText("opponent is deciding…")).toBeNull();
    // The viewer's own earlier pick, as the other seat sees it on the same panel.
    expect(screen.getByText("Your sidekick: Mouse (7 HP · Melee)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Karrin Murphy/ })).toBeNull();
  });
});

describe("every other CHOOSE_OPTION prompt", () => {
  it("keeps the generic panel exactly as before", async () => {
    await mountWithView({
      ...BASE_VIEW,
      prompt: {
        promptId: "p9",
        player: "p2",
        kind: "CHOOSE_OPTION",
        options: [],
        description: "Choose one",
      },
    });
    expect(screen.getByText("CHOOSE OPTION")).toBeInTheDocument();
    expect(screen.getByText("opponent is deciding…")).toBeInTheDocument();
  });
});
