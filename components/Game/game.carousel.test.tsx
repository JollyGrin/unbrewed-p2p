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
type PointerInit = MouseEventInit & { pointerType?: string; pointerId?: number };
class FakePointerEvent extends MouseEvent {
  pointerType: string;
  pointerId: number;
  constructor(type: string, init: PointerInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
    this.pointerId = init.pointerId ?? 1;
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

const pointer = (type: string, x: number, pointerId = 1) =>
  act(() => {
    window.dispatchEvent(
      new FakePointerEvent(type, { clientX: x, clientY: 0, pointerId }),
    );
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
    expect(livePlay).toHaveBeenCalledWith(2, expect.objectContaining({ screenPos: { x: 50, y: 0 } }));
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

  it("ignores a second finger: only the pressing pointer can drop the card", () => {
    const play = jest.fn();
    render(<HandFan cards={[ACE, BOLT]} functions={fns(play)} />);
    // finger 1 picks up Ace and is mid-drag
    fireEvent.pointerDown(screen.getByText("Ace"), {
      clientX: 0,
      clientY: 0,
      pointerType: "touch",
      pointerId: 1,
    });
    pointer("pointermove", 50, 1);

    // finger 2 taps elsewhere: its move and release belong to no drag
    pointer("pointermove", 400, 2);
    pointer("pointerup", 400, 2);
    expect(play).not.toHaveBeenCalled();

    pointer("pointerup", 60, 1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(0, expect.objectContaining({ screenPos: { x: 60, y: 0 } }));
  });

  it("a drop off the board plays nothing and flies the card back", () => {
    jest.useFakeTimers(); // drives requestAnimationFrame
    const play = jest.fn();
    const elementFromPoint = document.elementFromPoint;
    render(<HandFan cards={[ACE, BOLT]} functions={fns(play)} />);
    startDrag("Ace");
    expect(screen.getAllByText("Ace")).toHaveLength(2); // card + ghost

    document.elementFromPoint = () => document.body; // released over UI
    pointer("pointerup", 50);
    document.elementFromPoint = elementFromPoint;
    expect(play).not.toHaveBeenCalled();

    // the ghost springs home and then goes away
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getAllByText("Ace")).toHaveLength(1);
    jest.useRealTimers();
  });

  it("plays the original slot when nothing changed", () => {
    const play = jest.fn();
    render(<HandFan cards={[ACE, BOLT]} functions={fns(play)} />);
    startDrag("Bolt");
    pointer("pointerup", 50);
    expect(play).toHaveBeenCalledWith(1, expect.objectContaining({ screenPos: { x: 50, y: 0 } }));
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

/**
 * A card on a compositor layer (will-change, or a 3D transform) is a bitmap
 * the browser resamples: its text is soft while the layer is held (#1710).
 * So a card that has stopped moving carries neither, and the card being read
 * (focused, or still sinking from its focus) never does: it has no cursor
 * tilt and no layer hint on any frame (#1714).
 */
describe("HandFan draws the hand sharp", () => {
  const rect = Element.prototype.getBoundingClientRect;
  beforeEach(() => {
    jest.useFakeTimers(); // drives requestAnimationFrame and performance.now
    Element.prototype.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 150, height: 200, right: 150, bottom: 200 }) as DOMRect;
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = rect;
    jest.useRealTimers();
  });

  /** What could put a card on a layer: the hint, and any 3D transform on the
   * lift or on anything between it and the card face. */
  const state = (slot: HTMLElement) => {
    const lift = slot.querySelector<HTMLElement>(".lift")!;
    const transforms = [lift, ...Array.from(lift.querySelectorAll<HTMLElement>("*"))]
      .map((el) => el.style.transform)
      .join(" ");
    return {
      hint: lift.style.willChange,
      threeD: /perspective|rotateX|rotateY|rotate3d|translateZ|translate3d|matrix3d/.test(transforms),
    };
  };
  const flat = { hint: "", threeD: false };
  const slotsOf = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>("[data-fan-slot]"));
  const frames = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
  const moveOn = (slot: HTMLElement, x: number, y: number) =>
    act(() => {
      slot.dispatchEvent(
        new FakePointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }),
      );
    });
  /** The cursor sweeps sideways and up and down over the card, a frame at a
   * time; returns what the card carried on every frame. */
  const sweep = (slot: HTMLElement, steps = 60) => {
    const seen = [];
    for (let k = 0; k < steps; k++) {
      moveOn(slot, 20 + 110 * Math.abs(Math.sin(k / 6)), 20 + 150 * Math.abs(Math.cos(k / 4)));
      frames(16);
      seen.push(state(slot));
    }
    return seen;
  };

  it("a hand at rest has no layer hint and no 3D transform", () => {
    const { container } = render(<HandFan cards={[ACE, BOLT, CURE]} functions={fns(jest.fn())} />);
    frames(1000);
    expect(slotsOf(container).map(state)).toEqual(Array(3).fill(flat));
    // the card turns to its slot's angle itself; the slot is not rotated
    const lift = container.querySelector<HTMLElement>(".lift")!;
    expect(lift.style.transform).toMatch(/^rotate\(-4deg\) /);
  });

  it("the stylesheet never puts a hand card on a layer either", () => {
    render(<HandFan cards={[ACE, BOLT, CURE]} functions={fns(jest.fn())} />);
    const css = Array.from(document.querySelectorAll("style"))
      .map((el) => el.textContent ?? "")
      .join("\n");
    const lift = css.match(/\.lift\s*\{[^}]*\}/g) ?? [];
    expect(lift.length).toBeGreaterThan(0); // the rule is there to be read
    expect(lift.join("\n")).not.toMatch(/will-change/);
  });

  it("a hand that changes size is at its new angles before the next frame", () => {
    const props = { functions: fns(jest.fn()) };
    const { container, rerender } = render(<HandFan cards={[ACE, BOLT, CURE]} {...props} />);
    frames(1000);
    // no frame runs between the render and the check
    rerender(<HandFan cards={[ACE, BOLT]} {...props} />);
    const angles = Array.from(container.querySelectorAll<HTMLElement>(".lift")).map(
      (lift) => lift.style.transform.match(/^rotate\((-?[\d.]+)deg\)/)?.[1],
    );
    expect(angles).toEqual(["-2", "2"]);
  });

  it("the focused card has no tilt and no layer hint on any frame while the cursor moves", () => {
    const { container } = render(<HandFan cards={[ACE, BOLT, CURE]} functions={fns(jest.fn())} />);
    frames(1000);
    const slot = slotsOf(container)[0];

    // from the very first frame: the focus spring (lift, enlarge) is moving
    const seen = sweep(slot);
    expect(slot.dataset.focused).toBe("true");
    expect(seen).toEqual(Array(seen.length).fill(flat));
    // and it did lift and enlarge
    frames(1000);
    expect(slot.querySelector<HTMLElement>(".lift")!.style.transform).toMatch(/scale\(1\.85\)$/);
    expect(state(slot)).toEqual(flat);
  });

  it("the card face sits straight in the lift: there is no tilt wrapper", () => {
    const { container } = render(<HandFan cards={[ACE, BOLT, CURE]} functions={fns(jest.fn())} />);
    expect(container.querySelector(".tilt")).toBeNull();
    const lift = container.querySelector<HTMLElement>(".lift")!;
    expect(lift.firstElementChild).toBe(screen.getByText("Ace"));
  });

  it("the rest of the fan keeps moving as before: neighbours spread, with their hint", () => {
    const { container } = render(<HandFan cards={[ACE, BOLT, CURE]} functions={fns(jest.fn())} />);
    frames(1000);
    const slots = slotsOf(container);
    moveOn(slots[0], 100, 50);
    frames(32);
    expect(state(slots[1]).hint).toBe("transform"); // sliding aside
    expect(state(slots[0])).toEqual(flat);
    frames(1000);
    expect(slots[1].querySelector<HTMLElement>(".lift")!.style.transform).toMatch(
      /translateX\((?!0px)[\d.]+px\)/,
    );
    expect(state(slots[1])).toEqual(flat); // settled: no hint on anyone
  });

  it("a card sinking from its focus carries no hint either", () => {
    const { container } = render(<HandFan cards={[ACE, BOLT, CURE]} functions={fns(jest.fn())} />);
    frames(1000);
    const slots = slotsOf(container);
    moveOn(slots[0], 60, 50);
    frames(1000);
    expect(slots[0].dataset.focused).toBe("true");
    moveOn(slots[2], 320, 50); // the focus moves to the last card
    frames(16);
    expect(slots[0].dataset.focused).toBe("false");
    expect(slots[0].querySelector<HTMLElement>(".lift")!.style.transform).not.toMatch(/scale\(1\)$/);
    expect(state(slots[0])).toEqual(flat);
  });

  it("the frame loop stops once the hand has settled under a resting cursor", () => {
    const { container } = render(<HandFan cards={[ACE, BOLT, CURE]} functions={fns(jest.fn())} />);
    frames(1000);
    moveOn(slotsOf(container)[0], 100, 50);
    frames(3000);
    expect(jest.getTimerCount()).toBe(0);
  });
});
