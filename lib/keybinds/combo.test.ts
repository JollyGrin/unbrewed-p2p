import {
  comboFromEvent,
  formatCombo,
  normalizeCombo,
  reservedReason,
  splitCombo,
} from "./combo";

const ev = (
  key: string,
  code = "",
  mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {},
  altGraph = false,
) => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
  getModifierState: (k: string) => altGraph && k === "AltGraph",
});

describe("comboFromEvent", () => {
  it("names a letter by what the layout types, in either case", () => {
    expect(comboFromEvent(ev("d", "KeyD"))).toBe("D");
    expect(comboFromEvent(ev("D", "KeyD"))).toBe("D"); // caps lock
    expect(comboFromEvent(ev("D", "KeyD", { shiftKey: true }))).toBe("Shift+D");
    // AZERTY: the key printed A sits where QWERTY has Q.
    expect(comboFromEvent(ev("a", "KeyQ"))).toBe("A");
    // QWERTZ: the key printed Z sits where QWERTY has Y.
    expect(comboFromEvent(ev("z", "KeyY"))).toBe("Z");
  });

  it("falls back to the physical key when the layout types no ASCII", () => {
    expect(comboFromEvent(ev("в", "KeyD"))).toBe("D"); // Russian
    expect(comboFromEvent(ev("δ", "KeyD"))).toBe("D"); // Greek
    expect(comboFromEvent(ev("ß", "KeyS", { altKey: true }))).toBe("Alt+S"); // Mac Alt+S
    expect(comboFromEvent(ev("é", "Digit2"))).toBe("2"); // AZERTY digit row
    expect(comboFromEvent(ev("ö", "Semicolon"))).toBe("Ö"); // no letter or digit there
    expect(comboFromEvent(ev("ß", "Minus"))).toBe("ß");
  });

  it("leaves Shift out of symbols and digits, keeps it on letters and named keys", () => {
    expect(comboFromEvent(ev("?", "Slash", { shiftKey: true }))).toBe("?");
    expect(comboFromEvent(ev("?", "KeyM", { shiftKey: true }))).toBe("?"); // AZERTY
    expect(comboFromEvent(ev("1", "Digit1", { shiftKey: true }))).toBe("1"); // AZERTY
    expect(comboFromEvent(ev("Tab", "Tab", { shiftKey: true }))).toBe("Shift+Tab");
    expect(comboFromEvent(ev("ArrowUp", "ArrowUp", { altKey: true }))).toBe("Alt+ArrowUp");
  });

  it("treats = as + and Backspace as Delete", () => {
    expect(comboFromEvent(ev("=", "Equal"))).toBe("+");
    expect(comboFromEvent(ev("+", "Equal", { shiftKey: true }))).toBe("+");
    expect(comboFromEvent(ev("+", "NumpadAdd"))).toBe("+");
    expect(comboFromEvent(ev("Backspace", "Backspace"))).toBe("Delete");
    expect(comboFromEvent(ev("Delete", "Delete"))).toBe("Delete");
    expect(comboFromEvent(ev(" ", "Space"))).toBe("Space");
  });

  it("keeps browser modifiers in the combo, so Ctrl+D is never D", () => {
    expect(comboFromEvent(ev("d", "KeyD", { ctrlKey: true }))).toBe("Ctrl+D");
    expect(comboFromEvent(ev("d", "KeyD", { metaKey: true }))).toBe("Cmd+D");
    expect(comboFromEvent(ev("d", "KeyD", { altKey: true }))).toBe("Alt+D");
    expect(
      comboFromEvent(ev("K", "KeyK", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })),
    ).toBe("Ctrl+Alt+Shift+Cmd+K");
  });

  it("does not count AltGr as Ctrl+Alt", () => {
    expect(comboFromEvent(ev("@", "KeyQ", { ctrlKey: true, altKey: true }, true))).toBe("@");
  });

  it("is undefined for lone modifiers, dead keys and IME", () => {
    for (const key of ["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "Dead", "Process", ""]) {
      expect(comboFromEvent(ev(key))).toBeUndefined();
    }
  });
});

describe("normalizeCombo", () => {
  it("canonicalises stored text", () => {
    expect(normalizeCombo("d")).toBe("D");
    expect(normalizeCombo("shift+s")).toBe("Shift+S");
    expect(normalizeCombo("SHIFT + ALT + s")).toBe("Alt+Shift+S");
    expect(normalizeCombo("cmd+k")).toBe("Cmd+K");
    expect(normalizeCombo("escape")).toBe("Escape");
    expect(normalizeCombo("Esc")).toBe("Escape");
    expect(normalizeCombo("Backspace")).toBe("Delete");
    expect(normalizeCombo("Arrowup")).toBe("ArrowUp");
    expect(normalizeCombo("f5")).toBe("F5");
    expect(normalizeCombo("=")).toBe("+");
    expect(normalizeCombo("+")).toBe("+");
    expect(normalizeCombo("Alt++")).toBe("Alt++");
    expect(normalizeCombo("Shift+?")).toBe("?");
    expect(normalizeCombo(" ")).toBe("Space");
    expect(normalizeCombo("Space")).toBe("Space");
  });

  it("round-trips everything comboFromEvent produces", () => {
    for (const combo of ["D", "Shift+S", "?", "+", "-", "0", "Delete", "Escape", "Alt+ArrowUp", "Alt++", "Ö"]) {
      expect(normalizeCombo(combo)).toBe(combo);
    }
  });

  it("rejects what names no key", () => {
    for (const bad of ["", "   ", "Hyper+S", "Ctrl+", "NotAKey", "dd", 5, null, undefined, {}, "x".repeat(50)]) {
      expect(normalizeCombo(bad)).toBeUndefined();
    }
  });
});

describe("splitCombo / formatCombo", () => {
  it("splits around a + key", () => {
    expect(splitCombo("+")).toEqual({ mods: [], key: "+" });
    expect(splitCombo("Alt++")).toEqual({ mods: ["Alt"], key: "+" });
    expect(splitCombo("Alt+Shift+S")).toEqual({ mods: ["Alt", "Shift"], key: "S" });
  });

  it("shortens named keys for the badge", () => {
    expect(formatCombo("Shift+S")).toBe("Shift+S");
    expect(formatCombo("Escape")).toBe("Esc");
    expect(formatCombo("Delete")).toBe("Del");
    expect(formatCombo("Alt+ArrowUp")).toBe("Alt+↑");
    expect(formatCombo("+")).toBe("+");
  });
});

describe("reservedReason", () => {
  it("refuses browser, system and focus keys", () => {
    for (const combo of ["Ctrl+W", "Ctrl+Shift+T", "Cmd+K", "Tab", "Shift+Tab", "Enter", "Space", "Escape", "F5", "F12", "Alt+ArrowLeft", "Alt+F4"]) {
      expect(reservedReason(combo)).toEqual(expect.any(String));
    }
  });

  it("allows plain keys, Shift and Alt combos", () => {
    for (const combo of ["D", "Shift+S", "?", "Delete", "+", "0", "Alt+S", "F2", "ArrowUp", "Shift+Home"]) {
      expect(reservedReason(combo)).toBeUndefined();
    }
  });
});
