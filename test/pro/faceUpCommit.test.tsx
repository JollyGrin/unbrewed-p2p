/**
 * Commit-time FACE-UP play, end to end through the REAL Pro game page
 * (issue #772 ↔ engine #555, DSL v0.78.0; protocol stays 34).
 *
 * A card whose def declares `faceUp` is committed openly: it lands on
 * `combat.attackerCard` at COMMIT_DEFENSE, public to every viewer, and the defender
 * then picks a defense KNOWING the attack. That is the whole point of the primitive
 * — and it is invisible on the wire. `ViewCombatCard` carries no marker, the
 * attacker's `committedCard` stays null, and the slot the panel draws it in is the
 * same slot a REVEALED card uses. So a client that does nothing shows the defender a
 * card that looks exactly like a reveal that has already happened, with a mysteriously
 * empty defense slot beside it.
 *
 * What this pins is that the page says it out loud, for BOTH seats, and that the two
 * OTHER ways a face can be pre-reveal — a synthetic sub-attack and a linked effect
 * attack, shipped since v0.17.0 / v32 — keep reading exactly as they did.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, seeded reconnect token,
 * one STATE frame over a real recorded view), as in effectAttackCombat.
 */
import "@testing-library/jest-dom";
import { act, cleanup, render, screen } from "@testing-library/react";
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
import { FACE_UP_BADGE } from "@/lib/pro/faceUpCommit";
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

/** An ordinary hand card — `<cardDefId>#<n>`, the id grammar the inference reads. */
const FACE_UP_DEF = "hero-b/crushing-blow";
const FACE_UP_CARD = `${FACE_UP_DEF}#2`;
/** The two pre-reveal shapes that predate this ticket and must not be re-badged. */
const SUB_ATTACK = "sub-attack:p2/hero";
const LINKED = `hero-b/seismic-charge${LINKED_CARD_SUFFIX}`;

const CATALOG = {
  ...BASE_VIEW.catalog,
  [FACE_UP_DEF]: { title: "Crushing Blow", type: "attack" as const, value: 5, boost: 1 },
  "hero-b/seismic-charge": { title: "Seismic Charge", type: "attack" as const, value: 6, boost: 0 },
};

/** p2 attacks p1 and has committed — face up when `instance` is given. */
const combatAgainstYou = (instance: string | null): ViewCombat => ({
  attackerPlayer: "p2",
  defenderPlayer: "p1",
  attacker: "p2/hero",
  target: "p1/hero",
  stage: "COMMIT_DEFENSE",
  attackerCard: instance ? { instance, role: "ATTACK", boosts: [], effectiveValue: 5 } : null,
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
});

/** The DEFENDER's seat: p2 is active and its card (if any) is on the table. */
const defending = (instance: string | null): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p2",
  turnPhase: "ACTION_SELECT",
  catalog: CATALOG,
  combat: combatAgainstYou(instance),
  prompt: null,
});

/** The ATTACKER's own seat, mid face-up commit: `committedCard` is NULL — the engine
 *  puts the card on the combat instead — which is exactly the case that used to leave
 *  the attacker's own side of the panel showing "deciding…" over their own played card. */
const attackingFaceUp = (): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p1",
  turnPhase: "ACTION_SELECT",
  catalog: CATALOG,
  self: { ...BASE_VIEW.self, committedCard: null },
  combat: {
    ...combatAgainstYou(FACE_UP_CARD),
    attackerPlayer: "p1",
    defenderPlayer: "p2",
    attacker: "p1/hero",
    target: "p2/hero",
  },
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
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "face-up-test-token");
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("a face-up attack commit", () => {
  it("badges the attack card for the defender, before they have answered", async () => {
    await mountWithView(defending(FACE_UP_CARD));
    expect(screen.getAllByText(FACE_UP_BADGE).length).toBeGreaterThan(0);
    // The card itself, named — not a raw instance id.
    expect(screen.getAllByText(/Crushing Blow/).length).toBeGreaterThan(0);
  });

  it("tells the defender WHAT they are defending against, in words", async () => {
    // The UI reason the primitive exists: the defense picker is a decision made with
    // information. "printed" is literal — `effectiveValue` carries no boosts here.
    await mountWithView(defending(FACE_UP_CARD));
    expect(
      screen.getByText(/Played face up: Crushing Blow — printed value 5/),
    ).toBeInTheDocument();
  });

  it("badges the ATTACKER's own panel too, though their committedCard is null", async () => {
    await mountWithView(attackingFaceUp());
    expect(screen.getAllByText(FACE_UP_BADGE).length).toBeGreaterThan(0);
    // The attacker already knows their own card; the defender's prose line is the
    // defender's, so it must not be addressed to the player who played it.
    expect(screen.queryByText(/Choose your defense knowing it/)).not.toBeInTheDocument();
  });

  it("leaves an ordinary FACE-DOWN commit exactly as it was", async () => {
    await mountWithView(defending(null));
    expect(screen.queryByText(FACE_UP_BADGE)).not.toBeInTheDocument();
    expect(screen.queryByText(/Played face up/)).not.toBeInTheDocument();
  });

  it("does not badge a sub-attack or a linked effect attack", async () => {
    // Both are pre-reveal faces the client has drawn for releases. Badging either
    // would claim a player chose to play openly when no player chose anything.
    for (const instance of [SUB_ATTACK, LINKED]) {
      await mountWithView(defending(instance));
      expect(screen.queryByText(FACE_UP_BADGE)).not.toBeInTheDocument();
      cleanup();
      FakeWebSocket.reset();
    }
  });
});
