/**
 * The "What's new" nav link (unbrewed-p2p-984) always links to /changelog;
 * only its unseen-count pill reacts to useChangelogSeen.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { Navbar } from "./index";

// AccountChip reaches for next/router; not under test here.
jest.mock("../Account/AccountChip", () => ({ AccountChip: () => null }));

const mockUseChangelogSeen = jest.fn();
jest.mock("../../lib/changelog/useChangelogSeen", () => ({
  useChangelogSeen: () => mockUseChangelogSeen(),
}));

const entry = (id: string) => ({
  id,
  date: "2026-01-01",
  title: id,
  summary: "",
  tags: [],
  highlight: false,
});

const renderNavbar = () =>
  render(
    <ChakraProvider>
      <Navbar />
    </ChakraProvider>,
  );

describe("Navbar What's new link", () => {
  it("always links to /changelog", () => {
    mockUseChangelogSeen.mockReturnValue({ unseen: [], markAllSeen: jest.fn() });
    renderNavbar();
    expect(screen.getByRole("link", { name: "What's new" })).toHaveAttribute(
      "href",
      "/changelog",
    );
  });

  it("hides the pill when unseen is empty", () => {
    mockUseChangelogSeen.mockReturnValue({ unseen: [], markAllSeen: jest.fn() });
    renderNavbar();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows the unseen count in the pill", () => {
    mockUseChangelogSeen.mockReturnValue({
      unseen: [entry("2026-01-02-a"), entry("2026-01-01-b")],
      markAllSeen: jest.fn(),
    });
    renderNavbar();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
