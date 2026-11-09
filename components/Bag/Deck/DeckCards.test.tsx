/**
 * Draw deck / Kept out sections and the inspector's "Keep out of draw deck"
 * switch (#1578): counts weighted by quantity, a toggle moves the card between
 * sections and the inspector follows it, the toggle maps back to the
 * deck_data index, Labs (non-image) decks can still toggle, no outline props
 * on cards, previews (no callbacks) are unaffected.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { useState } from "react";

import { DeckImportCardType, DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DeckCards } from "./DeckCards";

jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("../../CardFactory/Card", () => ({
  Card: ({ card }: { card: { title: string } }) => <i data-testid="face">{card.title}</i>,
}));

const mk = (title: string, extra: Partial<DeckImportCardType> = {}) =>
  ({
    title,
    type: "attack",
    value: 3,
    boost: 2,
    quantity: 1,
    basicText: "",
    immediateText: "",
    duringText: "",
    afterText: "",
    ...extra,
  }) as unknown as DeckImportCardType;

const deckOf = (cards: DeckImportCardType[], tags: string[] = []) =>
  ({
    id: "d1",
    name: "Deck",
    tags,
    deck_data: { cards, hero: { name: "H", hp: 1, move: 1, isRanged: false }, sidekick: {} },
  }) as unknown as DeckImportType;

// A (x3), B (x2, flagged), C (x1), D (x4, flagged)
const base = () => [
  mk("A", { quantity: 3 }),
  mk("B", { quantity: 2, isCharacterCard: true }),
  mk("C"),
  mk("D", { quantity: 4, isCharacterCard: true }),
];

/** DeckDetail's toggleCharacterCard, minus persistence: flips by deck_data index. */
const Harness = ({ tags, cards: initial }: { tags: string[]; cards: DeckImportCardType[] }) => {
  const [cards, setCards] = useState(initial);
  return (
    <DeckCards
      decks={[deckOf(cards, tags)]}
      selectedDeckId="d1"
      onToggleCharacterCard={(i) =>
        setCards((cs) => cs.map((c, j) => (j === i ? { ...c, isCharacterCard: !c.isCharacterCard } : c)))
      }
    />
  );
};

const renderIt = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);
const titles = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByTestId("face")
    .map((n) => n.textContent);
const open = (title: string) => fireEvent.click(screen.getByLabelText(`Inspect ${title}`));
const counter = () => screen.getByTestId("inspector-counter").textContent;
const keepOut = () => screen.getByRole("checkbox", { name: "Keep out of draw deck" });

