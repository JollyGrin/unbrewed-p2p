/**
 * The jevx3 unlock gate (#933), through the REAL Pro picker.
 *
 * The pure rules live in lib/pro/tierUnlock.ts (and its tests); what is pinned
 * here is the wiring: the P2 plate's jevx3 chip is rendered but inert until the
 * record vs Expert says 15 wins, it carries its hint for hover/focus/AT, and a
 * seat armed with jevx3 is coerced down (to Expert) the moment the tier locks —
 * so a locked tier can never reach CREATE_ROOM.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, real page); the
 * accounts API is a stubbed `fetch` (`/me` + `/me/stats`), re-probed per test.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { refreshAccount } from "@/lib/account/useAccount";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import type { ClientMsg } from "@/lib/pro/protocol";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const TIERS = ["easy", "medium", "hard", "expert", "jev", "jevx3"];
const HEROES = [
  { heroId: "hero-a", name: "Ellen Ripley", hp: 12, move: 3, reach: "MELEE", botTiers: TIERS },
  { heroId: "hero-b", name: "King Kong", hp: 18, move: 2, reach: "MELEE", botTiers: TIERS },
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
let fetchedUrls: string[] = [];

type Api = { me: "guest" | "signed-in"; expertWins?: number };
const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

/** Point the stubbed accounts API at a new truth and re-run the `/me` probe. */
const setApi = async (api: Api) => {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    fetchedUrls.push(url);
    if (url.endsWith("/me/stats")) {
      return json(200, {
        totalGames: 30,
        wins: 20,
        losses: 10,
        byOpponentKind: { human: null, bots: [{ difficulty: "expert", games: 30, wins: api.expertWins ?? 0 }] },
      });
    }
    if (url.endsWith("/me")) {
      return api.me === "guest" ? json(401, {}) : json(200, { user: { id: "u1", username: "Tester" } });
    }
    return json(404, {});
  }) as unknown as typeof fetch;
  await act(async () => {
    await refreshAccount();
  });
};

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
  // let the stats request settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await click(screen.getByLabelText(/Ellen Ripley/));
};

const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** The duel P2 plate's chips (rendered once per layout — any copy will do). */
const chip = (tier: string) => screen.getAllByTestId(`seat-chip-${tier}`)[0];

const createdBot = () => {
  const created = sent.filter((m) => m.type === "CREATE_ROOM");
  expect(created).toHaveLength(1);
  return (created[0] as ClientMsg & { bot?: { difficulty: string } }).bot;
};

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
  fetchedUrls = [];
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("jevx3 unlock gate (#933)", () => {
  it("guest: the chip renders locked, a click changes nothing, and the hint is exposed", async () => {
    await setApi({ me: "guest" });
    await mountPicker();

    // The server lists `jev` too, but the client never renders it (#933).
    expect(screen.queryAllByTestId("seat-chip-jev")).toHaveLength(0);

    const locked = chip("jevx3");
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).not.toBeDisabled(); // still focusable so the tooltip can open
    expect(locked).toHaveTextContent(/^Bot·P\s*preview$/i);
    expect(locked.textContent).not.toMatch(/\d/); // the everyday name has no version
    expect(locked).toHaveAccessibleName(/Prodigy 3/); // …the full name is in the hint
    // Nothing a player can read names the tech behind the tier.
    expect(`${locked.textContent} ${locked.getAttribute("aria-label")}`).not.toMatch(/jev|llm|api|ismcts/i);
    expect(locked).toHaveAccessibleName(/Sign in and win 15 vs Expert to unlock/);

    await click(locked);
    expect(chip("jevx3")).toHaveAttribute("aria-pressed", "false");
    expect(chip("human")).toHaveAttribute("aria-pressed", "true");

    // A guest never asks for stats.
    expect(fetchedUrls.some((u) => u.endsWith("/me/stats"))).toBe(false);

    await click(screen.getAllByTestId("pro-create-button")[0]);
    expect(createdBot()).toBeUndefined();
  });

  it("signed in with 14 wins: locked with N/15 progress", async () => {
    await setApi({ me: "signed-in", expertWins: 14 });
    await mountPicker();

    const locked = chip("jevx3");
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).toHaveAccessibleName(/14\/15 wins vs Expert to unlock/);
    await click(locked);
    expect(chip("jevx3")).toHaveAttribute("aria-pressed", "false");
  });

  it("signed in with 15 wins: selectable, and CREATE_ROOM carries jevx3", async () => {
    await setApi({ me: "signed-in", expertWins: 15 });
    await mountPicker();

    const open = chip("jevx3");
    expect(open).not.toHaveAttribute("aria-disabled");
    // Looking closer (hover) shows the full, versioned name.
    await act(async () => {
      fireEvent.pointerEnter(open);
      fireEvent.focus(open);
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Prodigy 3 · preview");
    await click(open);
    expect(chip("jevx3")).toHaveAttribute("aria-pressed", "true");

    await click(screen.getAllByTestId("pro-create-button")[0]);
    expect(createdBot()?.difficulty).toBe("jevx3");
  });

  it("a seat armed with jevx3 is coerced to expert when the tier locks", async () => {
    await setApi({ me: "signed-in", expertWins: 15 });
    await mountPicker();
    await click(chip("jevx3"));
    expect(chip("jevx3")).toHaveAttribute("aria-pressed", "true");

    // Signing out drops the record → the tier locks → the armed seat is pruned.
    await setApi({ me: "guest" });
    expect(chip("jevx3")).toHaveAttribute("aria-disabled", "true");
    expect(chip("jevx3")).toHaveAttribute("aria-pressed", "false");
    expect(chip("expert")).toHaveAttribute("aria-pressed", "true");

    await click(screen.getAllByTestId("pro-create-button")[0]);
    expect(createdBot()?.difficulty).toBe("expert");
  });
});
