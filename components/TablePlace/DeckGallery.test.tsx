import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { composeTable } from "@/lib/tableplace";
import {
  FIXTURES,
  elliotDeck,
  fakeFaces,
  labsDeck,
} from "@/lib/tableplace/fixtures/decks";
import { previewDeck } from "@/lib/tableplace/preview";
import { DeckGallery } from "./DeckGallery";
import { OpponentPaste } from "./OpponentPaste";
import { useOpponentDeck } from "./useOpponentDeck";

const { deck: oak } = FIXTURES["hollow-oak"];
const { deck: larry } = FIXTURES["larry-extra-characters"];

let seen: DeckImportType | undefined;
/** Tab 2 as the page wires it: the bag as tiles, the paste row above them. */
const Harness = ({
  decks,
  faces,
}: {
  decks: DeckImportType[];
  faces?: typeof fakeFaces;
}) => {
  const opponent = useOpponentDeck();
  seen = opponent.deck;
  return (
    <DeckGallery
      seat="them"
      entries={decks.map((deck) => ({
        deck,
        preview: previewDeck(deck, faces),
      }))}
      theirId={opponent.deck?.id}
      onPick={(id) => opponent.pickBag(id, decks)}
    >
      <OpponentPaste opponent={opponent} />
    </DeckGallery>
  );
};

const tile = (id: string) =>
  (screen.getAllByTestId("deck-tile") as HTMLButtonElement[]).find(
    (t) => t.dataset.deck === id,
  )!;
const chip = (name: RegExp) => screen.getByRole("button", { name });

describe("DeckGallery — bag decks for the opponent seat (issues #1049, #1118)", () => {
  beforeEach(() => {
    seen = undefined;
  });

  it("lists the bag as tiles and picking one sets the opponent", () => {
    render(<Harness decks={[oak, larry]} faces={fakeFaces} />);
    expect(
      screen.getAllByTestId("deck-tile").map((t) => t.dataset.deck),
    ).toEqual([oak.id, larry.id]);
    expect(tile(larry.id).textContent).toContain("15 HP · Larry");
    fireEvent.click(tile(larry.id));
    expect(seen?.id).toBe(larry.id);
    expect(tile(larry.id).getAttribute("aria-pressed")).toBe("true");
    expect(tile(larry.id).textContent).toContain("Them");
    expect(tile(oak.id).getAttribute("aria-pressed")).toBe("false");
  });

  it("says the bag is empty and keeps the paste field", () => {
    render(<Harness decks={[]} />);
    expect(screen.queryAllByTestId("deck-tile")).toHaveLength(0);
    expect(screen.getByTestId("bag-empty")).toBeTruthy();
    expect(screen.getByTestId("opponent-link")).toBeTruthy();
    expect(
      screen.getByText(
        "Picking a seat for a friend to fill is coming with open seats.",
      ),
    ).toBeTruthy();
  });

  it("says why a pasted link is no deck link", () => {
    render(<Harness decks={[]} />);
    fireEvent.change(screen.getByTestId("opponent-link"), {
      target: { value: "https://example.com/deck" },
    });
    fireEvent.click(screen.getByText("Load"));
    expect(screen.getByRole("alert").textContent).toContain(
      "That isn't a deck link.",
    );
  });

  it("a mirror of your own deck converts with distinct pack ids", () => {
    render(<Harness decks={[oak]} faces={fakeFaces} />);
    fireEvent.click(tile(oak.id));
    expect(seen?.id).toBe(oak.id);
    const { body } = composeTable({
      seats: [oak, seen!],
      map: { imageUrl: "https://x/m.webp", width: 1000, height: 800 },
      faces: fakeFaces,
    });
    const ids = body!.packs.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((i) => i.endsWith("-seat0")).length).toBe(1);
    expect(ids.filter((i) => i.endsWith("-seat1")).length).toBe(1);
  });
});

describe("DeckGallery — what can go on a table (issue #1118)", () => {
  const partial = () => {
    const deck = elliotDeck();
    deck.id = "partial";
    delete deck.deck_data.cards.find((c) => !c.isCharacterCard)!.cardImage;
    return deck;
  };

  it("splits the bag into ready and refused, counts both, and disables the refused", () => {
    const [ready, some] = [labsDeck(), partial()];
    render(<Harness decks={[oak, ready, some]} />);
    const readySection = screen.getByTestId("decks-ready");
    const needs = screen.getByTestId("decks-needs");
    expect(readySection.querySelector("h2")?.textContent).toBe(
      "Ready for the table",
    );
    expect(
      within(readySection)
        .getAllByTestId("deck-tile")
        .map((t) => t.dataset.deck),
    ).toEqual([ready.id]);
    expect(
      within(needs)
        .getAllByTestId("deck-tile")
        .map((t) => t.dataset.deck),
    ).toEqual([oak.id, some.id]);
    expect(within(tile(oak.id)).getByTestId("deck-reason").textContent).toBe(
      "No table images",
    );
    expect(within(tile(some.id)).getByTestId("deck-reason").textContent).toBe(
      "1 card has no image",
    );
    expect(tile(oak.id).disabled).toBe(true);
    expect(tile(some.id).disabled).toBe(true);
    expect(tile(ready.id).disabled).toBe(false);
    fireEvent.click(tile(oak.id));
    expect(seen).toBeUndefined();

    expect(chip(/^All 3$/).getAttribute("aria-pressed")).toBe("true");
    expect(chip(/^Table-ready 1$/)).toBeTruthy();
    expect(chip(/^Need images 2$/)).toBeTruthy();
  });

  it("filters to one section, and says so when it is empty", () => {
    const ready = labsDeck();
    render(<Harness decks={[ready]} />);
    // nothing refused: no empty section in the way
    expect(screen.queryByTestId("decks-needs")).toBeNull();
    fireEvent.click(chip(/^Need images 0$/));
    expect(screen.queryByTestId("decks-ready")).toBeNull();
    expect(screen.getByTestId("decks-needs").textContent).toContain(
      "Every deck in your bag is table-ready.",
    );
    expect(screen.queryByTestId("needs-how")).toBeNull();
    fireEvent.click(chip(/^Table-ready 1$/));
    expect(screen.queryByTestId("decks-needs")).toBeNull();
    expect(screen.getAllByTestId("deck-tile")).toHaveLength(1);
  });

  it("falls back to the deck's colour and initials when it has no cardback", () => {
    const deck = labsDeck();
    deck.deck_data.appearance.cardbackUrl = "";
    render(<Harness decks={[deck]} />);
    expect(tile(deck.id).querySelector("img")).toBeNull();
    expect(tile(deck.id).textContent).toContain(deck.name.substring(0, 2));
  });
});
