/**
 * /connect "Select map" step (#1375): the choice is local state and rides on
 * the /game push as `mapUrl` only when one was made.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConnectPage } from "./index";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";

const push = jest.fn();
let mockQuery: Record<string, string> = {};

jest.mock("next/router", () => ({
  useRouter: () => ({ query: mockQuery, push, prefetch: jest.fn() }),
}));
jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: "ok" }) },
}));
jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("../Navbar", () => ({ Navbar: () => null }));
jest.mock("../Discord", () => ({ DiscordPresence: () => null }));
jest.mock("../Settings/settings.modal", () => ({
  SettingsModal: () => null,
}));
jest.mock("../../lib/account/useAccount", () => ({
  useAccount: () => ({ status: "guest" }),
}));
jest.mock("../../lib/hooks", () => ({
  ...jest.requireActual("../../lib/hooks"),
  useLoadRouterDeck: () => ({ isLoading: false, error: undefined }),
}));
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({
    starredDeck: { id: "d", name: "Deck" },
    decks: [{ id: "d", name: "Deck" }],
    setStar: jest.fn(),
    isLoading: false,
  }),
  useBagMaps: () => ({ data: [] }),
}));
jest.mock("./SelectedDeck", () => ({ SelectedDeckContainer: () => null }));

Element.prototype.scrollIntoView = jest.fn();

const MAP_URL = "https://example.com/arena.png";

const renderConnect = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChakraProvider>
        <ConnectPage />
      </ChakraProvider>
    </QueryClientProvider>,
  );

const connect = async () => {
  fireEvent.change(screen.getByPlaceholderText("Your name"), {
    target: { value: "Ann" },
  });
  fireEvent.change(screen.getByPlaceholderText("lobby name"), {
    target: { value: "room" },
  });
  fireEvent.click(screen.getByText("Connect to Game"));
  await waitFor(() => expect(push).toHaveBeenCalled());
};

beforeEach(() => {
  push.mockClear();
  mockQuery = {};
  localStorage.clear();
  __resetBagStoresForTests();
});

describe("/connect — Select map", () => {
  it("omits mapUrl when no map was chosen", async () => {
    renderConnect();
    expect(screen.getByTestId("connect-map-title")).toHaveTextContent(
      "Default",
    );
    await connect();
    expect(push).toHaveBeenCalledWith("/game?name=Ann&gid=room");
  });

  it("appends the encoded mapUrl when one was chosen in the modal", async () => {
    renderConnect();
    fireEvent.click(screen.getByRole("button", { name: "Select map" }));
    // custom URL path: the same one the in-game modal offers
    fireEvent.click(await screen.findByText("Use a custom image URL"));
    fireEvent.change(screen.getByLabelText("Custom map image URL"), {
      target: { value: MAP_URL },
    });
    // the custom field is debounced before it becomes the selection
    await screen.findByAltText("custom map preview");
    await act(() => new Promise((res) => setTimeout(res, 400)));
    fireEvent.click(screen.getByRole("button", { name: "Select Map" }));
    await connect();
    expect(push).toHaveBeenCalledWith(
      "/game?name=Ann&gid=room&mapUrl=" + encodeURIComponent(MAP_URL),
    );
  });

  it("pre-selects the map from an invite link's ?mapUrl=", async () => {
    mockQuery = { mapUrl: MAP_URL };
    renderConnect();
    expect(screen.getByTestId("connect-map-title")).toHaveTextContent(
      "Custom map",
    );
    await connect();
    expect(push).toHaveBeenCalledWith(
      "/game?name=Ann&gid=room&mapUrl=" + encodeURIComponent(MAP_URL),
    );
  });
});
