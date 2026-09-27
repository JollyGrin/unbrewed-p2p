import {
  BOARD_VIEW_LABEL,
  DEFAULT_BOARD_VIEW,
  isBoardView,
  nextBoardView,
  resolveBoardView,
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

  // #870: the tabletop frame has no counter-rotation, so a portrait phone
  // (whose board frame is turned 90°) must draw the flat board.
  it("draws the flat board in portrait whatever the stored preference", () => {
    expect(resolveBoardView("table", "portrait")).toBe("flat");
    expect(resolveBoardView("flat", "portrait")).toBe("flat");
  });

  it("honours the stored preference on desktop and landscape phones", () => {
    expect(resolveBoardView("table", "rail")).toBe("table");
    expect(resolveBoardView("table", "desktop")).toBe("table");
    expect(resolveBoardView("flat", "rail")).toBe("flat");
    expect(resolveBoardView("flat", "desktop")).toBe("flat");
  });

  // #911: a map with a region (Baba Yaga's Hut) can't be placed in 3D yet
  // (TableBoard.tsx), so it draws the flat board whatever the preference —
  // same fallback shape as portrait, and just as silent.
  it("draws the flat board for a map with a region whatever the stored preference", () => {
    expect(resolveBoardView("table", "desktop", true)).toBe("flat");
    expect(resolveBoardView("flat", "desktop", true)).toBe("flat");
  });

  it("returns the tabletop once the map has no region again", () => {
    expect(resolveBoardView("table", "desktop", false)).toBe("table");
  });
});
