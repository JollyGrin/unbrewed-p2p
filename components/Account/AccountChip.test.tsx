/**
 * The account chip (#459) is the only visible part of the accounts epic, and
 * it is additive by construction: these tests pin that it stays invisible
 * while probing and whenever the API is unreachable (a build with no accounts
 * backend must look exactly like today's site), that the sign-in link carries
 * the originating path so the round trip comes back where it started, and that
 * sign-out reverts to the guest chip.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { AccountChip, InGameAccountChip } from "./AccountChip";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

const mockTournaments = jest.fn();
const mockNextView = jest.fn();
// Relative paths: jest.mock() can't resolve the `@/` alias.
jest.mock("../../lib/tournaments/useNextMatch", () => ({ useMyTournaments: () => mockTournaments() }));
jest.mock("../../lib/tournaments/nextMatch", () => ({ nextMatchView: () => mockNextView() }));

let mockAsPath = "/";
jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: mockAsPath }),
}));

const USER = {
  id: "u1",
  username: "JollyGrin",
  avatarUrl: "https://cdn.discordapp.com/avatars/1/abc.png",
};

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: jest.Mock;

const renderChip = () =>
  render(
    <ChakraProvider>
      <AccountChip />
    </ChakraProvider>,
  );

beforeEach(() => {
  __resetAccountStoreForTests();
  mockAsPath = "/";
  mockTournaments.mockReturnValue(null);
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("AccountChip", () => {
  it("renders nothing at all when the accounts API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    renderChip();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByLabelText("Sign in with Discord")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("account-avatar")).toBeNull();
  });

  it("renders nothing while the probe is still in flight", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    renderChip();

    expect(screen.queryByLabelText("Sign in with Discord")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Discord sign-in with a return_to of the current page", async () => {
    mockAsPath = "/pro";
    fetchMock.mockResolvedValue(reply(401, { user: null }));

    renderChip();

    const link = await screen.findByLabelText("Sign in with Discord");
    expect(link).toHaveAttribute(
      "href",
      `${API_URL}/auth/discord?return_to=${encodeURIComponent("/pro")}`,
    );
  });

  it("shows the Discord avatar and username once signed in", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));

    renderChip();

    expect(await screen.findByText("JollyGrin")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sign in with Discord")).toBeNull();
    expect(screen.getByTestId("account-avatar")).toHaveAttribute(
      "src",
      USER.avatarUrl,
    );
  });

  it("lists Account, Collection, then Leaderboard, with Sign out last", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    renderChip();
    await screen.findByText("JollyGrin");

    fireEvent.click(screen.getByLabelText("Account: JollyGrin"));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Account",
      "Collection",
      "Leaderboard",
      "Sign out",
    ]);
    // Sign out is the one destructive item, so it stays at the bottom, past the
    // divider, where a mis-tap is least likely.
    expect(items[items.length - 1]).toHaveTextContent("Sign out");
  });

  it("links the menu's page items at their own routes", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    renderChip();
    await screen.findByText("JollyGrin");

    fireEvent.click(screen.getByLabelText("Account: JollyGrin"));

    expect(await screen.findByText("Account")).toHaveAttribute("href", "/account");
    expect(screen.getByText("Collection")).toHaveAttribute("href", "/collection");
    expect(screen.getByText("Leaderboard")).toHaveAttribute("href", "/leaderboard");
    // The navbar has no socket to protect, so these stay same-tab; only the
    // in-game chip opens them beside the game.
    expect(screen.getByText("Account")).not.toHaveAttribute("target");
  });

  it("signs out from the menu and reverts to the guest chip", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    renderChip();
    await screen.findByText("JollyGrin");

    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/auth/logout")
        ? reply(204, null)
        : reply(401, { user: null }),
    );
    fireEvent.click(screen.getByLabelText("Account: JollyGrin"));
    fireEvent.click(await screen.findByText("Sign out"));

    expect(await screen.findByLabelText("Sign in with Discord")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/auth/logout`,
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});

/**
 * The in-game chip rides the /pro/game lobby and the ProHud chip cluster, where
 * a full-page OAuth hop would kill the live socket and a new tab returning to
 * this game URL would open a second connection to the same room. These tests
 * pin the escape hatches that make it safe, the "costs nothing when idle"
 * property, and (#712) that its dropdown is the navbar's menu item for item —
 * only opened in a new tab, so a running game is never navigated away.
 */
