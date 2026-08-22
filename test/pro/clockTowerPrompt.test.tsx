/**
 * Skull Kid's Clock Tower mitigation prompts, end to end through the REAL Pro game
 * page (issue #663 ↔ engine #449 / engine issue #448).
 *
 * The strike opens up to five sequential `YES_NO` prompts, all carrying the SAME
 * static engine label, addressed to a player OTHER than the tower's owner. Two of
 * them arrive at moments the client had never been asked to render a prompt at:
 *
 *  - at the START of Skull Kid's turn, where the hero's `TURN_START` tick can empty
 *    the clock — so the prompt names the seat whose turn it is NOT, and
 *  - inside a combat on the opponent's OWN turn, off Majora's Wrath's AFTER window
 *    (Skull Kid is defending, so the strike fires while the attacker is active).
 *
 * Either one being swallowed would hang the game on a prompt nobody can answer: the
 * player it names would see a dead panel, and the other seat has no legal actions
 * while it is parked. So this drives both through the page and asserts the label
 * renders, the answer reaches the server, and — the point of the ticket — the LIVE
 * running reduction is stated next to a question that cannot state it itself.
 *
 * Mount recipe is the render-fuzz one shared with `opponentMovePrompt.test.tsx`
 * (fake WebSocket, seeded reconnect token, one STATE frame over a real recorded view).
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
import type { PlayerView, ViewCombat, ViewPrompt } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "HOST";

/** The engine's authored label, VERBATIM (skull-kid.rules.ts MITIGATION_STEP). */
const MITIGATION_LABEL =
  "Discard a card to reduce the Clock Tower damage to your own fighters by its BOOST value";

/** A real recorded seat view (map, catalog, hands, plates) to hang the prompt on.
 *  The viewer is p1; p2 becomes Skull Kid below. */
const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

/** Seat `seat` is Skull Kid mid-strike: the dial is empty for the whole run, and
 *  `MITIGATION` banks the reduction discarded so far. Both counters are public.
 *  Defaults to p2, the seat the viewer (p1) is playing against.
 *
 *  The emptied dial is modelled the way the ENGINE broadcasts it — with no `TIME` key
 *  at all, since a counter that reaches zero has its key deleted (verified against a
 *  live #449 room: the striking seat's counters read `{ MITIGATION: 0 }`). */
const withSkullKid = (
  view: PlayerView,
  mitigation: number,
  seat: "p1" | "p2" = "p2",
): PlayerView => {
  const clock = { MITIGATION: mitigation };
  return {
    ...view,
    players: view.players.map((p) =>
      p.id === seat ? { ...p, heroId: "skull-kid", counters: clock } : p,
    ),
    self: seat === "p1" ? { ...view.self, heroId: "skull-kid", counters: clock } : view.self,
    opponent:
      seat === "p2" && view.opponent
        ? { ...view.opponent, heroId: "skull-kid", counters: clock }
        : view.opponent,
  };
};

const mitigationPrompt = (over: Partial<ViewPrompt> = {}): ViewPrompt => ({
  promptId: "prompt-clock-tower-1",
  player: "p1", // the OPPONENT of the tower's owner answers
  kind: "YES_NO",
  options: [
    { id: "yes", label: MITIGATION_LABEL },
    { id: "no", label: `Decline: ${MITIGATION_LABEL}` },
  ],
  ...over,
});

/** The hero-tick strike: it is SKULL KID's turn, and the prompt names the other seat. */
const atSkullKidsTurnStart = (mitigation: number, prompt: ViewPrompt): PlayerView => ({
  ...withSkullKid(BASE_VIEW, mitigation),
  activePlayer: "p2", // NOT the viewer's turn
  turnPhase: "ACTION_SELECT",
  prompt,
  combat: null,
});

/** The Majora's Wrath strike: the viewer is attacking on their OWN turn, Skull Kid is
 *  defending, and his card's AFTER window empties the clock mid-combat. */
