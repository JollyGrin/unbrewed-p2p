/**
 * The BONUS ATTACK that opened somewhere else (issue #694), end to end through the
 * REAL Pro game page.
 *
 * Discord #🐛-report-bug, 2026-08-23: *"It really needs to be made clear when
 * Grievous' 2nd attack is being directed to someone other than the original target.
 * Rn nothing is rly showing that."*
 *
 * WHY THE v34 PATH DOES NOT COVER THIS. `COMBAT_DEFENDER_CHANGED` (issue #681) is
 * the client's signal for a defender that changes INSIDE one combat. Multi-Arm
 * Barrage is not that: Grievous commits a second attack face down during Combat 1
 * and only picks its target at COMMIT time, after the LUNGE placement — so Combat 2
 * arrives as a whole new combat (`BONUS_ATTACK_STARTED`) against a fighter the
 * player never declared against, and not one v34 event is emitted. The panel showed
 * an ordinary combat and the board arrow simply pointed at a different token.
 *
 * What this pins is the generic statement that covers both: the live combat's
 * target versus the target its ATTACKER declared. Panel tag and board chip, the
 * same two surfaces the substitution wears.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, seeded reconnect
 * token, STATE frames over a real recorded view), as in defenderSubstitution.
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

/** The declared target: the viewer's hero. */
const OBI_WAN: ViewFighter = { ...(BASE_VIEW.fighters[0] as ViewFighter), name: "Obi-Wan Kenobi" };
/** The fighter Combat 2 actually opens against. */
const CLONE: ViewFighter = {
  id: "p1/sidekick-1",
  owner: "p1",
  kind: "SIDEKICK",
  name: "Clone Trooper",
  space: "w2",
  tailSpace: null,
  hp: 1,
  maxHp: 1,
  reach: "RANGED",
  size: "NORMAL",
  defeated: false,
};
/** The attacker. */
const GRIEVOUS: ViewFighter = { ...(BASE_VIEW.fighters[1] as ViewFighter), name: "General Grievous" };

/** A live combat p2/hero is running against `target`, held before the reveal so no
 *  strike beat and no linger hold can decide which combat the panel draws. */
const combatOn = (target: string): ViewCombat => ({
  attackerPlayer: "p2",
  defenderPlayer: "p1",
  attacker: "p2/hero",
  target,
  stage: "COMMIT_DEFENSE",
  attackerCard: null,
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
});

/** The defender's seat, with a combat on the table against `target`. */
const defending = (target: string | null): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p2",
  turnPhase: "ACTION_SELECT",
  fighters: [OBI_WAN, CLONE, GRIEVOUS],
  combat: target ? combatOn(target) : null,
  prompt: null,
});

const DECLARED: GameEvent = { type: "ATTACK_DECLARED", attacker: "p2/hero", target: "p1/hero" };
const bonusAgainst = (target: string): GameEvent[] => [
  { type: "COMBAT_ENDED" },
  { type: "SECOND_ATTACK_COMMITTED", player: "p2" },
  { type: "BONUS_ATTACK_STARTED", attacker: "p2/hero", target },
];

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
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "bonus-attack-redirect-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

/** Combat 1 against the declared target, then Combat 2 against `target`. */
const redirectedTo = (target: string): [PlayerView, GameEvent[]][] => [
  [defending("p1/hero"), [DECLARED]],
  [defending(target), bonusAgainst(target)],
];

describe("Multi-Arm Barrage — Combat 2 opens against somebody else", () => {
  it("tags the combat panel with who is actually defending", async () => {
    await play(redirectedTo("p1/sidekick-1"));
    const tag = screen.getByText("NOW DEFENDING: CLONE TROOPER");
    expect(tag).toHaveAttribute("title", expect.stringContaining("Clone Trooper is defending"));
    expect(tag).toHaveAttribute(
      "title",
      expect.stringContaining("redirected away from Obi-Wan Kenobi"),
    );
  });

  it("chips the fighter taking the hit on the board", async () => {
    // The board surface. Without it the attack arrow just points at another token
    // with nothing saying why.
    await play(redirectedTo("p1/sidekick-1"));
    expect(screen.getAllByText("now defending").length).toBeGreaterThan(0);
  });

  it("says nothing when Combat 2 stays on the declared target", async () => {
    // Multi-Arm Barrage may re-take the SAME fighter. That is not a redirect and
    // must read exactly as an ordinary second combat.
    await play(redirectedTo("p1/hero"));
    expect(screen.queryByText(/NOW DEFENDING/)).not.toBeInTheDocument();
    expect(screen.queryByText("now defending")).not.toBeInTheDocument();
  });

  it("says nothing on an ordinary declared combat", async () => {
    await play([[defending("p1/hero"), [DECLARED]]]);
    expect(screen.queryByText(/NOW DEFENDING/)).not.toBeInTheDocument();
  });

  it("drops the callout once the combat is over", async () => {
    // Scoped to the combat: left standing it would ring a fighter nobody is
    // attacking for the rest of the game.
    await play([
      ...redirectedTo("p1/sidekick-1"),
      [defending(null), [{ type: "COMBAT_ENDED" }]],
    ]);
    expect(screen.queryByText(/NOW DEFENDING/)).not.toBeInTheDocument();
  });

  it("does not colour a droid's sub-attack, which nobody declared", async () => {
    // "Fire, you fools!" opens a combat from a DIFFERENT attacker. It targets
    // whoever it targets — there is no declaration behind it to have moved away
    // from, and calling it redirected would be a lie.
    await play([
      [defending("p1/hero"), [DECLARED]],
      [
        { ...defending("p1/sidekick-1"), combat: { ...combatOn("p1/sidekick-1"), attacker: "p2/sidekick-1", attackerPlayer: "p2" } },
        [
          { type: "COMBAT_ENDED" },
          { type: "SUB_ATTACK_INITIATED", attacker: "p2/sidekick-1", target: "p1/sidekick-1", value: 3 },
        ],
      ],
    ]);
    expect(screen.queryByText(/NOW DEFENDING/)).not.toBeInTheDocument();
  });
});
