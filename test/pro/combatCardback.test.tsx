/**
 * Face-down combat slots show the committing player's DECK CARDBACK, and the
 * reveal plays as a 3D flip (issue #735).
 *
 * Until now an opponent's committed-but-unrevealed card drew a bare dashed box
 * literally reading "face-down" — a text label where every other surface in the
 * game (roster tiles, the landing page) already shows the deck's cardback art.
 * Now the slot renders `heroDeckMeta(heroId).cardbackUrl` behind the same
 * "face-down" tag, and on reveal the cardback flips (rotateY transition) into
 * the face. Decks without cardback art fall back to the gold "?" HiddenRevealBack.
 *
 * Mounts the page end to end (same recipe as effectAttackCombat: fake
 * WebSocket, seeded reconnect token, one STATE frame over a real recorded
 * view). The flip itself is a CSS transition — jsdom can't animate it — so
 * these tests pin the four RENDER states the flip sits between.
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

/** king-kong's deck (kdKM) is the roster entry WITH self-hosted cardback art;
 *  the smokebot sample's hero-a/hero-b have no deck meta at all. */
const CARDBACKED_HERO = "king-kong";

/** An ordinary combat mid-defense-window: the opponent (p2) has committed face
 *  down, the viewer (p1) has not committed yet. */
const combatAt = (stage: ViewCombat["stage"]): ViewCombat => ({
  attackerPlayer: "p2",
  defenderPlayer: "p1",
  attacker: "p2/hero",
  target: "p1/hero",
  stage,
  attackerCard: null,
  defenderCard: null,
  additionalDefenseCard: null,
  outcome: null,
  attackDamageDealt: null,
});

const viewWith = (
  combat: ViewCombat,
  opts: { heroes: [string, string]; committedCard?: string | null },
): PlayerView => {
  const [p1Hero, p2Hero] = opts.heroes;
  return {
    ...BASE_VIEW,
    activePlayer: "p2",
    turnPhase: "ACTION_SELECT",
    players: BASE_VIEW.players.map((p) =>
      p.id === "p1" ? { ...p, heroId: p1Hero } : { ...p, heroId: p2Hero },
    ),
    self: { ...BASE_VIEW.self, heroId: p1Hero, committedCard: opts.committedCard ?? null },
    catalog: {
      ...BASE_VIEW.catalog,
      "hero-b/strike": { title: "Strike", type: "attack", value: 3, boost: 2 },
      "hero-b/block": { title: "Block", type: "defense", value: 3, boost: 0 },
    },
    combat,
    prompt: null,
  };
};

/** Both cards revealed (stage DAMAGE — past every commit window). */
const revealedView = (heroes: [string, string]): PlayerView =>
  viewWith(
    {
      ...combatAt("DAMAGE"),
      attackerCard: { instance: "hero-b/strike#2", role: "ATTACK", boosts: [], effectiveValue: 5 },
      defenderCard: { instance: "hero-b/block#1", role: "DEFENSE", boosts: [], effectiveValue: 3 },
    },
    { heroes },
  );

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
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "combat-cardback-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("face-down combat slots (#735)", () => {
  it("shows the opponent's deck cardback while their commit is unrevealed", async () => {
    // The opponent committed; their attack slot is face-down. The deck HAS a
    // cardback, so the slot renders it — not a dashed "face-down" text box.
    // The viewer's own defense window is still open, so the deciding…
    // placeholder stays up on THAT slot (exactly one cardback on the panel).
    await mountWithView(viewWith(combatAt("COMMIT_DEFENSE"), { heroes: ["hero-a", CARDBACKED_HERO] }));
    expect(screen.getByLabelText("face-down card")).toBeInTheDocument();
    expect(screen.getAllByLabelText("face-down card")).toHaveLength(1);
    expect(screen.getByText("deciding…")).toBeInTheDocument();
  });

  it("falls back to the gold '?' HiddenRevealBack when the deck has no cardback art", async () => {
    // hero-a/hero-b have no POPULAR_DECKS entry ⇒ no cardbackUrl ⇒ the same
    // gold-framed "?" back redacted reveals use — never a broken image.
    await mountWithView(viewWith(combatAt("COMMIT_DEFENSE"), { heroes: ["hero-a", "hero-b"] }));
    expect(screen.getByText("HIDDEN")).toBeInTheDocument();
    expect(screen.queryByLabelText("face-down card")).not.toBeInTheDocument();
  });

  it("renders the revealed faces at DAMAGE (the flip's destination)", async () => {
    await mountWithView(revealedView(["hero-a", "hero-b"]));
    // Snapshot fetch fails under jsdom (worst case), so the faces render their
    // catalog fallback labels — "Strike (5/2)" / "Block (3/0)".
    expect(screen.getAllByText(/Strike/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Block/).length).toBeGreaterThan(0);
  });

  it("keeps the dashed 'deciding…' placeholder for a slot with no commit", async () => {
    // At COMMIT_ATTACK the attacker hasn't committed (deciding…), while the
    // defense slot reads committed — with the cardbacked deck on the DEFENDER
    // (the viewer, p1) that slot is the ONLY cardback on the panel, proving the
    // deciding one never got one.
    await mountWithView(viewWith(combatAt("COMMIT_ATTACK"), { heroes: [CARDBACKED_HERO, "hero-b"] }));
    expect(screen.getByText("deciding…")).toBeInTheDocument();
    expect(screen.getAllByLabelText("face-down card")).toHaveLength(1);
    expect(screen.queryByText("HIDDEN")).not.toBeInTheDocument();
  });
});
