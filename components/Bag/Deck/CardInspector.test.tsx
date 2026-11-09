/**
 * Card inspector (#1577): opens when a card in the deck grid is clicked, ← →
 * move (wrapping), Esc closes, the filmstrip jumps, Close works, and every deck
 * whose caller passes a toggle callback (image decks, Labs, pre-flagged) keeps
 * a reachable hero/rule toggle in the actions slot.
 */
import "@testing-library/jest-dom";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { DeckImportCardType, DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DeckCards } from "./DeckCards";
import { ruleBlocks } from "./CardInspector";

// Chakra's focus trap probes with a selector jsdom's nwsapi rejects (same stub
// as components/Pro/MapPreviewModal.test.tsx); the trap is not under test.
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// the face renderers measure text on a canvas; stub the card to its title
jest.mock("../../CardFactory/Card", () => ({
  Card: ({ card }: { card: { title: string } }) => <i data-testid="face">{card.title}</i>,
}));

const mk = (title: string, extra: Partial<DeckImportCardType> = {}) =>
  ({
    title,
    type: "attack",
    value: 3,
    boost: 2,
    quantity: 2,
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

const cards = [
  mk("ALPHA", { afterText: "Draw 1 card." }),
  mk("BETA", { type: "scheme", value: null, basicText: "Move 3 spaces." }),
  mk("GAMMA", { type: "defence", immediateText: "Cancel it.", duringText: "Hold." }),
];

const setup = (deck = deckOf(cards), onToggle?: jest.Mock) =>
  render(
    <ChakraProvider>
      <DeckCards decks={[deck]} selectedDeckId="d1" onToggleCharacterCard={onToggle} />
    </ChakraProvider>,
  );

const open = (title: string) => fireEvent.click(screen.getByLabelText(`Inspect ${title}`));
const counter = () => screen.getByTestId("inspector-counter").textContent;

describe("CardInspector", () => {
  it("opens on click with the card's stats and rules", () => {
    setup();
    expect(screen.queryByTestId("inspector-counter")).toBeNull();
    open("ALPHA");
    expect(counter()).toBe("1 / 3");
    expect(screen.getByRole("heading", { name: "ALPHA" })).toBeInTheDocument();
    expect(screen.getByTestId("inspector-type")).toHaveTextContent("attack");
    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getByText("AFTER COMBAT")).toBeInTheDocument();
    expect(screen.getByText("Draw 1 card.")).toBeInTheDocument();
  });

  it("shows — for a scheme's value", () => {
    setup();
    open("BETA");
    expect(counter()).toBe("2 / 3");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("arrow keys and ‹ › move, wrapping around", () => {
    setup();
    open("ALPHA");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(counter()).toBe("2 / 3");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(counter()).toBe("3 / 3"); // wrapped back past the start
    fireEvent.click(screen.getByLabelText("Next card"));
    expect(counter()).toBe("1 / 3");
    fireEvent.click(screen.getByLabelText("Previous card"));
    expect(counter()).toBe("3 / 3");
  });

  it("filmstrip jumps and marks the current card", () => {
    setup();
    open("ALPHA");
    const strip = screen.getByLabelText("Deck cards");
    fireEvent.click(within(strip).getByLabelText("Card 3: GAMMA"));
    expect(counter()).toBe("3 / 3");
    expect(within(strip).getByLabelText("Card 3: GAMMA")).toHaveAttribute("aria-current", "true");
    expect(within(strip).getByLabelText("Card 1: ALPHA")).not.toHaveAttribute("aria-current");
  });

  it("Esc closes", async () => {
    setup();
    open("ALPHA");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("inspector-counter")).toBeNull());
  });

  it("image decks keep a working hero/rule toggle in the actions slot", () => {
    const onToggle = jest.fn();
    setup(deckOf(cards, ["image-deck"]), onToggle);
    open("GAMMA");
    const actions = screen.getByTestId("inspector-actions");
    fireEvent.click(within(actions).getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it("a deck WITHOUT the image-deck tag (e.g. Labs, pre-flagged) keeps the toggle too", () => {
    const onToggle = jest.fn();
    const flagged = [mk("ALPHA", { isCharacterCard: true }), mk("BETA")];
    setup(deckOf(flagged, ["unmatched-labs"]), onToggle);
    open("ALPHA");
    const btn = within(screen.getByTestId("inspector-actions")).getByRole("button");
    expect(btn).toHaveTextContent(/kept out/i);
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it("no toggle slot when the caller passes no onToggleCharacterCard", () => {
    setup(deckOf(cards));
    open("ALPHA");
    expect(screen.queryByTestId("inspector-actions")).toBeNull();
  });

  it("the Close button closes (phones have no Esc and may have no backdrop)", async () => {
    setup();
    open("ALPHA");
    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByTestId("inspector-counter")).toBeNull());
  });

  it("arrow keys are ignored with a modifier held", () => {
    setup();
    open("ALPHA");
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    expect(counter()).toBe("1 / 3");
  });

  it("swipe flips only on a mostly-horizontal flick", () => {
    setup();
    open("ALPHA");
    const area = screen.getByTestId("inspector-swipe-area");
    const swipe = (dx: number, dy: number) => {
      // jsdom's TouchEvent init won't take plain touch points: attach them
      // (Chakra's scroll lock reads changedTouches[0] on every touch event, so
      // both lists are set on both events)
      const touch = (type: "touchStart" | "touchEnd", x: number, y: number) => {
        const ev = createEvent[type](area);
        const list = [{ clientX: x, clientY: y }];
        Object.defineProperty(ev, "touches", { value: list });
        Object.defineProperty(ev, "changedTouches", { value: list });
        fireEvent(area, ev);
      };
      touch("touchStart", 200, 200);
      touch("touchEnd", 200 + dx, 200 + dy);
    };
    swipe(-80, 90); // diagonal / vertical scroll: ignored
    expect(counter()).toBe("1 / 3");
    swipe(-80, 10);
    expect(counter()).toBe("2 / 3");
    swipe(80, 10);
    expect(counter()).toBe("1 / 3");
  });
});

describe("ruleBlocks", () => {
  it("orders basic, immediately, during, after like the card face", () => {
    const c = mk("X", { basicText: "b", immediateText: "i", duringText: "d", afterText: "a" });
    expect(ruleBlocks(c).map((b) => b.heading)).toEqual([
      undefined,
      "IMMEDIATELY",
      "DURING COMBAT",
      "AFTER COMBAT",
    ]);
  });
  it("schemes show basic text only, like the face", () => {
    const c = mk("X", { type: "scheme", basicText: "b", afterText: "a" });
    expect(ruleBlocks(c)).toEqual([{ heading: undefined, text: "b" }]);
  });
});
