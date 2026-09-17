import { DEFAULT_PACE, PACE_OPTIONS, isPace, nextPace, paceFactor, paceOption, scale } from "./pace";

describe("PACE_OPTIONS", () => {
  it("starts at Normal (1×), today's pace, as the first/fastest option", () => {
    expect(PACE_OPTIONS[0]).toEqual({ id: "normal", label: "Normal", factor: 1 });
  });

  it("defaults an untouched device to the MIDDLE option, not the fastest (issue: read the card without a menu trip first)", () => {
    const middle = PACE_OPTIONS[Math.floor((PACE_OPTIONS.length - 1) / 2)];
    expect(DEFAULT_PACE).toBe(middle.id);
    // Never defaults to Normal — that would recreate the "too fast to read" bug for
    // every player who never opens the menu — and never to the slowest option either.
    expect(DEFAULT_PACE).not.toBe("normal");
    expect(DEFAULT_PACE).not.toBe(PACE_OPTIONS[PACE_OPTIONS.length - 1].id);
  });

  it("offers at least two slower steps, each strictly slower than the last", () => {
    const slower = PACE_OPTIONS.filter((o) => o.id !== "normal");
    expect(slower.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < PACE_OPTIONS.length; i++) {
      expect(PACE_OPTIONS[i].factor).toBeGreaterThan(PACE_OPTIONS[i - 1].factor);
    }
  });

  it("every option carries a plain English label (no i18n in this app)", () => {
    for (const option of PACE_OPTIONS) {
      expect(option.label).toMatch(/^[A-Za-z ]+$/);
    }
  });
});

describe("paceFactor / paceOption", () => {
  it("resolves each pace's multiplier", () => {
    expect(paceFactor("normal")).toBe(1);
    expect(paceFactor("relaxed")).toBeGreaterThan(1);
    expect(paceFactor("slow")).toBeGreaterThan(paceFactor("relaxed"));
  });

  it("resolves the full option for a pace id", () => {
    expect(paceOption("slow").id).toBe("slow");
  });
});

describe("isPace", () => {
  it("accepts every real pace id", () => {
    for (const option of PACE_OPTIONS) expect(isPace(option.id)).toBe(true);
  });

  it("rejects anything else — an older build's stored value, a corrupt string", () => {
    expect(isPace("")).toBe(false);
    expect(isPace("fast")).toBe(false);
    expect(isPace("NORMAL")).toBe(false);
  });
});

describe("scale", () => {
  it("is the identity at Normal (1×)", () => {
    expect(scale(1900, "normal")).toBe(1900);
    expect(scale(0, "normal")).toBe(0);
  });

  it("stretches a duration proportionally at a slower pace", () => {
    expect(scale(1000, "relaxed")).toBe(1500);
    expect(scale(1000, "slow")).toBe(2000);
  });

  it("rounds to a whole millisecond", () => {
    expect(scale(1, "relaxed")).toBe(Math.round(1 * paceFactor("relaxed")));
    expect(Number.isInteger(scale(333, "relaxed"))).toBe(true);
  });

  it("never speeds anything up: every non-normal pace scales up every positive duration", () => {
    for (const option of PACE_OPTIONS) {
      if (option.id === "normal") continue;
      expect(scale(100, option.id)).toBeGreaterThan(100);
    }
  });
});

describe("nextPace", () => {
  it("cycles Normal → Relaxed → Slow → Normal", () => {
    expect(nextPace("normal")).toBe("relaxed");
    expect(nextPace("relaxed")).toBe("slow");
    expect(nextPace("slow")).toBe("normal");
  });
});
