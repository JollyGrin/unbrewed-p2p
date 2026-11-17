/**
 * POMNI's *The Funny One!* answered in one step, end to end through the REAL Pro
 * game page (issue #1691).
 *
 * The engine reveals the opponent's hand, asks "how many? 0/1/2" (CHOOSE_OPTION,
 * `data.count`) and then opens one CHOOSE_TARGET per card. The page shows the
 * hand as card faces instead of the count question, and on confirm sends exactly
 * what the manual flow sent: the count, then each chosen card as its prompt
 * arrives. These tests drive that through the page and pin the fallbacks: no
 * reveal in the batch (a reconnect, a 3+ player game, any other count prompt)
 * keeps the buttons, and a follow-up prompt that is not the expected card pick
 * is left for the player.
 *
 * Mount recipe shared with `clockTowerPrompt.test.tsx` (fake WebSocket, seeded
 * reconnect token, STATE frames over a real recorded view).
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
import type { GameEvent, PlayerView, ViewPrompt } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "HOST";

/** A real recorded seat view; the viewer is p1, the opponent p2. */
const RECORDED: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

/** The recorded view with p2 holding `handCount` cards. */
const viewWith = (handCount: number): PlayerView => ({
  ...RECORDED,
  prompt: null,
  players: RECORDED.players.map((p) => (p.id === "p2" ? { ...p, handCount } : p)),
  opponent: RECORDED.opponent ? { ...RECORDED.opponent, handCount } : RECORDED.opponent,
});

/** The opponent's hand, as instances of cards the recorded catalog knows. */
const HAND = ["hero-b/volley#1", "hero-b/dodge#1", "hero-b/volley#2"];

/** The engine's wording of the count question (pomni.rules, engine feature/pomni-qol). */
const ENGINE_QUESTION = "Choose how many cards to shuffle into the opponent's deck";

const countPrompt = (max: number): ViewPrompt => ({
  promptId: "prompt-count",
  player: "p1",
  kind: "CHOOSE_OPTION",
  description: ENGINE_QUESTION,
  source: { card: "hero-a/strike#1" },
  options: Array.from({ length: max + 1 }, (_, n) => ({ id: String(n), label: String(n), data: { count: n } })),
});

const targetPrompt = (promptId: string, cards: string[]): ViewPrompt => ({
  promptId,
  player: "p1",
  kind: "CHOOSE_TARGET",
  options: cards.map((card) => ({ id: card, label: card, data: { card } })),
});

/** The batch that opens the count prompt: effect marker, the hand, the prompt. */
const revealBatch = (cards: string[]): GameEvent[] => [
  { type: "EFFECT_RESOLVING", source: "pomni/the-funny-one#1", window: "IMMEDIATELY", player: "p1" },
  ...cards.map((card): GameEvent => ({ type: "CARD_REVEALED", player: "p2", card })),
  { type: "PROMPT_OPENED", player: "p1", kind: "CHOOSE_OPTION", promptId: "prompt-count" },
];

let SENT: string[] = [];

/** Every prompt answer the page sent, oldest first, as `promptId:optionId`. */
const answers = (): string[] =>
  SENT.map((raw) => JSON.parse(raw))
    .filter((m) => m.type === "ACTION" && m.action.type === "RESPOND_PROMPT")
    .map((m) => `${m.action.promptId}:${m.action.optionId}`);

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

/** p1 attacking p2 with a card on the table, as recorded: the combat the card resolves in. */
const COMBAT: NonNullable<PlayerView["combat"]> = {
  attackerPlayer: "p1",
  defenderPlayer: "p2",
  attacker: "p1/hero",
  target: "p2/hero",
  stage: "COMMIT_DEFENSE",
  attackerCard: { instance: "hero-a/strike#1", role: "ATTACK", boosts: [], effectiveValue: 3 },
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
} as NonNullable<PlayerView["combat"]>;

/** Deliver one STATE frame, exactly as the socket would. */
const state = async (
  prompt: ViewPrompt | null,
  events: GameEvent[] = [],
  p2Hand = HAND.length,
  combat: PlayerView["combat"] = null,
) => {
  const ws = FakeWebSocket.latest();
  if (!ws) throw new Error("the page never opened a socket");
  await act(async () => {
    ws.onmessage?.({
      data: JSON.stringify({
        v: PROTOCOL_VERSION,
        type: "STATE",
        view: { ...viewWith(p2Hand), prompt, combat },
        legalActions: [],
        events,
      }),
    });
  });
};

/** Mount the page into a running game with no prompt up. */
const mount = async () => {
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
  await state(null);
  SENT = []; // drop the join/handshake chatter — we only care about answers
};