describe("Draw deck / Kept out sections", () => {
  it("splits the grid and weights the counts by quantity", () => {
    renderIt(<Harness tags={["image-deck"]} cards={base()} />);
    expect(titles("draw-deck-grid")).toEqual(["A", "C"]);
    expect(titles("kept-out-grid")).toEqual(["B", "D"]);
    // 3 + 1 copies shuffle in; the flagged B and D (2 + 4) do not count
    expect(screen.getByRole("heading", { name: "Draw deck" })).toBeInTheDocument();
    expect(screen.getByText("4 cards, shuffled at the start of a game")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kept out" })).toBeInTheDocument();
    expect(
      screen.getByText("hero & rule cards · placed on the table, never shuffled"),
    ).toBeInTheDocument();
  });

  it("flagged cards get the desaturating filter and a HERO / RULE pill; the old strip and banner are gone", () => {
    renderIt(<Harness tags={["image-deck"]} cards={base()} />);
    expect(screen.getAllByTestId("kept-out-pill")).toHaveLength(2);
    expect(screen.getAllByTestId("kept-out-pill")[0]).toHaveTextContent("HERO / RULE");
    expect(screen.queryByText(/NOT SHUFFLED/)).toBeNull();
    expect(screen.queryByText(/Imported deck/)).toBeNull();
    const filtered = screen.getByLabelText("Inspect B").firstElementChild as HTMLElement;
    expect(getComputedStyle(filtered).filter).toBe("saturate(.55) brightness(.8)");
    const plain = screen.getByLabelText("Inspect A").firstElementChild as HTMLElement;
    expect(getComputedStyle(plain).filter).not.toContain("saturate");
  });

  // jsdom resolves emotion's rules, so Chakra's `outline="none"` (a transparent
  // 2px outline) and any gold outlineColor show up in the computed `outline`.
  it("no outline or border is painted on any card, flagged or not", () => {
    renderIt(<Harness tags={["image-deck"]} cards={base()} />);
    for (const t of ["A", "B", "C", "D"]) {
      const s = getComputedStyle(screen.getByLabelText(`Inspect ${t}`));
      expect(s.outlineWidth).toBe("");
      expect(s.outline).not.toMatch(/solid|transparent|accent|gold|#E/i);
      expect(["", "0px"]).toContain(s.borderWidth); // Chakra reset: style solid, width 0
    }
  });

  it("an image deck with nothing flagged shows the dashed empty tile", () => {
    renderIt(<Harness tags={["image-deck"]} cards={[mk("A"), mk("C")]} />);
    expect(screen.getByRole("heading", { name: "Kept out" })).toBeInTheDocument();
    expect(screen.getByTestId("kept-out-empty")).toHaveTextContent(
      "No hero or rule cards flagged yet",
    );
  });

  it("a non-image deck with nothing flagged has no Kept out section", () => {
    renderIt(<Harness tags={["unmatched-labs"]} cards={[mk("A"), mk("C")]} />);
    expect(screen.queryByRole("heading", { name: "Kept out" })).toBeNull();
    expect(screen.queryByTestId("kept-out-empty")).toBeNull();
  });

  it("toggling in the inspector moves the card and the inspector stays on it", () => {
    renderIt(<Harness tags={["image-deck"]} cards={base()} />);
    open("C"); // order: A C | B D  -> position 2 of 4
    expect(counter()).toBe("2 / 4");
    expect(keepOut()).not.toBeChecked();
    fireEvent.click(keepOut());
    // C moved to Kept out immediately
    expect(titles("draw-deck-grid")).toEqual(["A"]);
    expect(titles("kept-out-grid")).toEqual(["B", "C", "D"]); // deck order within a section
    expect(screen.getByText("3 cards, shuffled at the start of a game")).toBeInTheDocument();
    // ...and the inspector is still on C (now 3rd of 4), switch on
    expect(screen.getByRole("heading", { name: "C" })).toBeInTheDocument();
    expect(counter()).toBe("3 / 4");
    expect(keepOut()).toBeChecked();
    // un-flag it again: back to the Draw deck, still open on C
    fireEvent.click(keepOut());
    expect(titles("draw-deck-grid")).toEqual(["A", "C"]);
    expect(screen.getByRole("heading", { name: "C" })).toBeInTheDocument();
    expect(keepOut()).not.toBeChecked();
  });

  it("the toggle targets the deck_data index even when the card sits in Kept out", () => {
    const onToggle = jest.fn();
    renderIt(
      <DeckCards
        decks={[deckOf(base(), ["image-deck"])]}
        selectedDeckId="d1"
        onToggleCharacterCard={onToggle}
      />,
    );
    open("D"); // 4th in section order, 4th in deck_data
    fireEvent.click(keepOut());
    expect(onToggle).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByLabelText("Close"));
    open("C"); // 2nd in section order, but index 2 in deck_data
    fireEvent.click(keepOut());
    expect(onToggle).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByLabelText("Next card")); // C -> B, 3rd in section order
    fireEvent.click(keepOut());
    expect(onToggle).toHaveBeenLastCalledWith(1); // index 1 in deck_data
    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it("flips exactly once per click on the switch, its track, the title, the sub-line or the row", () => {
    const onToggle = jest.fn();
    renderIt(
      <DeckCards
        decks={[deckOf(base(), ["image-deck"])]}
        selectedDeckId="d1"
        onToggleCharacterCard={onToggle}
      />,
    );
    open("A");
    const actions = screen.getByTestId("inspector-actions");
    const targets = [
      keepOut(),
      keepOut().closest("label") as HTMLElement, // Chakra's own switch label (the track)
      within(actions).getByText("Keep out of draw deck"),
      within(actions).getByText("Hero / rule card. Sits on the table, never shuffled in."),
      actions.firstElementChild as HTMLElement, // the row's padding
    ];
    targets.forEach((el, i) => {
      fireEvent.click(el);
      expect(onToggle).toHaveBeenCalledTimes(i + 1);
    });
    expect(actions.querySelector("label label")).toBeNull(); // no nested labels
  });

  it("says '1 card' not '1 cards'", () => {
    renderIt(<Harness tags={[]} cards={[mk("A"), mk("B", { isCharacterCard: true, quantity: 3 })]} />);
    expect(screen.getByText("1 card, shuffled at the start of a game")).toBeInTheDocument();
  });

  it("inspector prev/next walks section order: Draw deck, then Kept out", () => {
    renderIt(<Harness tags={["image-deck"]} cards={base()} />);
    open("A");
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(screen.getByRole("heading", { level: 2 }).textContent);
      fireEvent.click(screen.getByLabelText("Next card"));
    }
    expect(seen).toEqual(["A", "C", "B", "D"]);
  });

  it("a Labs deck (no image-deck tag, pre-flagged) can still toggle", () => {
    renderIt(<Harness tags={["unmatched-labs"]} cards={base()} />);
    expect(titles("kept-out-grid")).toEqual(["B", "D"]);
    open("B");
    expect(keepOut()).toBeChecked();
    fireEvent.click(keepOut());
    expect(titles("kept-out-grid")).toEqual(["D"]);
    expect(titles("draw-deck-grid")).toEqual(["A", "B", "C"]);
    expect(screen.getByRole("heading", { name: "B" })).toBeInTheDocument();
  });

  it("previews (no callbacks) still render both sections, with no toggle and no empty tile", () => {
    renderIt(<DeckCards decks={[deckOf(base(), ["image-deck"])]} selectedDeckId="d1" />);
    expect(titles("draw-deck-grid")).toEqual(["A", "C"]);
    expect(titles("kept-out-grid")).toEqual(["B", "D"]);
    open("A");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByTestId("inspector-actions")).toBeNull();
  });

  it("a preview of an unflagged image deck has no Kept out section; a missing deck renders without crashing", () => {
    const { unmount } = renderIt(
      <DeckCards decks={[deckOf([mk("A")], ["image-deck"])]} selectedDeckId="d1" />,
    );
    expect(screen.queryByRole("heading", { name: "Kept out" })).toBeNull();
    unmount();
    renderIt(<DeckCards decks={[]} selectedDeckId="nope" />);
    expect(screen.getByText("0 cards, shuffled at the start of a game")).toBeInTheDocument();
  });
});
