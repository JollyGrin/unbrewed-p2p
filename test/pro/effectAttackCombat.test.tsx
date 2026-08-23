/**
 * The effect-initiated attack, end to end through the REAL Pro game page
 * (issue #671 ↔ engine #463, protocol v32).
 *
 * `{op:'attackWith'}` opens a combat from a card effect — Boba Fett's *Slave I:
 * FiresPray Strife* places him anywhere at the start of his next turn and attacks
 * with SEISMIC CHARGE — and the state that reaches the client is unlike any other
 * combat it has ever been sent:
 *
 *  - it arrives at `COMMIT_DEFENSE` with `attackerCard` ALREADY populated (face up,
 *    because the card that fired it named the attack in print), where every declared
 *    combat the client has seen was face-down until reveal;
 *  - the attack card is NOT in the opponent's deck list — it is a printed second
 *    face (`HeroDef.linkedCards`), so a client that resolves cards by deck
 *    membership finds nothing and renders a raw instance id;
 *  - nobody declared it and nobody spent an action.
 *
 * None of that would fail a unit test and all of it would make a real game read
 * like a bug, which is why this mounts the page. Same recipe as cecilPrompts: fake
 * WebSocket, seeded reconnect token, one STATE frame over a real recorded view.
 *
 * Art resolution is deliberately NOT mocked — the deck snapshot fetch fails under
 * jsdom, which is the WORST case, and the assertions below are what a player sees
 * even then: the catalog label, never a bare instance id.
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
import type { PlayerView, ViewCombat } from "@/lib/pro/protocol";
import { LINKED_CARD_SUFFIX } from "@/lib/pro/effectAttack";
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

/** The linked card's def id and the instance the engine mints for it —
 *  `makeCombatCard(`${op.card}#linked`, …)` in engine/effects.ts' attackWith arm. */
const SEISMIC_DEF = "hero-b/seismic-charge";
const SEISMIC = `${SEISMIC_DEF}${LINKED_CARD_SUFFIX}`;

/** An ordinary drawn attack, for the control case. */
const DRAWN_ATTACK = "hero-b/strike#2";

const combatWith = (instance: string, value: number): ViewCombat => ({
  attackerPlayer: "p2",
  defenderPlayer: "p1",
  attacker: "p2/hero",
  target: "p1/hero",
  // The stage that makes this unusual: face up BEFORE the defender commits.
  stage: "COMMIT_DEFENSE",
  attackerCard: { instance, role: "ATTACK", boosts: [], effectiveValue: value },
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
});

/** The victim's seat view: p2 (Boba) is active, the combat is open on the viewer. */
const attackedWith = (instance: string, value = 6): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p2",
  turnPhase: "ACTION_SELECT",
  catalog: {
    ...BASE_VIEW.catalog,
    // The engine registers HeroDef.linkedCards into GameContext.cards, and
    // server/redact.ts' catalogOf walks exactly that — so a linked card IS on the
    // wire even though it is in no deck list.
    [SEISMIC_DEF]: { title: "Seismic Charge", type: "attack", value: 6, boost: 0 },
    "hero-b/strike": { title: "Strike", type: "attack", value: 3, boost: 2 },
  },
  combat: combatWith(instance, value),
  prompt: null,
});

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
  return container;
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send() {} as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "effect-attack-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("SEISMIC CHARGE — a combat opened by a card effect", () => {
  it("shows the attack card FACE UP at COMMIT_DEFENSE, named from the catalog", async () => {
    // The point of the whole primitive: the defender gets a full defense window
    // against a KNOWN card, so the face must be up before they commit. A linked
    // card is in no deck list, so this is also the assertion that the client does
    // not fall through to the raw instance id.
    await mountWithView(attackedWith(SEISMIC));
    expect(screen.getAllByText(/Seismic Charge/).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(LINKED_CARD_SUFFIX))).not.toBeInTheDocument();
  });

  it("tags the combat as effect-initiated, and says no action was spent", async () => {
    await mountWithView(attackedWith(SEISMIC));
    const tag = screen.getByText("EFFECT ATTACK");
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAttribute("title", expect.stringContaining("Seismic Charge"));
    expect(tag).toHaveAttribute("title", expect.stringContaining("No action was spent"));
  });

  it("leaves an ORDINARY declared combat untagged", async () => {
    // Regression guard: the tag keys off the `#linked` instance suffix, so every
    // combat the client has ever drawn must keep reading exactly as it did.
    await mountWithView(attackedWith(DRAWN_ATTACK, 3));
    expect(screen.queryByText("EFFECT ATTACK")).not.toBeInTheDocument();
  });
});
