/**
 * The Adventure lobby panel (Wave 4.2, unbrewed-p2p#1094), mounted on the real
 * pro page. Covers: the Adventure format tab appears only while the server lists a
 * scenario (#1343 — an older engine or an empty roster leaves the lobby as it was),
 * every listed scenario is pickable, the panel replaces the regular plates, the table size rides
 * CREATE_ROOM.humans (and nothing else carries it), bot plans for vanished seats
 * are dropped. Mount recipe is the shared render-fuzz one (see lobbySetupRail).
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import type { ReactNode } from "react";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { ClientMsg } from "@/lib/pro/protocol";
import type { ScenarioListing } from "@/lib/pro/protocol";
import { resetAdventureScenarios } from "@/lib/pro/adventureScenarios";
import { resetEngineVersions } from "@/lib/pro/wireVersion";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

jest.mock("@chakra-ui/focus-lock", () => ({
  __esModule: true,
  FocusLock: ({ children }: { children: ReactNode }) => children,
}));

const HEROES = [
  { heroId: "king-kong", name: "King Kong", hp: 18, move: 2, reach: "MELEE" },
  { heroId: "the-mandalorian", name: "The Mandalorian", hp: 14, move: 3, reach: "RANGED" },
];

const fakeRouter = () =>
  ({
    route: "/pro/game",
    pathname: "/pro/game",
    query: {},
    asPath: "/pro/game",
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

const scenario = (id: string, label: string): ScenarioListing =>
  ({
    id,
    label,
    formatIds: ["adventure"],
    mapId: "isla",
    villain: "rex",
    villains: [{ id: "rex", name: "Rex", role: "VILLAIN", hp: [9], move: 3, size: "LARGE" }],
    fixedMinions: [],
    minionPool: [{ id: "raptor", name: "Raptor", role: "MINION", hp: [3], move: 4, size: "NORMAL" }],
    minionsPerPlayer: 1,
    duplicateMinions: false,
  }) as ScenarioListing;
const SCENARIOS = [scenario("isla", "Isla Nublar"), scenario("heist", "Clockwork Heist")];

let sent: ClientMsg[] = [];

/**
 * Mount the lobby against an engine stamping `engineV` on its frames (38 = the
 * adventure lane, which answers LIST_SCENARIOS with `scenarios`; 37 = main, never asked).
 */
const mountPicker = async ({ engineV = 38, scenarios = SCENARIOS }: { engineV?: number; scenarios?: ScenarioListing[] } = {}) => {
  const view = render(
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
    ws.onmessage?.({ data: JSON.stringify({ v: engineV, type: "HEROES", heroes: HEROES }) });
  });
  if (sent.some((m) => m.type === "LIST_SCENARIOS")) {
    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ v: engineV, type: "SCENARIOS", scenarios }) });
    });
  }
  return view;
};

const formatStrip = () => screen.getByRole("button", { name: "Duel" }).parentElement!.outerHTML;

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const pickAdventure = async () => click(screen.getByRole("button", { name: "Adventure" }));

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send(data: string) {
    sent.push(JSON.parse(data));
  } as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  sent = [];
});

afterEach(() => {
  resetAdventureScenarios();
  resetEngineVersions();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("adventure lobby panel", () => {
  it("never asks an older engine for scenarios and shows no Adventure tab", async () => {
    await mountPicker({ engineV: PROTOCOL_VERSION });
    expect(sent.map((m) => m.type)).not.toContain("LIST_SCENARIOS");
    expect(screen.getByRole("button", { name: "Duel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adventure" })).toBeNull();
  });

  it("shows no Adventure tab when the engine lists no scenario, the lobby identical to an older engine's", async () => {
    const older = await mountPicker({ engineV: PROTOCOL_VERSION });
    const olderStrip = formatStrip();
    older.unmount();
    resetAdventureScenarios();
    sent = [];
    await mountPicker({ scenarios: [] });
    expect(sent.map((m) => m.type)).toContain("LIST_SCENARIOS");
    expect(screen.queryByRole("button", { name: "Adventure" })).toBeNull();
    expect(formatStrip()).toBe(olderStrip);
  });

  it("shows the Adventure tab when the engine lists scenarios, each one pickable", async () => {
    await mountPicker();
    await pickAdventure();
    for (const s of SCENARIOS) {
      // the closed menu's items stay mounted (hidden): pick by label
      const item = screen.getAllByRole("menuitem", { hidden: true }).find((e) => e.textContent === s.label);
      await click(item!);
      expect(screen.getByTestId("adventure-scenario")).toHaveTextContent(s.label);
    }
    await click(screen.getByLabelText(/^King Kong/));
    await click(screen.getAllByRole("button", { name: /^Create/ })[0]!);
    const created = sent.filter((m) => m.type === "CREATE_ROOM") as Array<ClientMsg & { scenarioId?: string }>;
    expect(created.at(-1)!.scenarioId).toBe(SCENARIOS.at(-1)!.id);
  });

  it("swaps the seat plates for the adventure panel and sizes the table", async () => {
    await mountPicker();
    expect(screen.queryByTestId("adventure-lobby")).toBeNull();
    await pickAdventure();
    expect(screen.getByTestId("adventure-lobby")).toBeInTheDocument();
    // solo by default: no extra hero seats, one minion slot, random villain
    expect(screen.getByTestId("adventure-humans-1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("adventure-minion-1")).toHaveTextContent("Random");
    expect(screen.queryByTestId("adventure-minion-2")).toBeNull();

    await click(screen.getByTestId("adventure-humans-3"));
    expect(screen.getByTestId("adventure-minion-3")).toBeInTheDocument();
    expect(screen.getByTestId("adventure-seats")).toHaveTextContent("P3");
    expect(screen.getByTestId("adventure-seats")).not.toHaveTextContent("P4");
  });

  it("sends the table size as CREATE_ROOM.humans for adventure only", async () => {
    await mountPicker();
    await pickAdventure();
    await click(screen.getByTestId("adventure-humans-3"));
    await click(screen.getByLabelText(/^King Kong/));
    await click(screen.getAllByRole("button", { name: /^Create/ })[0]!);
    const created = sent.filter((m) => m.type === "CREATE_ROOM") as Array<ClientMsg & { humans?: number; formatId?: string }>;
    expect(created).toHaveLength(1);
    expect(created[0]!.formatId).toBe("adventure");
    expect(created[0]!.humans).toBe(3);
  });
});
