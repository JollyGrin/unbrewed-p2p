import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import type { ChangelogEntry } from "@/lib/changelog/types";
import { ChangelogCard } from "./ChangelogCard";

// jest.mock targets must be relative — the "@/*" alias is an SWC import
// rewrite only, not a jest moduleNameMapper entry, so it can't be resolved
// here.
jest.mock("../../lib/changelog/media", () => ({
  videoUrl: jest.fn(),
  posterUrl: jest.fn(),
}));

import { posterUrl, videoUrl } from "@/lib/changelog/media";

const mockedPosterUrl = posterUrl as jest.Mock;
const mockedVideoUrl = videoUrl as jest.Mock;

const baseEntry: ChangelogEntry = {
  id: "2026-09-27-tabletop-view",
  date: "2026-09-27",
  title: "Pull up a chair: the tabletop view is here",
  summary: "Pro games can now be played on a 3D table.",
  tags: ["feature"],
  pro: true,
  highlight: true,
  cta: { label: "Try it in a Pro game", href: "/pro" },
};

const renderCard = (entry: ChangelogEntry, isNew = false, priority = false) =>
  render(
    <ChakraProvider>
      <ChangelogCard entry={entry} isNew={isNew} priority={priority} />
    </ChakraProvider>,
  );

afterEach(() => {
  jest.clearAllMocks();
});

describe("ChangelogCard", () => {
  it("renders a text-only card when the entry has no video", () => {
    renderCard(baseEntry);

    expect(screen.getByText(baseEntry.title)).toBeInTheDocument();
    expect(screen.getByText(baseEntry.summary)).toBeInTheDocument();
    expect(screen.getByText("Feature · Pro")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /play video/i })).not.toBeInTheDocument();
  });

  it("renders a text-only card when the entry has a video but the media base is unset", () => {
    mockedPosterUrl.mockReturnValue(null);
    mockedVideoUrl.mockReturnValue(null);

    renderCard({ ...baseEntry, video: { slug: "tabletop" } });

    expect(screen.queryByRole("button", { name: /play video/i })).not.toBeInTheDocument();
    expect(screen.getByText(baseEntry.title)).toBeInTheDocument();
  });

  it("renders a video card with a poster + play button when media is configured", () => {
    mockedPosterUrl.mockReturnValue("https://example.invalid/changelog/tabletop-poster.webp");
    mockedVideoUrl.mockReturnValue("https://example.invalid/changelog/tabletop.mp4");

    renderCard({ ...baseEntry, video: { slug: "tabletop" } });

    const playButton = screen.getByRole("button", { name: /play video/i });
    expect(playButton).toBeInTheDocument();
    // No <video> element mounted until the visitor presses play.
    expect(document.querySelector("video")).toBeNull();

    fireEvent.click(playButton);

    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("preload", "none");
    expect(video).toHaveAttribute("playsinline");
    expect(video?.querySelector("source")).toHaveAttribute(
      "src",
      "https://example.invalid/changelog/tabletop.mp4",
    );
  });

  it("lazy-loads the poster with explicit dimensions by default", () => {
    mockedPosterUrl.mockReturnValue("https://example.invalid/changelog/tabletop-poster.webp");
    mockedVideoUrl.mockReturnValue("https://example.invalid/changelog/tabletop.mp4");

    renderCard({ ...baseEntry, video: { slug: "tabletop" } });

    const poster = document.querySelector("img") as HTMLImageElement;
    expect(poster).toHaveAttribute("loading", "lazy");
    expect(poster).toHaveAttribute("decoding", "async");
    expect(poster).toHaveAttribute("width", "400");
    expect(poster).toHaveAttribute("height", "225");
    expect(poster).not.toHaveAttribute("fetchpriority");
  });

  it("loads the priority (first) card's poster eagerly with high fetch priority", () => {
    mockedPosterUrl.mockReturnValue("https://example.invalid/changelog/tabletop-poster.webp");
    mockedVideoUrl.mockReturnValue("https://example.invalid/changelog/tabletop.mp4");

    renderCard({ ...baseEntry, video: { slug: "tabletop" } }, false, true);

    const poster = document.querySelector("img") as HTMLImageElement;
    expect(poster).toHaveAttribute("loading", "eager");
    expect(poster).toHaveAttribute("fetchpriority", "high");
  });

  it("falls back to the text-only card when the poster fails to load", () => {
    mockedPosterUrl.mockReturnValue("https://example.invalid/changelog/tabletop-poster.webp");
    mockedVideoUrl.mockReturnValue("https://example.invalid/changelog/tabletop.mp4");

    renderCard({ ...baseEntry, video: { slug: "tabletop" } });

    const poster = document.querySelector("img");
    expect(poster).not.toBeNull();
    fireEvent.error(poster as HTMLImageElement);

    expect(screen.queryByRole("button", { name: /play video/i })).not.toBeInTheDocument();
    expect(screen.getByText(baseEntry.title)).toBeInTheDocument();
  });

  it("shows the New pill only when isNew is true", () => {
    const { rerender } = render(
      <ChakraProvider>
        <ChangelogCard entry={baseEntry} isNew={false} />
      </ChakraProvider>,
    );
    expect(screen.queryByText("New")).not.toBeInTheDocument();

    rerender(
      <ChakraProvider>
        <ChangelogCard entry={baseEntry} isNew />
      </ChakraProvider>,
    );
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("renders the cta as a link", () => {
    renderCard(baseEntry);
    const link = screen.getByRole("link", { name: baseEntry.cta!.label });
    expect(link).toHaveAttribute("href", "/pro");
  });
});
