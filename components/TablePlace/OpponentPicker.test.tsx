import { fireEvent, render, screen } from "@testing-library/react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { composeTable } from "@/lib/tableplace";
import { FIXTURES, fakeFaces } from "@/lib/tableplace/fixtures/decks";
import { OpponentPicker } from "./OpponentPicker";
import { useOpponentDeck } from "./useOpponentDeck";

const { deck: oak } = FIXTURES["hollow-oak"];
const { deck: larry } = FIXTURES["larry-extra-characters"];

let seen: DeckImportType | undefined;
const Harness = ({ decks }: { decks?: DeckImportType[] }) => {
  const opponent = useOpponentDeck();
  seen = opponent.deck;
  return <OpponentPicker decks={decks} opponent={opponent} />;
};

describe("OpponentPicker — bag decks for the opponent seat (issue #1049)", () => {
  beforeEach(() => {
    seen = undefined;
  });

  it("lists the bag by name and choosing one sets the opponent", () => {
    render(<Harness decks={[oak, larry]} />);
    const select = screen.getByTestId("opponent-bag") as HTMLSelectElement;
    expect([...select.options].slice(1).map((o) => o.value)).toEqual([
      oak.id,
      larry.id,
    ]);
    fireEvent.change(select, { target: { value: larry.id } });
    expect(seen?.id).toBe(larry.id);
    fireEvent.change(select, { target: { value: "" } });
    expect(seen).toBeUndefined();
  });

  it("hides the dropdown when the bag is empty and keeps the paste field", () => {
    render(<Harness decks={[]} />);
    expect(screen.queryByTestId("opponent-bag")).toBeNull();
    expect(screen.getByTestId("opponent-link")).toBeTruthy();
  });

  it("a mirror of your own deck converts with distinct pack ids", () => {
    render(<Harness decks={[oak]} />);
    fireEvent.change(screen.getByTestId("opponent-bag"), {
      target: { value: oak.id },
    });
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
