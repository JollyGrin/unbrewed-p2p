/**
 * The account chip on the /pro/game hero-select lobby (#709).
 *
 * The lobby renders no ProHud, so until this the avatar chip only appeared once
 * you were already IN a game. The one property worth pinning at page level is
 * WHICH chip it is: the lobby already holds a live websocket, so sign-in has to
 * be the new-tab (InGameAccountChip) variant — the page AccountChip's same-tab
 * OAuth hop would tear the socket down before the player ever picks a fighter.
 * Since #712 the chip also carries the navbar's dropdown here, with every link
 * pointed at a new tab for the same reason.
 *
 * Mount recipe is the shared render-fuzz one (fake WebSocket, real page), same
 * as randomStagePick — this test lives entirely in the pre-room picker.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context";
import { theme } from "@/styles/style";
import ProGamePage from "@/pages/pro/game";
import { PROTOCOL_VERSION } from "@/lib/pro/protocol";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { FakeWebSocket, installFakeWebSocket, installPolyfills } from "@/scripts/renderFuzz/domEnv";

const HEROES = [
  { heroId: "hero-a", name: "Ellen Ripley", hp: 12, move: 3, reach: "MELEE" },
  { heroId: "hero-b", name: "King Kong", hp: 18, move: 2, reach: "MELEE" },
];

const USER = {
  id: "u1",
  username: "JollyGrin",
  avatarUrl: "https://cdn.discordapp.com/avatars/1/abc.png",
};

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

/** `GET /me` answers `me`; anything else the page fetches is a benign 404. */
const mockMe = (me: { status: number; body: unknown }) => {
  const fetchMock = jest.fn(async (url: unknown) =>
    String(url).endsWith("/me")
      ? ({ ok: me.status < 400, status: me.status, json: async () => me.body } as Response)
      : ({ ok: false, status: 404, json: async () => ({}) } as Response),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

/** Mount the picker with a roster on the wire. */
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
  return ws;
};

beforeAll(() => {
  installPolyfills();
  installFakeWebSocket();
  FakeWebSocket.prototype.send = function send() {} as unknown as FakeWebSocket["send"];
});

beforeEach(() => {
  FakeWebSocket.reset();
  __resetAccountStoreForTests();
});

afterEach(() => {
  jest.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("hero-select lobby account chip", () => {
  it("shows the signed-in avatar and username before you join a game", async () => {
    mockMe({ status: 200, body: { user: USER } });

    await mountPicker();

    expect(await screen.findByLabelText("Signed in as JollyGrin")).toBeInTheDocument();
    expect(screen.getByTestId("account-avatar")).toHaveAttribute("src", USER.avatarUrl);
  });

  it("opens the shared account menu, every link in a new tab (#712)", async () => {
    mockMe({ status: 200, body: { user: USER } });

    await mountPicker();

    const chip = await screen.findByLabelText("Signed in as JollyGrin");
    await act(async () => {
      fireEvent.click(chip);
    });

    // Scoped + `hidden` on purpose: the menu is open (aria-expanded), but its
    // framer-motion enter animation never runs under jsdom, so the popper is
    // still `visibility: hidden` and the default role query would skip it.
    const menu = document.getElementById(chip.getAttribute("aria-controls") ?? "");
    if (!menu) throw new Error("the chip never opened its menu");
    const items = within(menu).getAllByRole("menuitem", { hidden: true });
    expect(items.map((i) => i.textContent)).toEqual([
      "Account",
      "Collection",
      "Leaderboard",
      "Sign out",
    ]);
    // The lobby socket is already live, so a same-tab hop would drop it.
    const collection = within(menu).getByText("Collection");
    expect(collection).toHaveAttribute("href", "/collection");
    expect(collection).toHaveAttribute("target", "_blank");
  });

  it("offers a guest the NEW-TAB Discord sign-in, so the lobby socket survives", async () => {
    mockMe({ status: 401, body: { user: null } });

    await mountPicker();

    const link = await screen.findByLabelText("Sign in with Discord");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute(
      "href",
      `${API_URL}/auth/discord?return_to=${encodeURIComponent("/pro")}`,
    );
  });

  it("stays invisible when the accounts API is unreachable", async () => {
    const fetchMock = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await mountPicker();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByLabelText("Sign in with Discord")).toBeNull();
    expect(screen.queryByTestId("account-avatar")).toBeNull();
  });
});
