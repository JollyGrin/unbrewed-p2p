import { boardZoomable } from "./FormatOverlay";

describe("boardZoomable (#1347)", () => {
  it("keeps the flag's value for ordinary rooms", () => {
    expect(boardZoomable(false, null)).toBe(false);
    expect(boardZoomable(false, "classic")).toBe(false);
    expect(boardZoomable(true, "classic")).toBe(true);
  });

  it("forces the full-screen board on in an Adventure room despite a stored off", () => {
    expect(boardZoomable(false, "adventure")).toBe(true);
    expect(boardZoomable(true, "adventure")).toBe(true);
  });
});
