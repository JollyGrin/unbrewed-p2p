import { render, screen } from "@testing-library/react";
import { FIXTURES } from "@/lib/tableplace/fixtures/decks";
import { previewDeck } from "@/lib/tableplace/preview";
import { DeckPreviewCard } from "./DeckPreviewCard";

const { deck: oak } = FIXTURES["hollow-oak"];

describe("DeckPreviewCard — what a deck puts on the table", () => {
  it("lists the deck's pieces under its seat", () => {
    render(
      <DeckPreviewCard
        title="Your deck"
        preview={previewDeck(oak, () => "about:")}
      />,
    );
    const card = screen.getByTestId("deck-preview");
    expect(card.textContent).toContain("Your deck");
    expect(card.textContent).toContain("The Hollow Oak (16 HP)");
    expect(card.textContent).toContain("The Hollow Oak 16, The Ember Fox 6");
  });

  it("leaves the refusal to the rail", () => {
    render(<DeckPreviewCard title="Your deck" preview={previewDeck(oak)} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("tts-how")).toBeNull();
  });
});