const picker = () => screen.getByTestId("card-multi-pick");
/** The hand's toggle buttons, in hand order (the confirm button has no aria-pressed). */
const faces = () => within(picker()).getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
const confirm = (name: string) => fireEvent.click(within(picker()).getByRole("button", { name }));

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
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "funny-one-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("The Funny One! — pick the returned cards in one step", () => {
  it("shows the opponent's hand instead of the 0 / 1 / 2 count question", async () => {
    await mount();
    await state(countPrompt(2), revealBatch(HAND));
    expect(faces()).toHaveLength(3);
    for (const n of ["0", "1", "2"]) expect(screen.queryByRole("button", { name: n })).not.toBeInTheDocument();
    // the picker is the view of the hand: the fallback panel stays away
    expect(screen.queryByTestId("revealed-hand-panel")).not.toBeInTheDocument();
  });

  it("sends the count, then each chosen card as its prompt opens — and nothing else", async () => {
    await mount();
    await state(countPrompt(2), revealBatch(HAND));
    const [, second, third] = faces();
    fireEvent.click(third);
    fireEvent.click(second);
    confirm("Return 2 cards");
    expect(answers()).toEqual(["prompt-count:2"]);
    expect(screen.getByTestId("card-multi-pick-busy")).toHaveTextContent("Returning 2 cards…");

    await state(targetPrompt("prompt-pick-1", HAND));
    expect(answers()).toEqual(["prompt-count:2", `prompt-pick-1:${HAND[1]}`]);
    // the pick is on the wire: no manual picker for it in the meantime
    expect(screen.getByTestId("card-multi-pick-busy")).toBeInTheDocument();

    await state(targetPrompt("prompt-pick-2", [HAND[0], HAND[2]]));
    expect(answers()).toEqual(["prompt-count:2", `prompt-pick-1:${HAND[1]}`, `prompt-pick-2:${HAND[2]}`]);

    await state(null);
    expect(answers()).toHaveLength(3);
    expect(screen.queryByTestId("card-multi-pick-busy")).not.toBeInTheDocument();
    expect(screen.queryByTestId("revealed-hand-panel")).not.toBeInTheDocument();
  });

  it("'Return none' answers 0 and no further prompt is answered", async () => {
    await mount();
    await state(countPrompt(2), revealBatch(HAND));
    confirm("Return none");
    expect(answers()).toEqual(["prompt-count:0"]);
    await state(null);
    await state(targetPrompt("prompt-later", HAND));
    expect(answers()).toEqual(["prompt-count:0"]);
  });

  it("cannot select a third card", async () => {
    await mount();
    await state(countPrompt(2), revealBatch(HAND));
    faces().forEach((f) => fireEvent.click(f));
    expect(faces().map((f) => f.getAttribute("aria-pressed"))).toEqual(["true", "true", "false"]);
    expect(within(picker()).getByRole("button", { name: "Return 2 cards" })).toBeInTheDocument();
  });

  it("caps a 1-card hand at 1", async () => {
    await mount();
    await state(countPrompt(1), revealBatch([HAND[0]]), 1);
    expect(faces()).toHaveLength(1);
    fireEvent.click(faces()[0]);
    confirm("Return 1 card");
    expect(answers()).toEqual(["prompt-count:1"]);
  });

  it("falls back to the manual pick when the next prompt is not the expected card pick", async () => {
    await mount();
    await state(countPrompt(2), revealBatch(HAND));
    fireEvent.click(faces()[0]);
    confirm("Return 1 card");
    // a pick that does not offer the chosen card: leave it to the player
    await state(targetPrompt("prompt-pick-1", [HAND[1], HAND[2]]));
    expect(answers()).toEqual(["prompt-count:1"]);
    expect(screen.queryByTestId("card-multi-pick-busy")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("generic", { name: /^Choose / })[0]);
    expect(answers()).toEqual(["prompt-count:1", `prompt-pick-1:${HAND[1]}`]);
  });

  it("keeps the count buttons when the batch revealed nothing (reconnect, 3+ players, other count prompts)", async () => {
    await mount();
    await state(countPrompt(2));
    expect(screen.queryByTestId("card-multi-pick")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(answers()).toEqual(["prompt-count:2"]);
    // …and the picks that follow are the player's to make
    await state(targetPrompt("prompt-pick-1", HAND));
    expect(answers()).toEqual(["prompt-count:2"]);
  });

  it("keeps the count buttons when the reveal is not the opponent's whole hand", async () => {
    await mount();
    // one revealed card (a deck top, a random reveal) while p2 holds three
    await state(countPrompt(2), revealBatch([HAND[0]]));
    expect(screen.queryByTestId("card-multi-pick")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
  });

  it("hands the prompt back when the server stays silent after an answer", async () => {
    await mount();
    await state(countPrompt(2), revealBatch(HAND));
    jest.useFakeTimers();
    try {
      fireEvent.click(faces()[0]);
      confirm("Return 1 card");
      expect(screen.getByTestId("card-multi-pick-busy")).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      expect(screen.getByTestId("card-multi-pick-busy")).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(1_500);
      });
      expect(screen.queryByTestId("card-multi-pick-busy")).not.toBeInTheDocument();
      expect(faces()).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
    // a card pick arriving late is the player's to make
    await state(targetPrompt("prompt-pick-1", HAND));
    expect(answers()).toEqual(["prompt-count:1"]);
  });

  it("a rejected answer hands the prompt back to the player", async () => {
    await mount();
    await state(countPrompt(2), revealBatch(HAND));
    fireEvent.click(faces()[0]);
    confirm("Return 1 card");
    const ws = FakeWebSocket.latest()!;
    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({ v: PROTOCOL_VERSION, type: "ERROR", code: "ILLEGAL_ACTION", message: "stale" }),
      });
    });
    expect(screen.queryByTestId("card-multi-pick-busy")).not.toBeInTheDocument();
    expect(faces()).toHaveLength(3);
    // a later card pick is no longer answered for them
    await state(targetPrompt("prompt-pick-1", HAND));
    expect(answers()).toEqual(["prompt-count:1"]);
  });

  // Issue #1703: the picker used to open below the fold, under the combat summary,
  // the engine's count question and the played card.
  describe("the picker gets the panel to itself (issue #1703)", () => {
    const INSTRUCTION = "Click up to 2 cards from the opponent's hand to return to their deck";
    const heading = () => screen.queryByTestId("pro-prompt-heading");
    /** The played card's face in the prompt panel: a 6.5rem box above the options. */
    const sourceFaces = () =>
      [...document.querySelectorAll<HTMLElement>("div")].filter(
        (d) => window.getComputedStyle(d).width === "6.5rem" && !d.closest('[data-testid="card-multi-pick"]'),
      );

    it("states the picker's instruction where the engine's count question stood", async () => {
      await mount();
      await state(countPrompt(2), revealBatch(HAND));
      expect(heading()).toHaveTextContent(INSTRUCTION);
      expect(screen.queryByText(ENGINE_QUESTION)).not.toBeInTheDocument();
      expect(screen.getByTestId("card-multi-pick-count")).toHaveTextContent("0 / 2 selected");
    });

    it("says 'card' for a one-card hand", async () => {
      await mount();
      await state(countPrompt(1), revealBatch([HAND[0]]), 1);
      expect(heading()).toHaveTextContent("Click up to 1 card from the opponent's hand to return to their deck");
    });

    it("leaves the played card's face out while the hand is shown", async () => {
      await mount();
      await state(countPrompt(2), revealBatch(HAND));
      expect(sourceFaces()).toHaveLength(0);
    });

    it("drops the question while the picks are being sent, and never flashes the engine's", async () => {
      await mount();
      await state(countPrompt(2), revealBatch(HAND));
      fireEvent.click(faces()[0]);
      confirm("Return 1 card");
      expect(heading()).not.toBeInTheDocument();
      await state({ ...targetPrompt("prompt-pick-1", HAND), description: "Choose a card to shuffle" });
      expect(screen.getByTestId("card-multi-pick-busy")).toBeInTheDocument();
      expect(screen.queryByText("Choose a card to shuffle")).not.toBeInTheDocument();
    });

    it("folds the combat summary away while the hand is shown, and brings it back after", async () => {
      await mount();
      await state(null, [], HAND.length, COMBAT);
      const panel = () => screen.getByTestId("pro-combat-panel");
      expect(panel()).toBeVisible();
      const mounted = panel();
      await state(countPrompt(2), revealBatch(HAND), HAND.length, COMBAT);
      expect(panel()).not.toBeVisible();
      // …through the "returning…" moment too, so the panel does not jump
      fireEvent.click(faces()[0]);
      confirm("Return 1 card");
      expect(panel()).not.toBeVisible();
      await state(null, [], HAND.length, COMBAT);
      expect(panel()).toBeVisible();
      // hidden, never unmounted: no combat beat replays when it returns
      expect(panel()).toBe(mounted);
    });

    it("leaves the combat summary alone for the same count prompt without the picker", async () => {
      await mount();
      await state(countPrompt(2), [], HAND.length, COMBAT);
      expect(screen.getByTestId("pro-combat-panel")).toBeVisible();
    });

    // The change is the picker's alone: the same count prompt without the picker,
    // and any other prompt, read exactly as before.
    it("keeps the engine's question and the played card when the picker is not up", async () => {
      await mount();
      await state(countPrompt(2));
      expect(heading()).toHaveTextContent(ENGINE_QUESTION);
      expect(sourceFaces()).toHaveLength(1);
    });

    it("gives the next prompt its own heading and card back", async () => {
      await mount();
      await state(countPrompt(2), revealBatch(HAND));
      confirm("Return none");
      await state({ ...targetPrompt("prompt-other", HAND), description: "Choose a card to discard", source: { card: "hero-a/strike#1" } });
      expect(heading()).toHaveTextContent("Choose a card to discard");
      expect(sourceFaces()).toHaveLength(1);
    });
  });
});
