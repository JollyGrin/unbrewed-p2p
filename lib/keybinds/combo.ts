/**
 * Key combos for the sandbox table shortcuts.
 *
 * A combo is ONE canonical string, e.g. `D`, `Shift+S`, `?`, `Delete`,
 * `Alt+ArrowUp`. A key press maps to exactly one combo ({@link comboFromEvent})
 * and a binding is a combo, so matching is string equality and two actions can
 * never both answer one press.
 *
 * Which key is it? The character the layout types (`event.key`), not the
 * physical position (`event.code`): `D` is the key with D printed on it on
 * QWERTY, AZERTY and QWERTZ alike, which is what keeps the defaults mnemonic.
 * `event.code` is only the fallback when the layout types no ASCII character
 * for the key: a Cyrillic or Greek layout, or Alt on a Mac (Alt+S types "ß").
 *
 * Shift is part of the combo for letters and named keys (`Shift+S`, `Shift+Tab`)
 * and left out for symbols and digits, which need Shift on some layouts and
 * not on others (`?` is Shift+/ on QWERTY and Shift+, on AZERTY).
 *
 * Two pairs of keys count as one, so a default works on every keyboard:
 * `=` is `+` (the same key on QWERTY, where `+` needs Shift) and `Backspace`
 * is `Delete` (a Mac laptop has no forward delete). The one exception is in
 * layer.ts: plain Backspace never deletes a piece (Shift+Backspace does).
 */

export type KeyLike = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
> & { getModifierState?: (key: string) => boolean };

const NOT_A_KEY = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "OS",
  "AltGraph",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "Symbol",
  "SymbolLock",
  "Dead",
  "Process",
  "Unidentified",
]);

/** Keys that count as another key (see the header). */
const SAME_KEY: Record<string, string> = {
  "=": "+",
  Backspace: "Delete",
  " ": "Space",
};

/** Named keys by their lower-case name, plus the spellings people type. */
const NAMED_KEYS: Record<string, string> = Object.fromEntries(
  [
    "Escape",
    "Enter",
    "Tab",
    "Space",
    "Delete",
    "Insert",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ].map((name) => [name.toLowerCase(), name]),
);
Object.assign(NAMED_KEYS, {
  esc: "Escape",
  del: "Delete",
  backspace: "Delete",
  spacebar: "Space",
  return: "Enter",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  plus: "+",
});

const isAsciiPrintable = (ch: string) => ch > " " && ch <= "~";
const isLetter = (ch: string) => ch.toLowerCase() !== ch.toUpperCase();

/** One typed character as a combo key: letters upper-case, `=` as `+`. */
const charKey = (ch: string): string => {
  const same = SAME_KEY[ch];
  if (same) return same;
  const upper = ch.toUpperCase();
  // "ß".toUpperCase() is "SS"; keep the single character.
  return upper.length === 1 ? upper : ch;
};

/** The combo key a press names; undefined for modifiers, dead keys and IME. */
const keyOf = (e: KeyLike): string | undefined => {
  const key = e.key;
  if (!key || NOT_A_KEY.has(key)) return undefined;
  if (key.length > 1) return SAME_KEY[key] ?? NAMED_KEYS[key.toLowerCase()] ?? key;
  if (key === " " || isAsciiPrintable(key)) return charKey(key);
  // No ASCII character on this key: fall back to where the key sits.
  const code = e.code ?? "";
  const physical = /^Key([A-Z])$/.exec(code)?.[1] ?? /^Digit(\d)$/.exec(code)?.[1];
  return physical ?? charKey(key);
};

const join = (
  mods: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean },
  key: string,
): string => {
  // A symbol or digit already says whether Shift was needed to type it.
  const shift = mods.shift && (key.length > 1 || isLetter(key));
  return [mods.ctrl && "Ctrl", mods.alt && "Alt", shift && "Shift", mods.meta && "Cmd", key]
    .filter(Boolean)
    .join("+");
};

/** The combo a key press is; undefined for a lone modifier or a dead key. */
export const comboFromEvent = (e: KeyLike): string | undefined => {
  const key = keyOf(e);
  if (!key) return undefined;
  // AltGr reports Ctrl+Alt on Windows; it is how the character gets typed,
  // not a modifier of the shortcut.
  const altGr = key.length === 1 && !!e.getModifierState?.("AltGraph");
  return join(
    {
      ctrl: e.ctrlKey && !altGr,
      alt: e.altKey && !altGr,
      shift: e.shiftKey,
      meta: e.metaKey,
    },
    key,
  );
};

/** A combo's modifiers and key. The key may itself be `+`. */
export const splitCombo = (combo: string): { mods: string[]; key: string } => {
  if (combo === "+") return { mods: [], key: "+" };
  if (combo.endsWith("++")) {
    return { mods: combo.slice(0, -2).split("+"), key: "+" };
  }
  const parts = combo.split("+");
  return { mods: parts.slice(0, -1), key: parts[parts.length - 1] };
};

/**
 * Canonical form of combo text from storage or a default (`shift+s` becomes
 * `Shift+S`, `Backspace` becomes `Delete`); undefined when it names no key.
 */
export const normalizeCombo = (text: unknown): string | undefined => {
  if (typeof text !== "string") return undefined;
  const raw = text === " " ? "Space" : text.trim();
  if (!raw || raw.length > 40) return undefined;
  const { mods, key: rawKey } = splitCombo(raw);
  const flags = { ctrl: false, alt: false, shift: false, meta: false };
  for (const mod of mods) {
    const m = mod.trim().toLowerCase();
    if (m === "ctrl" || m === "control") flags.ctrl = true;
    else if (m === "alt" || m === "option" || m === "opt") flags.alt = true;
    else if (m === "shift") flags.shift = true;
    else if (m === "cmd" || m === "meta" || m === "command") flags.meta = true;
    else return undefined;
  }
  const k = rawKey.trim();
  const key = Array.from(k).length === 1 ? charKey(k) : NAMED_KEYS[k.toLowerCase()];
  if (!key) return undefined;
  return join(flags, key);
};

const KEY_LABELS: Record<string, string> = {
  Escape: "Esc",
  Delete: "Del",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "PgUp",
  PageDown: "PgDn",
};

/** A combo as shown on a key badge: `Shift+S`, `Esc`, `Del`. */
export const formatCombo = (combo: string): string => {
  const { mods, key } = splitCombo(combo);
  return [...mods, KEY_LABELS[key] ?? key].join("+");
};

const BROWSER_F_KEYS = new Set(["F1", "F3", "F5", "F6", "F7", "F11", "F12"]);
const BROWSER_ALT_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "F4", "D", "Tab"]);

/**
 * Why a combo cannot be a table shortcut, or undefined when it can. The
 * recorder refuses these: they belong to the browser or the system, or they
 * are how a keyboard user moves focus and presses buttons.
 */
export const reservedReason = (combo: string): string | undefined => {
  const { mods, key } = splitCombo(combo);
  const label = formatCombo(combo);
  if (mods.includes("Cmd")) return `${label} belongs to the system.`;
  if (mods.includes("Ctrl")) return `${label} belongs to the browser.`;
  if (key === "Tab" || key === "Enter" || key === "Space") {
    return `${label} moves focus and presses buttons, so it stays free.`;
  }
  if (key === "Escape") return "Esc closes dialogs and cancels, so it stays free.";
  if (mods.includes("Alt") && BROWSER_ALT_KEYS.has(key)) {
    return `${label} belongs to the browser.`;
  }
  if (BROWSER_F_KEYS.has(key)) return `${label} belongs to the browser.`;
  return undefined;
};
