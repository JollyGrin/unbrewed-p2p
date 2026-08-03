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
import { AccountChip } from "./AccountChip";
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
