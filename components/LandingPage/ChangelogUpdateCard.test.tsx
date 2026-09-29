/**
 * Landing-page latest-update card (unbrewed-p2p-984): renders the newest
 * unseen entry, or nothing when there is none; dismiss clears the pill too
 * via the shared markAllSeen().
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ChangelogUpdateCard } from "./ChangelogUpdateCard";
import type { ChangelogEntry } from "../../lib/changelog/types";

const mockUseChangelogSeen = jest.fn();
jest.mock("../../lib/changelog/useChangelogSeen", () => ({
  useChangelogSeen: () => mockUseChangelogSeen(),
}));

jest.mock("../../lib/changelog/media", () => ({
  posterUrl: jest.fn(() => null),
}));

const entry = (overrides: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  id: "2026-09-27-tabletop-view",
  date: "2026-09-27",
  title: "Pull up a chair: the tabletop view is here",
  summary: "Pro games can now be played on a 3D table.",
  tags: ["feature"],
  highlight: true,
  ...overrides,
});

const renderCard = () =>
  render(
    <ChakraProvider>
      <ChangelogUpdateCard />
    </ChakraProvider>,
  );

describe("ChangelogUpdateCard", () => {
  it("renders nothing when nothing is unseen", () => {
    mockUseChangelogSeen.mockReturnValue({ unseen: [], markAllSeen: jest.fn() });
    renderCard();
    expect(
      screen.queryByRole("button", { name: "Dismiss update" }),
    ).not.toBeInTheDocument();
  });

  it("shows the newest unseen entry's title, date and summary", () => {
    mockUseChangelogSeen.mockReturnValue({
      unseen: [entry(), entry({ id: "2026-09-14-irl-mode", title: "Older" })],
      markAllSeen: jest.fn(),
    });
    renderCard();
    expect(
      screen.getByText("Pull up a chair: the tabletop view is here"),
    ).toBeInTheDocument();
    expect(screen.getByText("27 Sep 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Pro games can now be played on a 3D table."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Older")).not.toBeInTheDocument();
  });

  it("shows a Watch action linking to /changelog#<id> when the entry has video", () => {
    mockUseChangelogSeen.mockReturnValue({
      unseen: [entry({ video: { slug: "tabletop" } })],
      markAllSeen: jest.fn(),
    });
    renderCard();
    expect(screen.getByRole("link", { name: "Watch" })).toHaveAttribute(
      "href",
      "/changelog#2026-09-27-tabletop-view",
    );
  });

  it("falls back to the entry's cta when there is no video", () => {
    mockUseChangelogSeen.mockReturnValue({
      unseen: [entry({ cta: { label: "Try it in a Pro game", href: "/pro" } })],
      markAllSeen: jest.fn(),
    });
    renderCard();
    expect(
      screen.getByRole("link", { name: "Try it in a Pro game" }),
    ).toHaveAttribute("href", "/pro");
    expect(screen.queryByRole("link", { name: "Watch" })).not.toBeInTheDocument();
  });

  it("dismiss calls markAllSeen", () => {
    const markAllSeen = jest.fn();
    mockUseChangelogSeen.mockReturnValue({ unseen: [entry()], markAllSeen });
    renderCard();
    screen.getByRole("button", { name: "Dismiss update" }).click();
    expect(markAllSeen).toHaveBeenCalledTimes(1);
  });
});
