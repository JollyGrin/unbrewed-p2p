import { render, screen } from "@testing-library/react";
import { CardTokenPanel } from "./card-token.panel";
import { BoardToken } from "./position.type";

// Chakra's slider measures its thumb; jsdom has no ResizeObserver.
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const noop = () => {};
const card = { title: "Feint" } as BoardToken["card"];
const panel = (token: BoardToken) => (
  <CardTokenPanel
    token={token}
    onFlip={noop}
    onToHand={noop}
    onToDiscard={noop}
    onToDeckTop={noop}
    onToDeckBottom={noop}
    onResize={noop}
    onClose={noop}
  />
);
const bounds = () => {
  const s = screen.getByRole("slider");
  return [
    Number(s.getAttribute("aria-valuemin")),
    Number(s.getAttribute("aria-valuemax")),
    Number(s.getAttribute("aria-valuenow")),
  ];
};
const tok = (id: string, size: number): BoardToken => ({
  id,
  x: 0,
  y: 0,
  size,
  card,
});

describe("CardTokenPanel size slider", () => {
  it("keeps a legacy card's stretched range while it is resized", () => {
    // stored at 50 by the old 50-260 slider
    const view = render(panel(tok("a#1", 50)));
    expect(bounds()).toEqual([50, 270, 50]);
    // dragged up: the minimum must not follow it
    view.rerender(panel(tok("a#1", 150)));
    expect(bounds()).toEqual([50, 270, 150]);
    view.rerender(panel(tok("a#1", 60)));
    expect(bounds()).toEqual([50, 270, 60]);
  });

  it("does the same above the usual maximum", () => {
    const view = render(panel(tok("a#1", 400)));
    expect(bounds()).toEqual([90, 400, 400]);
    view.rerender(panel(tok("a#1", 200)));
    expect(bounds()).toEqual([90, 400, 200]);
  });

  it("works the range out again for another card", () => {
    const view = render(panel(tok("a#1", 50)));
    view.rerender(panel(tok("a#2", 180)));
    expect(bounds()).toEqual([90, 270, 180]);
  });
});
