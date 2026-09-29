/**
 * Update dialog (unbrewed-p2p-985): opens only for an unseen highlight, every
 * close path marks everything seen, and it does not reopen on the next visit.
 * Uses the real seen-state hook over jsdom localStorage with a fixed fixture.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { ChangelogEntry } from "../../lib/changelog/types";

const entry = (id: string, over: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  id,
  date: id.slice(0, 10),
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  tags: ["feature"],
  highlight: false,
  ...over,
});

const HEADLINE = entry("2026-03-05-headline", { highlight: true, pro: true });
const PLAIN_NEW = entry("2026-03-06-plain");
const OLDER_HL = entry("2026-03-02-older-hl", { highlight: true });
const SEEN = entry("2026-03-01-seen");
let fixture: ChangelogEntry[] = [];

// Chakra Modal's focus trap crashes jsdom's selector engine; pass children through.
jest.mock("@chakra-ui/focus-lock", () => ({
  FocusLock: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("../../lib/changelog/entries", () => ({
  getChangelogEntries: () => fixture,
}));

import {
  CHANGELOG_SEEN_KEY,
  __resetChangelogSeenForTest,
} from "../../lib/changelog/useChangelogSeen";
import { ChangelogUpdateDialog } from "./ChangelogUpdateDialog";

const renderDialog = () =>
  render(
    <ChakraProvider>
      <ChangelogUpdateDialog />
    </ChakraProvider>,
  );

const seedSeen = (id: string | null) => {
  window.localStorage.clear();
  window.localStorage.setItem("other", "1");
  if (id) window.localStorage.setItem(CHANGELOG_SEEN_KEY, id);
  __resetChangelogSeenForTest();
};

beforeEach(() => {
  fixture = [PLAIN_NEW, HEADLINE, OLDER_HL, SEEN];
  seedSeen(SEEN.id);
});

describe("ChangelogUpdateDialog", () => {
  it("opens with the newest unseen highlight and lists the others", async () => {
    renderDialog();
    expect(await screen.findByRole("dialog", { name: HEADLINE.title })).toBeInTheDocument();
    expect(screen.getByText(HEADLINE.summary)).toBeInTheDocument();
    expect(screen.getByText("Also new since your last visit")).toBeInTheDocument();
    expect(screen.getByText(PLAIN_NEW.title).closest("a")).toHaveAttribute(
      "href",
      `/changelog#${PLAIN_NEW.id}`,
    );
  });

  it("does not open for a brand-new visitor", () => {
    window.localStorage.clear();
    __resetChangelogSeenForTest();
    renderDialog();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open when the only unseen entries are not highlights", () => {
    fixture = [PLAIN_NEW, SEEN];
    renderDialog();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open when nothing is unseen", () => {
    seedSeen(PLAIN_NEW.id);
    renderDialog();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  const closers: [string, () => Promise<void>][] = [
    ["Got it", async () => void fireEvent.click(screen.getByRole("button", { name: "Got it" }))],
    ["close button", async () => void fireEvent.click(screen.getByRole("button", { name: "Close" }))],
    ["See all updates", async () => void fireEvent.click(screen.getByText("See all updates"))],
    ["Escape", async () => void fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })],
  ];

  it.each(closers)("%s marks everything seen and does not reopen", async (_name, close) => {
    const { unmount } = renderDialog();
    await screen.findByRole("dialog");
    await act(async () => {
      await close();
    });
    expect(window.localStorage.getItem(CHANGELOG_SEEN_KEY)).toBe(PLAIN_NEW.id);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Next visit: a fresh module store re-seeds from storage.
    unmount();
    __resetChangelogSeenForTest();
    renderDialog();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clicking the overlay marks everything seen", async () => {
    renderDialog();
    await screen.findByRole("dialog");
    const overlay = document.querySelector(".chakra-modal__content-container") as HTMLElement;
    await act(async () => {
      fireEvent.mouseDown(overlay);
      fireEvent.click(overlay);
    });
    expect(window.localStorage.getItem(CHANGELOG_SEEN_KEY)).toBe(PLAIN_NEW.id);
  });
});
