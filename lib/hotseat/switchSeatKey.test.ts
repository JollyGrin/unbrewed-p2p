import {
  DEFAULT_SWITCH_SEAT_KEY,
  SWITCH_SEAT_KEY_STORAGE,
  formatKeyCombo,
  matchesKeyCombo,
  parseKeyCombo,
  readSwitchSeatKey,
} from "./switchSeatKey";

const key = (
  k: string,
  mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {},
  code = "",
) => ({ key: k, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

const storage = (value: string | null) => ({
  getItem: (k: string) => (k === SWITCH_SEAT_KEY_STORAGE ? value : null),
});

describe("parseKeyCombo", () => {
  it("reads a bare key, modifiers, aliases and the plus key", () => {
    expect(parseKeyCombo("S")).toEqual({ key: "s", ctrl: false, alt: false, shift: false, meta: false });
    expect(parseKeyCombo("ctrl+Shift+Enter")).toMatchObject({ key: "enter", ctrl: true, shift: true });
    expect(parseKeyCombo("Cmd+Space")).toMatchObject({ key: " ", meta: true });
    expect(parseKeyCombo("Shift++")).toMatchObject({ key: "+", shift: true });
    expect(parseKeyCombo("+")).toMatchObject({ key: "+" });
  });

  it("rejects empty text and unknown modifiers", () => {
    expect(parseKeyCombo("")).toBeUndefined();
    expect(parseKeyCombo("Hyper+S")).toBeUndefined();
    expect(parseKeyCombo("Ctrl+")).toBeUndefined();
  });
});

describe("readSwitchSeatKey", () => {
  it("defaults to S, also for a bad or empty entry and unreadable storage", () => {
    const s = parseKeyCombo(DEFAULT_SWITCH_SEAT_KEY);
    expect(readSwitchSeatKey(storage(null))).toEqual(s);
    expect(readSwitchSeatKey(storage("  "))).toEqual(s);
    expect(readSwitchSeatKey(storage("Hyper+X"))).toEqual(s);
    expect(readSwitchSeatKey(undefined)).toEqual(s);
    expect(
      readSwitchSeatKey({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toEqual(s);
  });

  it("uses the stored key, and off turns it off", () => {
    expect(readSwitchSeatKey(storage("Alt+P"))).toMatchObject({ key: "p", alt: true });
    expect(readSwitchSeatKey(storage("off"))).toBeUndefined();
    expect(readSwitchSeatKey(storage("None"))).toBeUndefined();
  });
});

describe("matchesKeyCombo", () => {
  const s = parseKeyCombo("S")!;

  it("matches the letter in either case, without extra modifiers", () => {
    expect(matchesKeyCombo(key("s"), s)).toBe(true);
    expect(matchesKeyCombo(key("S"), s)).toBe(true); // caps lock
    expect(matchesKeyCombo(key("S", { shiftKey: true }), s)).toBe(false);
    expect(matchesKeyCombo(key("s", { metaKey: true }), s)).toBe(false);
    expect(matchesKeyCombo(key("d"), s)).toBe(false);
  });

  it("matches a letter by physical key (Mac Alt+S types ß)", () => {
    const altS = parseKeyCombo("Alt+S")!;
    expect(matchesKeyCombo(key("ß", { altKey: true }, "KeyS"), altS)).toBe(true);
    expect(matchesKeyCombo(key("ß", { altKey: true }, "KeyD"), altS)).toBe(false);
  });

  it("checks Shift for named keys but not for symbols that need it", () => {
    const shiftTab = parseKeyCombo("Shift+Tab")!;
    expect(matchesKeyCombo(key("Tab", { shiftKey: true }), shiftTab)).toBe(true);
    expect(matchesKeyCombo(key("Tab"), shiftTab)).toBe(false);
    expect(matchesKeyCombo(key("?", { shiftKey: true }), parseKeyCombo("?")!)).toBe(true);
    expect(matchesKeyCombo(key("`"), parseKeyCombo("`")!)).toBe(true);
  });
});

describe("formatKeyCombo", () => {
  it("names the combo for labels", () => {
    expect(formatKeyCombo(parseKeyCombo("s")!)).toBe("S");
    expect(formatKeyCombo(parseKeyCombo("shift+tab")!)).toBe("Shift+Tab");
    expect(formatKeyCombo(parseKeyCombo("cmd+space")!)).toBe("Cmd+Space");
  });
});

describe("comboFromKeyEvent", () => {
  const { comboFromKeyEvent } = jest.requireActual("./switchSeatKey");
  it("records letters by physical key, named keys with Shift, symbols without", () => {
    expect(comboFromKeyEvent(key("s", {}, "KeyS"))).toBe("S");
    expect(comboFromKeyEvent(key("ß", { altKey: true }, "KeyS"))).toBe("Alt+S");
    expect(comboFromKeyEvent(key("Tab", { shiftKey: true }, "Tab"))).toBe("Shift+Tab");
    expect(comboFromKeyEvent(key("?", { shiftKey: true }, "Slash"))).toBe("?");
    expect(comboFromKeyEvent(key(" ", { ctrlKey: true }, "Space"))).toBe("Ctrl+Space");
    expect(comboFromKeyEvent(key("Shift", { shiftKey: true }, "ShiftLeft"))).toBeUndefined();
  });

  it("round-trips through parse and format", () => {
    for (const text of ["S", "Alt+S", "Shift+Tab", "?", "Ctrl+Space", "Cmd+Enter"]) {
      expect(formatKeyCombo(parseKeyCombo(text)!)).toBe(text);
    }
  });
});
