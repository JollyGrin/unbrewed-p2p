import {
  BOARD_VIEW_LABEL,
  DEFAULT_BOARD_VIEW,
  isBoardView,
  nextBoardView,
} from "./boardView";

describe("boardView", () => {
  it("leaves an untouched device on the original straight-on board", () => {
    expect(DEFAULT_BOARD_VIEW).toBe("flat");
  });

  it("rejects anything that does not name a real view", () => {
    expect(isBoardView("table")).toBe(true);
    expect(isBoardView("isometric")).toBe(false);
    expect(isBoardView("")).toBe(false);
  });

  it("toggles between the two views and back", () => {
    expect(nextBoardView("flat")).toBe("table");
    expect(nextBoardView("table")).toBe("flat");
  });

  it("labels both views for the chip that switches them", () => {
    expect(BOARD_VIEW_LABEL.flat).toBeTruthy();
    expect(BOARD_VIEW_LABEL.table).toBeTruthy();
  });
});
