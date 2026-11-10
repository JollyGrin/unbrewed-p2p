import { useEffect } from "react";

/**
 * Switch-seat keybind (hotseat). One key hands the device over, the same as
 * the "Switch seat" chip. The default is `S`. There is no settings screen yet:
 * a player overrides it with one localStorage entry, e.g. in the console
 *
 *   localStorage.setItem("unbrewed-hotseat-switch-key", "Shift+Tab")
 *
 * The value is a key name (`e.key`, case-insensitive; `Space` for the space
 * bar) with optional `Ctrl+`, `Alt+`, `Shift+` and `Meta+`/`Cmd+` prefixes.
 * `off` turns the keybind off. An empty or unreadable value falls back to the
 * default. The entry is read on every key press, so a change applies at once.
 */
export const SWITCH_SEAT_KEY_STORAGE = "unbrewed-hotseat-switch-key";
export const DEFAULT_SWITCH_SEAT_KEY = "S";

export type KeyCombo = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

const KEY_ALIASES: Record<string, string> = {
  space: " ",
  spacebar: " ",
  esc: "escape",
  plus: "+",
};

/** Parses `"Ctrl+Shift+K"`-style text; undefined when it names no key. */
export const parseKeyCombo = (text: string): KeyCombo | undefined => {
  const raw = text.trim();
  if (!raw) return undefined;
  // "+" alone or a trailing "++" ("Shift++") is the plus key itself.
  const parts =
    raw === "+"
      ? ["+"]
      : raw.endsWith("++")
        ? [...raw.slice(0, -2).split("+"), "+"]
        : raw.split("+");
  const combo: KeyCombo = {
    key: "",
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };
  for (const [i, part] of parts.entries()) {
    const p = part.trim().toLowerCase();
    if (i === parts.length - 1) {
      combo.key = KEY_ALIASES[p] ?? p;
    } else if (p === "ctrl" || p === "control") combo.ctrl = true;
    else if (p === "alt" || p === "option" || p === "opt") combo.alt = true;
    else if (p === "shift") combo.shift = true;
    else if (p === "meta" || p === "cmd" || p === "command") combo.meta = true;
    else return undefined;
  }
  return combo.key ? combo : undefined;
};

/** The player's keybind: undefined when it is turned off. */
export const readSwitchSeatKey = (
  storage: Pick<Storage, "getItem"> | undefined,
): KeyCombo | undefined => {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(SWITCH_SEAT_KEY_STORAGE) ?? null;
  } catch {
    // Storage can throw (privacy modes); the default still works.
  }
  const value = stored?.trim();
  if (value && ["off", "none", "disabled"].includes(value.toLowerCase())) {
    return undefined;
  }
  return (
    (value ? parseKeyCombo(value) : undefined) ??
    parseKeyCombo(DEFAULT_SWITCH_SEAT_KEY)
  );
};

/** Whether a key press is the combo. */
export const matchesKeyCombo = (
  e: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
  >,
  combo: KeyCombo,
): boolean => {
  // Letters also match by physical key: on a Mac, Alt+S types "ß".
  const letter = /^[a-z]$/.test(combo.key);
  const byCode = letter && e.code === `Key${combo.key.toUpperCase()}`;
  if (e.key.toLowerCase() !== combo.key && !byCode) return false;
  if (e.ctrlKey !== combo.ctrl || e.altKey !== combo.alt) return false;
  if (e.metaKey !== combo.meta) return false;
  // A symbol like "?" already needs Shift to type, so Shift is only checked
  // for letters and named keys (Tab, Enter, ArrowUp…).
  const symbol = combo.key.length === 1 && combo.key.toUpperCase() === combo.key;
  return symbol || e.shiftKey === combo.shift;
};

/** The combo as shown in tooltips and the command menu, e.g. `Shift+Tab`. */
export const formatKeyCombo = (combo: KeyCombo): string => {
  const key =
    combo.key === " "
      ? "Space"
      : combo.key.length === 1
        ? combo.key.toUpperCase()
        : combo.key.charAt(0).toUpperCase() + combo.key.slice(1);
  return [
    combo.ctrl && "Ctrl",
    combo.alt && "Alt",
    combo.shift && "Shift",
    combo.meta && "Cmd",
    key,
  ]
    .filter(Boolean)
    .join("+");
};

const browserStorage = () =>
  typeof window === "undefined" ? undefined : window.localStorage;

/** The keybind's label for UI, or undefined when it is off. */
export const switchSeatKeyLabel = (): string | undefined => {
  const combo = readSwitchSeatKey(browserStorage());
  return combo && formatKeyCombo(combo);
};

/** Typing in a field, or a dialog (command menu, deck picker) is open. */
const keyIsBusy = (e: KeyboardEvent): boolean => {
  const el = e.target as HTMLElement | null;
  if (
    el?.isContentEditable ||
    (el?.tagName && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  ) {
    return true;
  }
  return !!document.querySelector('[role="dialog"][aria-modal="true"]');
};

/**
 * Runs `onSwitch` when the switch-seat key is pressed. `enabled` is false
 * outside an active hotseat, so this listens on nothing in the sandbox.
 */
export const useSwitchSeatHotkey = (enabled: boolean, onSwitch: () => void) => {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || keyIsBusy(e)) return;
      const combo = readSwitchSeatKey(browserStorage());
      if (!combo || !matchesKeyCombo(e, combo)) return;
      e.preventDefault();
      onSwitch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onSwitch]);
};