const insideOwnCombat = (mitigation: number, prompt: ViewPrompt): PlayerView => {
  const combat: ViewCombat = {
    attackerPlayer: "p1",
    defenderPlayer: "p2",
    attacker: "p1/hero",
    target: "p2/hero",
    stage: "AFTER",
    attackerCard: { instance: "hero-a/strike#1", role: "ATTACK", boosts: [], effectiveValue: 3 },
    defenderCard: null,
    additionalDefenseCard: null,
    outcome: "ATTACKER_WON",
    attackDamageDealt: 3,
  };
  return {
    ...withSkullKid(BASE_VIEW, mitigation),
    activePlayer: "p1", // the viewer's own turn
    turnPhase: "ACTION_SELECT",
    combat,
    prompt,
  };
};

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
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "clock-tower-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("Clock Tower mitigation at the START of Skull Kid's turn", () => {
  it("renders the prompt for the seat it NAMES, on the tower owner's turn", async () => {
    await mountWithView(atSkullKidsTurnStart(0, mitigationPrompt()));
    expect(screen.getByRole("button", { name: MITIGATION_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Decline: ${MITIGATION_LABEL}` })).toBeInTheDocument();
  });

  it("states what is at stake before anything has been discarded", async () => {
    await mountWithView(atSkullKidsTurnStart(0, mitigationPrompt()));
    expect(
      screen.getByText(
        "Clock Tower: 5 damage to each of your fighters — nothing discarded yet, so all 5 would land.",
      ),
    ).toBeInTheDocument();
  });

  it("states the LIVE running reduction the static label cannot", async () => {
    // The whole ticket: three cards are already in, so one more discard is worth it
    // only if it buys the last 2. The engine label is identical on all five prompts.
    await mountWithView(atSkullKidsTurnStart(3, mitigationPrompt({ promptId: "prompt-clock-tower-4" })));
    expect(
      screen.getByText(
        "Clock Tower: 5 damage to each of your fighters — currently reduced by 3, so 2 would land.",
      ),
    ).toBeInTheDocument();
  });

  it("says plainly when the damage is already fully covered", async () => {
    await mountWithView(atSkullKidsTurnStart(5, mitigationPrompt()));
    expect(
      screen.getByText(
        "Clock Tower: 5 damage to each of your fighters — currently reduced by 5: fully covered, no damage would land.",
      ),
    ).toBeInTheDocument();
  });

  it("answers it — the click reaches the server on a turn that is not ours", async () => {
    await mountWithView(atSkullKidsTurnStart(2, mitigationPrompt()));
    fireEvent.click(screen.getByRole("button", { name: MITIGATION_LABEL }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-clock-tower-1",
        optionId: "yes",
      },
    ]);
  });

  it("shows the tower owner the same running total in the third person", async () => {
    // Flip the seats: the VIEWER is Skull Kid, and the prompt names their opponent.
    // It is redacted for the non-chooser (`options: []`), but every number in the line
    // is public — Skull Kid's player watches their own tower being bought down.
    await mountWithView({
      ...withSkullKid(BASE_VIEW, 3, "p1"),
      activePlayer: "p1",
      turnPhase: "ACTION_SELECT",
      combat: null,
      prompt: mitigationPrompt({ player: "p2", options: [] }),
    });
    expect(screen.getByText("opponent is deciding…")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Clock Tower: 5 damage to each of their fighters — currently reduced by 3, so 2 would land.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Clock Tower mitigation INSIDE a combat (Majora's Wrath AFTER window)", () => {
  it("renders and answers mid-combat on the attacker's own turn", async () => {
    await mountWithView(insideOwnCombat(1, mitigationPrompt({ promptId: "prompt-wrath-1" })));
    expect(
      screen.getByText(
        "Clock Tower: 5 damage to each of your fighters — currently reduced by 1, so 4 would land.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Decline: ${MITIGATION_LABEL}` }));
    expect(sentActions()).toEqual([
      {
        type: "RESPOND_PROMPT",
        player: "p1",
        promptId: "prompt-wrath-1",
        optionId: "no",
      },
    ]);
  });
});

describe("the line is silent everywhere else", () => {
  it("says nothing on an ordinary YES_NO while the clock is still running", async () => {
    const view = withSkullKid(BASE_VIEW, 0);
    await mountWithView({
      ...view,
      players: view.players.map((p) =>
        p.id === "p2" ? { ...p, counters: { TIME: 2, MITIGATION: 0 } } : p,
      ),
      activePlayer: "p2",
      prompt: mitigationPrompt({
        promptId: "prompt-other",
        options: [
          { id: "yes", label: "Draw 2 cards (Skull Kid then removes 1 Time from the Clock Tower)" },
          { id: "no", label: "Decline" },
        ],
      }),
    });
    expect(screen.queryByText(/Clock Tower: 5 damage/)).not.toBeInTheDocument();
  });
});
