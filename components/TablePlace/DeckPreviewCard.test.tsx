import { render, screen } from "@testing-library/react";
import { FIXTURES } from "@/lib/tableplace/fixtures/decks";
import { previewDeck } from "@/lib/tableplace/preview";
import { DeckPreviewCard } from "./DeckPreviewCard";

const { deck: oak } = FIXTURES["hollow-oak"];

describe("DeckPreviewCard — how to bring a deck in (issue #1058)", () => {
  it("walks a deck with no table images through the TTS export", () => {
    render(<DeckPreviewCard title="Your deck" preview={previewDeck(oak)} />);
    const how = screen.getByTestId("tts-how");
    expect(how.textContent).toContain("TTS JSON");
    expect(how.textContent).toContain("Import from The Unmatched Club");
    expect(how.querySelector("a")?.getAttribute("href")).toBe("/bag");
  });

  it("stays quiet for a deck that can go on the table", () => {
    render(
      <DeckPreviewCard
        title="Your deck"
        preview={previewDeck(oak, () => "about:")}
      />,
    );
    expect(screen.queryByTestId("tts-how")).toBeNull();
  });
});
