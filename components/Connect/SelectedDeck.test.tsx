import { fireEvent, render, screen } from "@testing-library/react";
import { SelectedDeckContainer } from "./SelectedDeck";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";

const deck = (id: string, name: string): DeckImportType =>
  ({
    id,
    name,
    version_id: `${id}-v1`,
    deck_data: {
      appearance: {
        highlightColour: "#ffdddd",
        borderColour: "#8b0000",
        cardbackUrl: "",
      },
    },
  }) as unknown as DeckImportType;

const alpha = deck("deck-alpha", "Alpha Hero");
const bravo = deck("deck-bravo", "Bravo Hero");

describe("SelectedDeckContainer — switch decks in place (issue #469)", () => {
  it("lists every saved deck and stars the picked one by id, no navigation", () => {
    const setStar = jest.fn();
    render(
      <SelectedDeckContainer
        starredDeck={alpha}
        decks={[alpha, bravo]}
        setStar={setStar}
      />,
    );

    const select = screen.getByLabelText("Choose your deck") as HTMLSelectElement;
    // value tracks the starred deck, so the dropdown and tile stay in sync
    expect(select.value).toBe("deck-alpha");
    expect([...select.options].map((o) => o.text)).toEqual([
      "Alpha Hero",
      "Bravo Hero",
    ]);

    fireEvent.change(select, { target: { value: "deck-bravo" } });
    // stars by `id` (not version_id) — that's what starredDeck resolves against
    expect(setStar).toHaveBeenCalledWith("deck-bravo");
  });

  it("renders the starred deck's name and keeps the bag reachable", () => {
    render(
      <SelectedDeckContainer
        starredDeck={bravo}
        decks={[alpha, bravo]}
        setStar={jest.fn()}
      />,
    );

    // the name label under the tile, not the matching <option> in the switcher
    const label = screen
      .getAllByText("Bravo Hero")
      .find((el) => el.tagName !== "OPTION");
    expect(label).toBeTruthy();
    expect(screen.getByText("＋ Add more decks in your bag")).toBeTruthy();
  });

  it("with no decks, keeps the empty state and shows no dropdown", () => {
    render(
      <SelectedDeckContainer
        starredDeck={undefined}
        decks={[]}
        setStar={jest.fn()}
      />,
    );

    expect(screen.getByText("Star a deck in your bag")).toBeTruthy();
    expect(screen.queryByLabelText("Choose your deck")).toBeNull();
  });

  it("with decks but nothing starred, still offers the switcher", () => {
    const setStar = jest.fn();
    render(
      <SelectedDeckContainer
        starredDeck={undefined}
        decks={[alpha, bravo]}
        setStar={setStar}
      />,
    );

    const select = screen.getByLabelText("Choose your deck") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "deck-alpha" } });
    expect(setStar).toHaveBeenCalledWith("deck-alpha");
  });

  it("keeps the invite-import loading and error states intact", () => {
    const { rerender } = render(
      <SelectedDeckContainer
        isLoading
        starredDeck={undefined}
        decks={[]}
        setStar={jest.fn()}
      />,
    );
    expect(screen.getByText("Importing your deck…")).toBeTruthy();

    rerender(
      <SelectedDeckContainer
        error
        starredDeck={undefined}
        decks={[]}
        setStar={jest.fn()}
      />,
    );
    expect(screen.getByText("Couldn't load that deck")).toBeTruthy();
  });
});
