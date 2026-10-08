import { render, screen } from "@testing-library/react";
import { FIXTURES } from "@/lib/tableplace/fixtures/decks";
import { previewDeck } from "@/lib/tableplace/preview";
import { mapKindLine, SeatRefusal } from "./TableRail";

const { deck: oak } = FIXTURES["hollow-oak"];

describe("SeatRefusal — how to bring a deck in (issue #1058)", () => {
  it("walks a deck with no table images through the TTS export", () => {
    render(<SeatRefusal seat="you" preview={previewDeck(oak)} />);
    const how = screen.getByTestId("tts-how");
    expect(how.textContent).toContain("TTS JSON");
    expect(how.textContent).toContain("Import from The Unmatched Club");
    expect(how.querySelector("a")?.getAttribute("href")).toBe("/bag");
  });

  it("stays quiet for a deck that can go on the table", () => {
    const { container } = render(
      <SeatRefusal seat="you" preview={previewDeck(oak, () => "about:")} />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("SeatRefusal — refusal (issue #1063)", () => {
  it("announces a refusal as an alert, naming the seat", () => {
    render(<SeatRefusal seat="them" preview={previewDeck(oak)} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Their deck can't go on the table: This deck's cards don't have table images yet.",
    );
  });
});

describe("mapKindLine", () => {
  it("says what figures do on each kind of map", () => {
    expect(mapKindLine({ group: "pro", spaces: true })).toBe(
      "Pro board · figures snap to spaces",
    );
    expect(mapKindLine({ group: "spaces", spaces: true })).toBe(
      "Figures snap to spaces",
    );
    expect(mapKindLine({ group: "bag", spaces: true })).toBe(
      "Figures snap to spaces",
    );
    expect(mapKindLine({ group: "bag", spaces: false })).toBe(
      "Image only · place figures freely",
    );
    expect(mapKindLine({ group: "image", spaces: false })).toBe(
      "Image only · place figures freely",
    );
  });
});
