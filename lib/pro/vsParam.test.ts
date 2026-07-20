import { parseVsParam, vsParamFor } from "./vsParam";

describe("parseVsParam", () => {
  it("defaults a bare ?vs=ai to medium", () => {
    expect(parseVsParam("ai")).toBe("medium");
  });

  it("reads each explicit difficulty", () => {
    expect(parseVsParam("ai-easy")).toBe("easy");
    expect(parseVsParam("ai-medium")).toBe("medium");
    expect(parseVsParam("ai-hard")).toBe("hard");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(parseVsParam(" AI-Hard ")).toBe("hard");
  });

  it("leaves the seat human for anything unrecognised", () => {
    // A bare `?vs` (Next hands over "") or a typo must not arm a bot.
    expect(parseVsParam("")).toBeNull();
    expect(parseVsParam(undefined)).toBeNull();
    expect(parseVsParam("human")).toBeNull();
    expect(parseVsParam("ai-nightmare")).toBeNull();
  });

  it("takes the last value when the param repeats", () => {
    expect(parseVsParam(["ai", "ai-hard"])).toBe("hard");
  });

  it("round-trips vsParamFor", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      expect(parseVsParam(vsParamFor(d))).toBe(d);
    }
  });
});