describe("InGameAccountChip", () => {
  const renderInGame = () =>
    render(
      <ChakraProvider>
        <InGameAccountChip />
      </ChakraProvider>,
    );

  it("stays invisible when the accounts API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    renderInGame();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByLabelText("Sign in with Discord")).toBeNull();
    expect(screen.queryByTestId("account-avatar")).toBeNull();
  });

  it("signs in through a NEW tab that returns to /pro, never to this game", async () => {
    mockAsPath = "/pro/game?room=ABCD";
    fetchMock.mockResolvedValue(reply(401, { user: null }));

    renderInGame();

    const link = await screen.findByLabelText("Sign in with Discord");
    // Same-tab would drop the socket; returning to the game URL in the new tab
    // would open a second connection to the room. Neither may happen.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute(
      "href",
      `${API_URL}/auth/discord?return_to=${encodeURIComponent("/pro")}`,
    );
    expect(link.getAttribute("href")).not.toContain("game");
  });

  it("shows the avatar and username once signed in", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));

    renderInGame();

    expect(await screen.findByText("JollyGrin")).toBeInTheDocument();
    expect(screen.getByTestId("account-avatar")).toHaveAttribute(
      "src",
      USER.avatarUrl,
    );
    // Closed until asked for — the board must not carry a stray dropdown.
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("opens the SAME menu as the navbar chip, in the same order", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    renderInGame();
    await screen.findByText("JollyGrin");

    fireEvent.click(screen.getByLabelText("Signed in as JollyGrin"));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Account",
      "Collection",
      "Leaderboard",
      "Sign out",
    ]);
  });

  it("opens every menu link in a NEW tab, so the game keeps running", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    renderInGame();
    await screen.findByText("JollyGrin");

    fireEvent.click(screen.getByLabelText("Signed in as JollyGrin"));

    for (const [label, href] of [
      ["Account", "/account"],
      ["Collection", "/collection"],
      ["Leaderboard", "/leaderboard"],
    ] as const) {
      const item = await screen.findByText(label);
      expect(item).toHaveAttribute("href", href);
      // Same precedent as the guest chip's Discord handoff: navigating away
      // here would tear down the live game socket.
      expect(item).toHaveAttribute("target", "_blank");
      expect(item).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
    // Sign out is not a navigation, so it acts in place.
    expect(screen.getByText("Sign out")).not.toHaveAttribute("target");
  });

  it("signs out in place from the in-game menu", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    renderInGame();
    await screen.findByText("JollyGrin");

    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/auth/logout")
        ? reply(204, null)
        : reply(401, { user: null }),
    );
    fireEvent.click(screen.getByLabelText("Signed in as JollyGrin"));
    fireEvent.click(await screen.findByText("Sign out"));

    expect(await screen.findByLabelText("Sign in with Discord")).toBeVisible();
  });

  it("keeps the plain identity chip where a menu would nest (mobile HUD)", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));

    render(
      <ChakraProvider>
        <InGameAccountChip withMenu={false} />
      </ChakraProvider>,
    );

    expect(await screen.findByText("JollyGrin")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Signed in as JollyGrin"));
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("ignores window focus until the player actually starts a sign-in", async () => {
    fetchMock.mockResolvedValue(reply(401, { user: null }));
    renderInGame();
    await screen.findByLabelText("Sign in with Discord");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.focus(window);
    fireEvent.focus(window);

    // An idle game tab must never re-probe on its own.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-probes /me on focus after the sign-in tab is opened, then stops", async () => {
    fetchMock.mockResolvedValue(reply(401, { user: null }));
    renderInGame();
    fireEvent.click(await screen.findByLabelText("Sign in with Discord"));

    // Back from the Discord tab, now carrying a session.
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    fireEvent.focus(window);

    expect(await screen.findByText("JollyGrin")).toBeInTheDocument();
    const callsAfterSignIn = fetchMock.mock.calls.length;
    fireEvent.focus(window);
    fireEvent.focus(window);
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterSignIn);
  });

  it("costs exactly one extra probe per click, even if sign-in is abandoned", async () => {
    fetchMock.mockResolvedValue(reply(401, { user: null }));
    renderInGame();
    fireEvent.click(await screen.findByLabelText("Sign in with Discord"));
    expect(fetchMock).toHaveBeenCalledTimes(1); // the mount probe

    // Player closes Discord without signing in, then alt-tabs around. The
    // listener disarms on the first focus, so this can't become a poll.
    fireEvent.focus(window);
    fireEvent.focus(window);
    fireEvent.focus(window);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Clicking again re-arms it.
    fireEvent.click(screen.getByLabelText("Sign in with Discord"));
    fireEvent.focus(window);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});

describe("N1 (#1246): the next-match menu card is viewport-bounded", () => {
  it("wraps a long title instead of widening the page", async () => {
    const long = "An Extremely Long Tournament Name ".repeat(3);
    mockTournaments.mockReturnValue({
      mine: { tournaments: [] },
      next: { match: {}, detail: null, size: 8 },
    });
    mockNextView.mockReturnValue({ href: "/x", title: long, tournamentName: long, timeLeft: "", notice: long });
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    renderChip();
    fireEvent.click(await screen.findByText("JollyGrin"));
    const card = await screen.findByTestId("menu-next-match", {}, { timeout: 2000 });
    // jsdom doesn't resolve Emotion's cascade: assert on the injected rule text.
    const css = Array.from(document.querySelectorAll("style"))
      .map((el) => el.textContent ?? "" + Array.from((el as HTMLStyleElement).sheet?.cssRules ?? []).map((r) => r.cssText).join(""))
      .join("") +
      Array.from(document.styleSheets).flatMap((sh) => Array.from(sh.cssRules).map((r) => r.cssText)).join("");
    const rulesFor = (el: Element) =>
      Array.from(el.classList).map((c) => css.split("}").filter((r) => r.includes(`.${c}`)).join("}")).join("}");
    const cardCss = rulesFor(card);
    expect(cardCss).toMatch(/min-width:\s*0/);
    expect(cardCss).toMatch(/max-width:\s*100%/);
    expect(cardCss).toMatch(/white-space:\s*normal/);
    const title = screen.getAllByText(long.trim())[0];
    expect(rulesFor(title)).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

describe("the navbar menu loads /me/tournaments lazily (p2p #1269)", () => {
  it("not on page load for a signed-in visitor, only once the menu opens", async () => {
    mockTournaments.mockClear();
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    renderChip();
    expect(await screen.findByText("JollyGrin")).toBeInTheDocument();
    expect(mockTournaments).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Account: JollyGrin"));
    await waitFor(() => expect(mockTournaments).toHaveBeenCalled());
  });
});
