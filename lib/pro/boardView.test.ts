import {
  boardViewLockedHint,
  BOARD_VIEW_LABEL,
  DEFAULT_BOARD_VIEW,
  isBoardView,
  nextBoardView,
  resolveBoardView,
  TABLETOP_NEEDS_LANDSCAPE,
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

  it("locks the Board toggle only in portrait", () => {
    expect(boardViewLockedHint("portrait")).toBe(TABLETOP_NEEDS_LANDSCAPE);
    expect(boardViewLockedHint("desktop")).toBeUndefined();
    expect(boardViewLockedHint("rail")).toBeUndefined();
  });

  // #922 (hybrid): a region map (Baba Yaga's Hut) no longer falls back to the
  // flat board — TableBoard renders its main spaces in 3D and floats the
  // region as its own 2D inset panel over that frame. `resolveBoardView`
  // never distinguished region maps from any other, so there is nothing left
  // here for it to special-case (see TableBoard.tsx's own `regionIds` for the
  // "which spaces are main vs region" split it still needs).
  describe("maps with regions", () => {
    it("resolves a region map to the tabletop view exactly like any other map", () => {
      expect(resolveBoardView("table", "desktop")).toBe("table");
      expect(resolveBoardView("table", "rail")).toBe("table");
      expect(resolveBoardView("flat", "desktop")).toBe("flat");
    });

    it("still forces the flat board for a region map in portrait", () => {
      expect(resolveBoardView("table", "portrait")).toBe("flat");
    });
  });
});
