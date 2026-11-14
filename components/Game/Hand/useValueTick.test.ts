import { tickKeyframes } from "./useValueTick";

describe("tickKeyframes", () => {
  it("does not tick when nothing changed or a side is missing (mount)", () => {
    expect(tickKeyframes(14, 14)).toBeNull();
    expect(tickKeyframes(undefined, 14)).toBeNull();
    expect(tickKeyframes(14, undefined)).toBeNull();
  });

  it("rolls up from below on a gain and down from above on a loss", () => {
    const up = tickKeyframes(13, 14)!;
    const down = tickKeyframes(14, 13)!;
    expect(up[0].transform).toContain("translateY(40%)");
    expect(down[0].transform).toContain("translateY(-40%)");
    // both end exactly at rest
    expect(up[up.length - 1].transform).toBe("translateY(0) scale(1)");
    expect(down[down.length - 1].transform).toBe("translateY(0) scale(1)");
  });

  it("tints health green on a gain, red on a loss, and leaves counts alone", () => {
    const gain = tickKeyframes(13, 14, { tone: true })!;
    const loss = tickKeyframes(14, 13, { tone: true })!;
    expect(gain[0].color).not.toBe(loss[0].color);
    expect(gain[gain.length - 1].color).toBeUndefined();
    expect(tickKeyframes(13, 14)![0].color).toBeUndefined();
  });

  it("pulses a pile button the same way for either direction", () => {
    const a = tickKeyframes(24, 23, { kind: "pulse" });
    expect(a).toEqual(tickKeyframes(23, 24, { kind: "pulse" }));
    expect(a![a!.length - 1].transform).toBe("scale(1)");
  });
});
