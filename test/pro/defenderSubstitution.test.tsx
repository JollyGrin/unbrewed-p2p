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
 * ISSUE #737 ADDED THE OTHER SIDE OF THE TABLE. Appa's *Hallucinations* emits the
 * same event from the ATTACKER's seat, substituting among the OPPONENT's fighters
 * — and against a multi-sidekick opponent (Grievous's droids, Clone Troopers),
 * where "which droid?" is a real question. Three things have to hold there that
 * Ripley alone never exercised: the opposing sidekick must NAME correctly (not
 * fall back to its id tail), the board must chip the opponent's token, and the
 * copy must not claim the defender volunteered. Both seats' cases live in this
 * file so the one shared helper can never be tuned for one and broken for the
 * other.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, seeded reconnect
 * token, STATE frames over a real recorded view), as in effectAttackCombat.
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

/** Newt, on the board next to her hero — the fighter that defends instead. */
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
  it("tags the combat panel with who is defending instead", async () => {
    await play([
      [defending("p1/hero"), []],
      [defending("p1/sidekick-1"), [SUBSTITUTION]],
    ]);
    const tag = screen.getByText("NEWT DEFENDS INSTEAD");
    expect(tag).toHaveAttribute("title", expect.stringContaining("Newt takes over from Ellen Ripley"));
    expect(tag).toHaveAttribute("title", expect.stringContaining("the damage lands on Newt"));
  });

  it("chips the NEW defender on the board", async () => {
    // The board surface. Without it the arrow just re-points at another token.
    await play([
      [defending("p1/hero"), []],
      [defending("p1/sidekick-1"), [SUBSTITUTION]],
    ]);
    expect(screen.getAllByText("defends instead").length).toBeGreaterThan(0);
  });

  it("logs the substitution, naming where the damage lands", async () => {
    await play([
      [defending("p1/hero"), []],
      [defending("p1/sidekick-1"), [SUBSTITUTION]],
    ]);
    expect(
      screen.getAllByText(/Newt takes over from Ellen Ripley as the defender .* the damage lands on Newt/)
        .length
    ).toBeGreaterThan(0);
  });

  it("says nothing on an ORDINARY combat", async () => {
    // Regression guard: every combat the client has ever drawn must read exactly
    // as it did before v34.
    await play([[defending("p1/hero"), []]]);
    expect(screen.queryByText("NEWT DEFENDS INSTEAD")).not.toBeInTheDocument();
    expect(screen.queryByText("defends instead")).not.toBeInTheDocument();
  });

  it("drops the substitution once the combat is over", async () => {
    // The lifetime rule: a substitution is scoped to ONE combat. Left standing it
    // would ring a fighter nobody is attacking for the rest of the game.
    await play([
      [defending("p1/hero"), []],
      [defending("p1/sidekick-1"), [SUBSTITUTION]],
      [{ ...defending("p1/sidekick-1"), combat: null }, [{ type: "COMBAT_ENDED" }]],
    ]);
    expect(screen.queryByText("NEWT DEFENDS INSTEAD")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Hallucinations (issue #737 ↔ engine #522) — the substitution the ATTACKER
// forces, among the OPPONENT's fighters, against a multi-sidekick seat.
// ---------------------------------------------------------------------------

const droid = (n: number, space: string): ViewFighter => ({
  id: `p2/sidekick-${n}`,
  owner: "p2",
  kind: "SIDEKICK",
  name: "Battle Droid",
  space,
  tailSpace: null,
  hp: 4,
  maxHp: 4,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
});

/** Appa, the viewer's own hero: LARGE, so he straddles two spaces. */
const APPA: ViewFighter = {
  ...(BASE_VIEW.fighters[0] as ViewFighter),
  name: "Appa",
  size: "LARGE",
  space: "w1",
  tailSpace: "w2",
};

const GRIEVOUS: ViewFighter = {
  ...(BASE_VIEW.fighters[1] as ViewFighter),
  id: "p2/hero",
  owner: "p2",
  kind: "HERO",
  name: "General Grievous",
  space: "w3",
  tailSpace: null,
};

/** The ATTACKER's seat: p1 (the viewer) is swinging at p2's four-fighter squad. */
const attacking = (target: string): PlayerView => ({
  ...BASE_VIEW,
  activePlayer: "p1",
  turnPhase: "ACTION_SELECT",
  fighters: [APPA, GRIEVOUS, droid(1, "w3"), droid(2, "w4"), droid(3, "w3")],
  catalog: {
    ...BASE_VIEW.catalog,
    "hero-a/hallucinations": { title: "Hallucinations", type: "versatile", value: 2, boost: 2 },
    "hero-b/parry": { title: "PARRY", type: "defense", value: 3, boost: 2 },
  },
  combat: {
    attackerPlayer: "p1",
    defenderPlayer: "p2",
    attacker: "p1/hero",
    target,
    stage: "DURING",
    attackerCard: {
      instance: "hero-a/hallucinations#1",
      role: "ATTACK",
      boosts: [],
      effectiveValue: 2,
    },
    // The defence p2 already committed. It does NOT move when the defender does.
    defenderCard: { instance: "hero-b/parry#1", role: "DEFENSE", boosts: [], effectiveValue: 3 },
    additionalDefenseCard: null,
    outcome: null,
    attackDamageDealt: null,
  },
  prompt: null,
});

/** Grievous hands the blow to his third droid — an id the viewer does not own. */
const FORCED_SUBSTITUTION: GameEvent = {
  type: "COMBAT_DEFENDER_CHANGED",
  from: "p2/hero",
  to: "p2/sidekick-3",
};

describe("Hallucinations — the ATTACKER moves the defender, on the opposing seat", () => {
  it("names the OPPONENT's sidekick, squad-numbered, never its raw id", async () => {
    // The trap: a surface scoped to `view.self` would render "sidekick-3" here,
    // and three identically-named droids need the number to be readable at all.
    await play([
      [attacking("p2/hero"), []],
      [attacking("p2/sidekick-3"), [FORCED_SUBSTITUTION]],
    ]);
    const tag = screen.getByText("BATTLE DROID 3 DEFENDS INSTEAD");
    expect(tag).toHaveAttribute(
      "title",
      expect.stringContaining("Battle Droid 3 takes over from General Grievous as the defender"),
    );
    expect(tag).toHaveAttribute("title", expect.stringContaining("damage lands on Battle Droid 3"));
    expect(screen.queryByText(/sidekick-3/)).not.toBeInTheDocument();
  });

  it("chips the opponent's token on the board", async () => {
    await play([
      [attacking("p2/hero"), []],
      [attacking("p2/sidekick-3"), [FORCED_SUBSTITUTION]],
    ]);
    expect(screen.getAllByText("defends instead").length).toBeGreaterThan(0);
  });

  it("logs it neutrally — nobody 'stepped in', the attacker did this", async () => {
    await play([
      [attacking("p2/hero"), []],
      [attacking("p2/sidekick-3"), [FORCED_SUBSTITUTION]],
    ]);
    expect(
      screen.getAllByText(
        /Battle Droid 3 takes over from General Grievous as the defender .* the damage lands on Battle Droid 3/,
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/steps in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/steps back/i)).not.toBeInTheDocument();
  });

  it("keeps the already-committed defence card on the table", async () => {
    // The substitute INHERITS the defence the old defender committed, and the
    // combat card slots deliberately do not move. If the panel keyed anything on
    // the defender id, PARRY would blank or re-animate here.
    // The slot renders "<title> (<value>/<boost>)" — the value is the half that
    // would move if the panel re-derived the card from the new defender.
    const PARRY = /^PARRY \(3\/2\)$/;

    await play([[attacking("p2/hero"), []]]);
    const before = screen.getAllByText(PARRY).length;
    expect(before).toBeGreaterThan(0);
    cleanup();

    await play([
      [attacking("p2/hero"), []],
      [attacking("p2/sidekick-3"), [FORCED_SUBSTITUTION]],
    ]);
    expect(screen.getAllByText(PARRY)).toHaveLength(before);
  });

  it("says nothing when the opponent's squad defends normally", async () => {
    await play([[attacking("p2/hero"), []]]);
    expect(screen.queryByText("defends instead")).not.toBeInTheDocument();
  });
});
