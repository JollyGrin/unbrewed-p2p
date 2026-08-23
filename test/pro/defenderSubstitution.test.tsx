/**
 * The mid-combat defender substitution, end to end through the REAL Pro game page
 * (issue #681 ↔ engine #494, protocol v34).
 *
 * `COMBAT_DEFENDER_CHANGED { from, to }` — Ellen Ripley's *GET BEHIND ME*, "Ripley
 * and Newt may swap spaces, if they do, the other fighter is now the defender" —
 * is the smallest possible protocol change and the easiest one to render WRONG,
 * because rendering it wrong looks exactly like rendering it right:
 *
 *  - the view's `combat.target` moves on its own, so the board's attack arrow
 *    re-points with no code change at all — silently, between two frames;
 *  - the combat CARD SLOTS deliberately do not move (the committed defense card
 *    stays put), so the panel looks untouched;
 *  - and then the damage lands on a figure nobody attacked.
 *
 * A client that "handles" the event by doing nothing therefore passes every naive
 * check and still shows the player an unexplained hit. What this test pins is that
 * BOTH surfaces say it out loud: the combat panel tags who stepped in, and the
 * board rings and chips the NEW defender.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, seeded reconnect
 * token, STATE frames over a real recorded view), as in effectAttackCombat.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { GameEvent, PlayerView, ViewCombat, ViewFighter } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const ROOM = "HOST";

const BASE_VIEW: PlayerView = JSON.parse(
  readFileSync(
    join(process.cwd(), "test", "replays", "smokebot", "sample", "sample-game-0001.views.jsonl"),
    "utf8",
  )
    .trim()
    .split("\n")[0],
).view;

/** Newt, on the board next to her hero — the fighter that steps in. */
const NEWT: ViewFighter = {
  id: "p1/sidekick-1",
  owner: "p1",
  kind: "SIDEKICK",
  name: "Newt",
  space: "w2",
  tailSpace: null,
  hp: 7,
  maxHp: 7,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
};

/** The hero the sample view ships, renamed so the two fighters read apart. */
const RIPLEY: ViewFighter = { ...(BASE_VIEW.fighters[0] as ViewFighter), name: "Ellen Ripley" };

const combatOn = (target: string): ViewCombat => ({
  attackerPlayer: "p2",
  defenderPlayer: "p1",
  attacker: "p2/hero",
  target,
  // Past reveal: both cards are down and the substitution happens in the
  // IMMEDIATELY window, before values are compared.
  stage: "DURING",
  attackerCard: { instance: "hero-b/strike#2", role: "ATTACK", boosts: [], effectiveValue: 3 },
  defenderCard: { instance: "hero-a/get-behind-me#1", role: "DEFENSE", boosts: [], effectiveValue: 2 },
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
});

/** The defender's seat: p2 is attacking, Ripley and Newt are both on the board. */
const defending = (target: string): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p2",
  turnPhase: "ACTION_SELECT",
  fighters: [RIPLEY, NEWT, BASE_VIEW.fighters[1] as ViewFighter],
  catalog: {
    ...BASE_VIEW.catalog,
    "hero-a/get-behind-me": { title: "GET BEHIND ME", type: "defense", value: 2, boost: 3 },
    "hero-b/strike": { title: "Strike", type: "attack", value: 3, boost: 2 },
  },
  combat: combatOn(target),
  prompt: null,
});

const SUBSTITUTION: GameEvent = {
  type: "COMBAT_DEFENDER_CHANGED",
  from: "p1/hero",
  to: "p1/sidekick-1",
};

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

/** Mount the page, then push each [view, events] frame as its own STATE. */
const play = async (frames: [PlayerView, GameEvent[]][]) => {
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
  for (const [view, events] of frames) {
    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view, legalActions: [], events }),
      });
    });
  }
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send() {} as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "defender-substitution-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("GET BEHIND ME — the defender changes mid-combat", () => {
  it("tags the combat panel with who stepped in", async () => {
    await play([
      [defending("p1/hero"), []],
      [defending("p1/sidekick-1"), [SUBSTITUTION]],
    ]);
    const tag = screen.getByText("NEWT STEPS IN");
    expect(tag).toHaveAttribute("title", expect.stringContaining("Newt steps in as the defender"));
    expect(tag).toHaveAttribute("title", expect.stringContaining("Ellen Ripley steps back"));
  });

  it("chips the NEW defender on the board", async () => {
    // The board surface. Without it the arrow just re-points at another token.
    await play([
      [defending("p1/hero"), []],
      [defending("p1/sidekick-1"), [SUBSTITUTION]],
    ]);
    expect(screen.getAllByText("steps in").length).toBeGreaterThan(0);
  });

  it("logs the substitution, naming where the damage lands", async () => {
    await play([
      [defending("p1/hero"), []],
      [defending("p1/sidekick-1"), [SUBSTITUTION]],
    ]);
    expect(
      screen.getAllByText(/Newt steps in as the defender .* the damage lands on Newt/).length
    ).toBeGreaterThan(0);
  });

  it("says nothing on an ORDINARY combat", async () => {
    // Regression guard: every combat the client has ever drawn must read exactly
    // as it did before v34.
    await play([[defending("p1/hero"), []]]);
    expect(screen.queryByText("NEWT STEPS IN")).not.toBeInTheDocument();
    expect(screen.queryByText("steps in")).not.toBeInTheDocument();
  });

  it("drops the substitution once the combat is over", async () => {
    // The lifetime rule: a substitution is scoped to ONE combat. Left standing it
    // would ring a fighter nobody is attacking for the rest of the game.
    await play([
      [defending("p1/hero"), []],
      [defending("p1/sidekick-1"), [SUBSTITUTION]],
      [{ ...defending("p1/sidekick-1"), combat: null }, [{ type: "COMBAT_ENDED" }]],
    ]);
    expect(screen.queryByText("NEWT STEPS IN")).not.toBeInTheDocument();
  });
});
