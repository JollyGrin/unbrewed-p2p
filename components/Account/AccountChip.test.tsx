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
 * The in-game chip rides the ProHud chip cluster, where a full-page OAuth hop
 * would kill the live socket and a new tab returning to this game URL would
 * open a second connection to the same room. These tests pin the escape
 * hatches that make it safe, plus the "costs nothing when idle" property.
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

  it("shows the avatar and username with no sign-out menu mid-game", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));

    renderInGame();

    expect(await screen.findByText("JollyGrin")).toBeInTheDocument();
    expect(screen.getByTestId("account-avatar")).toHaveAttribute(
      "src",
      USER.avatarUrl,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Sign out")).toBeNull();
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
