/**
 * Ellen Ripley's four prompts, end to end through the REAL Pro game page
 * (issue #681 ↔ engine #494). None of them is a new prompt KIND — they are the
 * `YES_NO` / `CHOOSE_OPTION` / `CHOOSE_TARGET` the client has always spoken, and
 * the ENGINE owns every word of their copy. That is exactly why they are worth
 * mounting: the client's job here is to render the server's wording INTACT and
 * answerable, and nothing in a unit test would notice if it didn't.
 *
 * The four, and what each would cost if it rendered wrong:
 *
 *  1. *GET BEHIND ME* — the v34 substitution offer (`optional`). Its label is the
 *     whole rules explanation ("the other becomes the defender"); a truncated or
 *     dropped label makes the swap a coin flip.
 *  2. *GET AWAY FROM HER, YOU *****!* — the conditional `grantBoost`. It is offered
 *     AFTER reveal, and the card faces it offers are the player's own hand.
 *  3. *MOMMY!* — the `chooseOne`, whose two options must read AS PRINTED, since
 *     "each recover 1" vs "recover 2" is the entire decision.
 *  4. SURROGATE MOTHER's death clause — a discard prompt with NO card source: it
 *     comes from the hero ability, so the panel must attribute it to the hero
 *     rather than render an unexplained "choose 2 cards".
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, seeded reconnect
 * token, one STATE frame over a real recorded view), as in cecilPrompts.
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
import type { PlayerView, ViewPrompt } from "@/lib/pro/protocol";
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

/** The engine's own label for the *GET BEHIND ME* offer — `{op:'optional'}`'s
 *  `label`, verbatim from ellen-ripley.rules.ts @ee9c276. */
const SWAP_LABEL = "Swap Ripley and Newt? (the other becomes the defender)";

const swapPrompt = (): ViewPrompt => ({
  promptId: "prompt-get-behind-me",
  player: "p1",
  kind: "YES_NO",
  // `optional` opens with no description — the label IS the question.
  source: { card: "ellen-ripley/get-behind-me#1" },
  options: [
    { id: "yes", label: SWAP_LABEL },
    { id: "no", label: `Decline: ${SWAP_LABEL}` },
  ],
});

const boostPrompt = (): ViewPrompt => ({
  promptId: "prompt-grant-boost",
  player: "p1",
  kind: "CHOOSE_TARGET",
  description: "Choose a card to give as a boost, or decline",
  source: { card: "ellen-ripley/get-away-from-her-you#1" },
  options: [
    { id: "ellen-ripley/regroup#3", label: "ellen-ripley/regroup#3", data: { card: "ellen-ripley/regroup#3" } },
    { id: "decline", label: "Decline boost", data: { card: "decline" } },
  ],
});

const mommyPrompt = (): ViewPrompt => ({
  promptId: "prompt-mommy",
  player: "p1",
  kind: "CHOOSE_OPTION",
  source: { card: "ellen-ripley/mommy#1" },
  options: [
    { id: "0", label: "Newt and Ripley each recover 1 health" },
    { id: "1", label: "Ripley recovers 2 health" },
  ],
});

/** SURROGATE MOTHER, clause 2. The source is the HERO (a `{hero: PlayerId}` ref —
 *  the seat whose ability is asking), not a card. */
const newtDeathDiscard = (): ViewPrompt => ({
  promptId: "prompt-newt-defeated",
  player: "p1",
  kind: "CHOOSE_TARGET",
  description: "Choose 2 cards to discard",
  source: { hero: "p1" },
  options: [
    { id: "ellen-ripley/feint#1", label: "ellen-ripley/feint#1", data: { card: "ellen-ripley/feint#1" } },
    { id: "ellen-ripley/skirmish#2", label: "ellen-ripley/skirmish#2", data: { card: "ellen-ripley/skirmish#2" } },
  ],
});

const asking = (prompt: ViewPrompt): PlayerView => ({
  ...BASE_VIEW,
  self: {
    ...BASE_VIEW.self,
    heroId: "ellen-ripley",
    hand: ["ellen-ripley/regroup#3", "ellen-ripley/feint#1", "ellen-ripley/skirmish#2"],
  },
  catalog: {
    ...BASE_VIEW.catalog,
    "ellen-ripley/regroup": { title: "REGROUP", type: "versatile", value: 1, boost: 2 },
    "ellen-ripley/feint": { title: "FEINT", type: "versatile", value: 2, boost: 3 },
    "ellen-ripley/skirmish": { title: "SKIRMISH", type: "versatile", value: 4, boost: 1 },
    "ellen-ripley/get-behind-me": { title: "GET BEHIND ME", type: "defense", value: 2, boost: 3 },
    "ellen-ripley/mommy": { title: "MOMMY!", type: "scheme", value: 0, boost: 2 },
    "ellen-ripley/get-away-from-her-you": {
      title: "GET AWAY FROM HER, YOU *****!",
      type: "attack",
      value: 4,
      boost: 3,
    },
  },
  prompt,
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

const mountWithView = async (view: PlayerView) => {
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
  await act(async () => {
    ws.onmessage?.({
      data: JSON.stringify({ v: PROTOCOL_VERSION, type: "STATE", view, legalActions: [], events: [] }),
    });
  });
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send() {} as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  window.sessionStorage.setItem(`unbrewed-pro-token-${ROOM}`, "ripley-prompts-test-token");
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("Ellen Ripley's prompts render as the engine words them", () => {
  it("offers the GET BEHIND ME swap with its full consequence spelled out", async () => {
    await mountWithView(asking(swapPrompt()));
    // The parenthetical is the rules text; a UI that dropped it would leave the
    // player choosing a swap without being told the defender moves with it.
    expect(screen.getByRole("button", { name: SWAP_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Decline: ${SWAP_LABEL}` })).toBeInTheDocument();
  });

  it("offers the conditional BOOST as cards plus a decline", async () => {
    await mountWithView(asking(boostPrompt()));
    expect(screen.getAllByText("Choose a card to give as a boost, or decline").length).toBeGreaterThan(0);
    // The offered hand card resolves to its printed title, never a raw instance id.
    expect(screen.getAllByText(/REGROUP/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/regroup#3/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline boost" })).toBeInTheDocument();
  });

  it("prints MOMMY!'s two options exactly as the card does", async () => {
    await mountWithView(asking(mommyPrompt()));
    expect(
      screen.getByRole("button", { name: "Newt and Ripley each recover 1 health" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ripley recovers 2 health" })).toBeInTheDocument();
  });

  it("attributes the Newt-death discard to the hero ability, not to a card", async () => {
    // SURROGATE MOTHER clause 2 is the only Ripley prompt with no card behind it.
    // Without the attribution line a player is asked to discard two cards with
    // nothing on screen saying why.
    await mountWithView(asking(newtDeathDiscard()));
    expect(screen.getAllByText("Choose 2 cards to discard").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ability/i).length).toBeGreaterThan(0);
  });
});
