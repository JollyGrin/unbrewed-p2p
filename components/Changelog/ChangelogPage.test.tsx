import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import type { ChangelogEntry } from "@/lib/changelog/types";

jest.mock("../Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

jest.mock("../../lib/changelog/media", () => ({
  videoUrl: () => null,
  posterUrl: () => null,
}));

const entry = (id: string, date: string, overrides: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  id,
  date,
  title: `Title for ${id}`,
  summary: `Summary for ${id}`,
  tags: ["feature"],
  highlight: false,
  ...overrides,
});

// 13 entries so "Older updates" has something to reveal (10 newest shown by
// default), spread across a few different dates and tags.
const mockEntries: ChangelogEntry[] = [
  entry("2026-09-27-c", "2026-09-27", { title: "Newest feature", tags: ["feature"] }),
  entry("2026-09-27-b", "2026-09-27", { title: "Second newest deck", tags: ["deck"] }),
  entry("2026-09-20-a", "2026-09-20", { title: "A fix from last week", tags: ["fix"] }),
  entry("2026-09-10-j", "2026-09-10", { tags: ["feature"] }),
  entry("2026-09-09-i", "2026-09-09", { tags: ["feature"] }),
  entry("2026-09-08-h", "2026-09-08", { tags: ["feature"] }),
  entry("2026-09-07-g", "2026-09-07", { tags: ["feature"] }),
  entry("2026-09-06-f", "2026-09-06", { tags: ["feature"] }),
  entry("2026-09-05-e", "2026-09-05", { tags: ["feature"] }),
  entry("2026-09-04-d2", "2026-09-04", { tags: ["feature"] }),
  entry("2026-09-03-d", "2026-09-03", { tags: ["feature"] }),
  entry("2026-09-02-d1", "2026-09-02", { tags: ["feature"] }),
  entry("2026-09-01-oldest", "2026-09-01", { title: "Oldest deck", tags: ["deck"] }),
];

// A mutable-per-test fixture (reset in `beforeEach`), read lazily so a test
// can swap in a different fixture (e.g. one tag only, for the zero-matches
// empty state) without the isolateModules/require dance. Must be named
// "mock*" — babel-plugin-jest-hoist only allows out-of-scope variables
// inside a jest.mock() factory when the name starts with "mock".
let mockActiveEntries: ChangelogEntry[] = mockEntries;

jest.mock("../../lib/changelog/entries", () => ({
  getChangelogEntries: () => mockActiveEntries,
}));

const mockMarkAllSeen = jest.fn();
let mockUnseen: ChangelogEntry[] = [];

jest.mock("../../lib/changelog/useChangelogSeen", () => ({
  useChangelogSeen: () => ({ unseen: mockUnseen, markAllSeen: mockMarkAllSeen }),
}));

import { ChangelogPage } from "./ChangelogPage";

const renderPage = () =>
  render(
    <ChakraProvider>
      <ChangelogPage />
    </ChakraProvider>,
  );

beforeEach(() => {
  jest.useFakeTimers();
  mockUnseen = [];
  mockActiveEntries = mockEntries;
  mockMarkAllSeen.mockClear();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

describe("ChangelogPage", () => {
  it("groups visible entries under date headings, newest first", () => {
    renderPage();

    const headings = screen.getAllByText(/2026$/);
    expect(headings.map((h) => h.textContent)).toEqual([
      "27 September 2026",
      "20 September 2026",
      "10 September 2026",
      "9 September 2026",
      "8 September 2026",
      "7 September 2026",
      "6 September 2026",
      "5 September 2026",
      "4 September 2026",
    ]);
  });

  it("shows only the 10 newest entries until 'Older updates' is pressed", () => {
    renderPage();

    expect(screen.getByText("Newest feature")).toBeInTheDocument();
    expect(screen.queryByText("Oldest deck")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Older updates" }));

    expect(screen.getByText("Oldest deck")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Older updates" })).not.toBeInTheDocument();
  });

  it("filters entries by tag when a chip is pressed", () => {
    renderPage();

    const decksChip = screen.getByRole("button", { name: "Decks" });
    expect(decksChip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(decksChip);

    expect(decksChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Second newest deck")).toBeInTheDocument();
    expect(screen.queryByText("Newest feature")).not.toBeInTheDocument();
    // All 13 entries have only 2 "deck" tagged, so no "Older updates" button
    // and no date headings for feature/fix-only dates.
    expect(screen.queryByRole("button", { name: "Older updates" })).not.toBeInTheDocument();
  });

  it("renders an empty-state line for a tag with zero matches, not a blank page", () => {
    mockActiveEntries = [entry("2026-09-27-only", "2026-09-27", { tags: ["feature"] })];
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Fixes" }));
    expect(screen.getByText("No fixes yet.")).toBeInTheDocument();
  });

  it("shows a New pill for unseen entries", () => {
    mockUnseen = [mockEntries[0]];
    renderPage();

    const card = screen.getByText("Newest feature").closest("article") as HTMLElement;
    expect(within(card).getByText("New")).toBeInTheDocument();

    const otherCard = screen.getByText("Second newest deck").closest("article") as HTMLElement;
    expect(within(otherCard).queryByText("New")).not.toBeInTheDocument();
  });

  it("calls markAllSeen after the mark-seen delay", () => {
    renderPage();
    expect(mockMarkAllSeen).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockMarkAllSeen).toHaveBeenCalledTimes(1);
  });

  it("calls markAllSeen on unmount even before the delay elapses", () => {
    const { unmount } = renderPage();
    expect(mockMarkAllSeen).not.toHaveBeenCalled();

    unmount();

    expect(mockMarkAllSeen).toHaveBeenCalledTimes(1);
  });
});
