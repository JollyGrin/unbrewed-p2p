/**
 * Drag-to-table plays the card that was picked up (issue #496). The drop
 * fires long after the render the drag started in, so it must resolve the
 * card by identity against the CURRENT hand and call the CURRENT playFn.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { HandFan, resolveHandIndex } from "./game.carousel";
import { DeckImportCardType } from "../DeckPool/deck-import.type";

const board = document.createElement("div");

jest.mock("../CardFactory/Card", () => ({
  Card: ({ card }: { card: { title: string } }) => <div>{card.title}</div>,
}));
jest.mock("./card-actions.popover", () => ({ PopoverCardActions: () => null }));
jest.mock("../BoardCanvas/boardTransform", () => ({
  getBoardSvg: () => board,
}));

// jsdom has no PointerEvent; a MouseEvent carries the coordinates we need.
class FakePointerEvent extends MouseEvent {
  pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
  }
}
beforeAll(() => {
  (window as any).PointerEvent = FakePointerEvent;
  document.body.appendChild(board);
  document.elementFromPoint = () => board;
});

const card = (title: string) =>
  ({ title, quantity: 1 }) as unknown as DeckImportCardType;
const [ACE, BOLT, CURE] = ["Ace", "Bolt", "Cure"].map(card);

const fns = (playFn: jest.Mock) => ({
  discardFn: jest.fn(),
  commitFn: jest.fn(),
  boostFn: jest.fn(),
  deckCardFn: jest.fn(),
  deckCardBottomFn: jest.fn(),
  playFn,
});

const pointer = (type: string, x: number) =>
  act(() => {
    window.dispatchEvent(new FakePointerEvent(type, { clientX: x, clientY: 0 }));
  });

/** Press on `title`, drag past the threshold, then let `midDrag` run. */
const startDrag = (title: string) => {
  fireEvent.pointerDown(screen.getByText(title), { clientX: 0, clientY: 0 });
  pointer("pointermove", 50);
};

describe("HandFan drag-to-table", () => {
  it("plays the picked-up card even when the hand re-orders mid-drag", () => {
    const stalePlay = jest.fn();
    const livePlay = jest.fn();
    const { rerender } = render(
      <HandFan cards={[ACE, BOLT]} functions={fns(stalePlay)} />,
    );
    startDrag("Ace");

    // A snapshot / action lands mid-drag: new hand order, new handlers.
    rerender(<HandFan cards={[BOLT, CURE, ACE]} functions={fns(livePlay)} />);
    pointer("pointerup", 50);

    expect(stalePlay).not.toHaveBeenCalled();
    expect(livePlay).toHaveBeenCalledWith(2, { screenPos: { x: 50, y: 0 } });
  });

  it("plays nothing when the card left the hand mid-drag", () => {
    const play = jest.fn();
    const { rerender } = render(
      <HandFan cards={[ACE, BOLT]} functions={fns(play)} />,
    );
    startDrag("Ace");
    rerender(<HandFan cards={[BOLT]} functions={fns(play)} />);
    pointer("pointerup", 50);
    expect(play).not.toHaveBeenCalled();
  });

  it("plays the original slot when nothing changed", () => {
    const play = jest.fn();
    render(<HandFan cards={[ACE, BOLT]} functions={fns(play)} />);
    startDrag("Bolt");
    pointer("pointerup", 50);
    expect(play).toHaveBeenCalledWith(1, { screenPos: { x: 50, y: 0 } });
  });
});

describe("resolveHandIndex", () => {
  it("prefers the original slot, then the card's new slot, else -1", () => {
    expect(resolveHandIndex([ACE, BOLT], BOLT, 1)).toBe(1);
    expect(resolveHandIndex([BOLT, ACE], ACE, 0)).toBe(1);
    expect(resolveHandIndex([BOLT], ACE, 0)).toBe(-1);
    expect(resolveHandIndex(undefined, ACE, 0)).toBe(-1);
  });
});
