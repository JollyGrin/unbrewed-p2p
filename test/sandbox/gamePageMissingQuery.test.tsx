/**
 * #1607 — /game without ?name and ?gid sends the player to /connect (keeping
 * the gid as the lobby) instead of mounting WebGameProvider, whose missing-
 * query assertion would otherwise surface as the crash panel.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import GamePage from "@/pages/game";

const mockReplace = jest.fn();
let mockRouter: { isReady: boolean; query: Record<string, string> };
jest.mock("next/router", () => ({
  useRouter: () => ({ ...mockRouter, replace: mockReplace, push: jest.fn() }),
}));

jest.mock("../../lib/contexts/WebGameProvider", () => ({
  WebGameProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="web-game-provider">{children}</div>
  ),
}));
jest.mock("../../components/Game/GameShell", () => ({
  GameShell: () => <div data-testid="game-shell" />,
}));
jest.mock("../../components/Game/SandboxGameAnalytics", () => ({
  SandboxGameAnalytics: () => null,
}));
jest.mock("../../components/Helmet/Head", () => ({
  PageSeo: () => null,
}));

const renderPage = (query: Record<string, string>, isReady = true) => {
  mockRouter = { isReady, query };
  return render(
    <ChakraProvider>
      <GamePage />
    </ChakraProvider>,
  );
};

beforeEach(() => mockReplace.mockClear());

it("redirects a bare /game to /connect without mounting the provider", () => {
  renderPage({});
  expect(mockReplace).toHaveBeenCalledWith("/connect");
  expect(screen.queryByTestId("web-game-provider")).toBeNull();
  expect(screen.getByTestId("game-loading")).toBeTruthy();
});

it("keeps the gid as the /connect lobby when only the name is missing", () => {
  renderPage({ gid: "abc room" });
  expect(mockReplace).toHaveBeenCalledWith("/connect?lobby=abc%20room");
  expect(screen.queryByTestId("web-game-provider")).toBeNull();
});

it("redirects to /connect when only the gid is missing", () => {
  renderPage({ name: "x" });
  expect(mockReplace).toHaveBeenCalledWith("/connect");
  expect(screen.queryByTestId("web-game-provider")).toBeNull();
});

it("treats an empty name as missing", () => {
  renderPage({ name: "", gid: "abc" });
  expect(mockReplace).toHaveBeenCalledWith("/connect?lobby=abc");
});

it("mounts the game as today when name and gid are present", () => {
  renderPage({ name: "x", gid: "abc" });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByTestId("web-game-provider")).toBeTruthy();
  expect(screen.getByTestId("game-shell")).toBeTruthy();
});

it("shows the loading state, not the board, before the router is ready", () => {
  renderPage({}, false);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.queryByTestId("web-game-provider")).toBeNull();
  expect(screen.getByTestId("game-loading")).toBeTruthy();
});
