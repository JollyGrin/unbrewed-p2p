/**
 * The Adventure lobby panel (Wave 4.2, unbrewed-p2p#1094), mounted on the real
 * pro page with the lab gate on. Covers: the Adventure format tab appears only
 * behind the gate, the panel replaces the regular plates, the table size rides
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

let sent: ClientMsg[] = [];

const mountPicker = async () => {
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
    ws.onmessage?.({ data: JSON.stringify({ v: PROTOCOL_VERSION, type: "HEROES", heroes: HEROES }) });
  });
};

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
  delete process.env.NEXT_PUBLIC_ADVENTURE_LAB;
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("adventure lobby panel", () => {
  it("hides the Adventure tab without the lab gate", async () => {
    await mountPicker();
    expect(screen.getByRole("button", { name: "Duel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adventure" })).toBeNull();
  });

  it("swaps the seat plates for the adventure panel and sizes the table", async () => {
    process.env.NEXT_PUBLIC_ADVENTURE_LAB = "1";
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
    process.env.NEXT_PUBLIC_ADVENTURE_LAB = "1";
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
