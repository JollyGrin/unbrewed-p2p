import { bandLabelText, bandMidpoint } from "./twoSpaceBand";

describe("bandMidpoint", () => {
  it("averages head and tail into the point exactly between them", () => {
    const mid = bandMidpoint({ x: 0.2, y: 0.5 }, { x: 0.4, y: 0.5 });
    expect(mid.x).toBeCloseTo(0.3);
    expect(mid.y).toBeCloseTo(0.5);
  });

  it("handles a vertical pairing the same as a horizontal one", () => {
    expect(bandMidpoint({ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.3 })).toEqual({ x: 0.5, y: 0.2 });
  });

  it("is order-independent (head/tail is a labeling, not a direction)", () => {
    const a = bandMidpoint({ x: 0.1, y: 0.9 }, { x: 0.7, y: 0.2 });
    const b = bandMidpoint({ x: 0.7, y: 0.2 }, { x: 0.1, y: 0.9 });
    expect(a).toEqual(b);
  });
});

describe("bandLabelText", () => {
  it("strips a leading 'The ' the same way tokenInitials does", () => {
    expect(bandLabelText("The Mandalorian")).toBe("Mandalorian");
  });

  it("is case-insensitive on the leading 'the'", () => {
    expect(bandLabelText("THE Mummy")).toBe("Mummy");
  });

  it("leaves a name with no leading 'The' untouched", () => {
    expect(bandLabelText("King Kong")).toBe("King Kong");
  });

  it("does not strip 'the' when it isn't the leading word", () => {
    expect(bandLabelText("Attack of the Clones")).toBe("Attack of the Clones");
  });

  it("falls back to the original name if stripping empties it", () => {
    expect(bandLabelText("The")).toBe("The");
  });
});
