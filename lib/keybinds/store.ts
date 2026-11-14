import { useSyncExternalStore } from "react";

import {
  formatKeyCombo,
  readSwitchSeatKey,
  writeSwitchSeatKey,
} from "@/lib/hotseat/switchSeatKey";
import { subscribeHotseatSettings } from "@/lib/hotseat/hotseatSettings";
import {
  KEYBIND_ACTIONS,
  KEYBIND_ACTION_BY_ID,
  KeybindAction,
  SWITCH_SEAT_ACTION,
} from "./actions";
import { normalizeCombo, reservedReason } from "./combo";

/**
 * The player's table shortcuts, saved on this device.
 *
 * One localStorage entry holds only what differs from the defaults:
 *
 *   unbrewed-table-keybinds = {"v":1,"overrides":{"draw1":"E","shuffle":null}}
 *
 * A combo string rebinds the action, `null` leaves it with no key. Because
 * the defaults are not stored, a later release can add or change a default
 * and everyone who never touched that action gets it; a player's own choices
 * always win over a default that would clash with them
 * ({@link resolveBindings}). Anything unreadable is ignored piece by piece: a
 * bad entry costs that one entry, never the rest.
 *
 * The hotseat switch-seat key keeps its own older entry
 * (`unbrewed-hotseat-switch-key`); it is read and written through
 * lib/hotseat/switchSeatKey.ts and shows up here as the `switchSeat` action.
 */
export const KEYBINDS_STORAGE = "unbrewed-table-keybinds";
export const KEYBINDS_VERSION = 1;

/** Action id to combo, or null for "no key". Only non-default entries. */
export type KeybindOverrides = Record<string, string | null>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Reads a stored entry. Corrupt JSON, a wrong shape or a version from a
 * newer build all read as "no overrides"; an entry naming no key, or a key
 * the recorder would refuse, is dropped and that action keeps its default. Ids this build does not know are
 * kept (another tab may be on a newer build) and simply never resolve.
 */
export const parseStoredOverrides = (raw: string | null): KeybindOverrides => {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(parsed) || !isRecord(parsed.overrides)) return {};
  if (typeof parsed.v !== "number" || parsed.v < 1 || parsed.v > KEYBINDS_VERSION) {
    return {};
  }
  const out: KeybindOverrides = {};
  for (const [id, value] of Object.entries(parsed.overrides)) {
    if (!id || id.length > 60 || id === SWITCH_SEAT_ACTION) continue;
    if (value === null) out[id] = null;
    else {
      const combo = normalizeCombo(value);
      // The dialog never records a browser or focus key (Ctrl+R, Tab,
      // Space); one written by hand is dropped the same way.
      if (combo && !reservedReason(combo)) out[id] = combo;
    }
  }
  return out;
};

/** Drops entries that say what the default already says. */
export const pruneOverrides = (overrides: KeybindOverrides): KeybindOverrides => {
  const out: KeybindOverrides = {};
  for (const [id, value] of Object.entries(overrides)) {
    const action = KEYBIND_ACTION_BY_ID[id];
    const fallback = action ? (action.defaultKey ?? null) : undefined;
    if (value !== fallback) out[id] = value;
  }
  return out;
};

/** The entry to store, or null when nothing differs from the defaults. */
export const serializeOverrides = (overrides: KeybindOverrides): string | null => {
  const { [SWITCH_SEAT_ACTION]: _seat, ...rest } = pruneOverrides(overrides);
  if (Object.keys(rest).length === 0) return null;
  return JSON.stringify({ v: KEYBINDS_VERSION, overrides: rest });
};

export type ResolvedKeybinds = {
  /** Every known action's key, or null when it has none. */
  bindings: Record<string, string | null>;
  /** The reverse: which action a combo runs. */
  byCombo: Map<string, string>;
  /**
   * Actions whose default key is held by the player's own binding for
   * another action (id of that other action). They resolve to no key.
   */
  shadowed: Record<string, string>;
};

/**
 * Overrides plus defaults, with every combo on at most one action. The
 * player's own bindings are placed first, so a default added later that
 * clashes with one of them is the one left without a key.
 */
export const resolveBindings = (
  overrides: KeybindOverrides,
  actions: KeybindAction[] = KEYBIND_ACTIONS,
): ResolvedKeybinds => {
  const bindings: Record<string, string | null> = {};
  const byCombo = new Map<string, string>();
  const shadowed: Record<string, string> = {};
  for (const action of actions) {
    if (!(action.id in overrides)) continue;
    const combo = overrides[action.id];
    if (combo && !byCombo.has(combo)) {
      byCombo.set(combo, action.id);
      bindings[action.id] = combo;
    } else {
      bindings[action.id] = null;
    }
  }
  for (const action of actions) {
    if (action.id in overrides) continue;
    const combo = action.defaultKey;
    const holder = combo ? byCombo.get(combo) : undefined;
    if (combo && !holder) {
      byCombo.set(combo, action.id);
      bindings[action.id] = combo;
    } else {
      bindings[action.id] = null;
      if (holder) shadowed[action.id] = holder;
    }
  }
  return { bindings, byCombo, shadowed };
};

/** The other action already on `combo`, if any. */
export const findConflict = (
  overrides: KeybindOverrides,
  id: string,
  combo: string,
): KeybindAction | undefined => {
  const holder = resolveBindings(overrides).byCombo.get(combo);
  return holder && holder !== id ? KEYBIND_ACTION_BY_ID[holder] : undefined;
};

/** Binds `id` to `combo`. Does not check for conflicts; see {@link findConflict}. */
export const withBinding = (
  overrides: KeybindOverrides,
  id: string,
  combo: string,
): KeybindOverrides => pruneOverrides({ ...overrides, [id]: combo });

/** Leaves `id` with no key. */
export const withoutBinding = (
  overrides: KeybindOverrides,
  id: string,
): KeybindOverrides => pruneOverrides({ ...overrides, [id]: null });

/** Binds `id` to `combo`, taking it from whichever action holds it. */
export const withReplacedBinding = (
  overrides: KeybindOverrides,
  id: string,
  combo: string,
): KeybindOverrides => {
  const holder = findConflict(overrides, id, combo);
  const freed = holder ? withoutBinding(overrides, holder.id) : overrides;
  return withBinding(freed, id, combo);
};

/** Puts `id` back on its default. */
export const withDefault = (
  overrides: KeybindOverrides,
  id: string,
): KeybindOverrides => {
  const { [id]: _dropped, ...rest } = overrides;
  return rest;
};

// ---- Storage and the live snapshot ----

const CHANGE_EVENT = "unbrewed-table-keybinds-change";

const storage = (): Storage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined; // some privacy modes throw on access
  }
};

/** The switch-seat key as an override: absent while it is on its default. */
const readSwitchSeatOverride = (): KeybindOverrides => {
  const combo = readSwitchSeatKey(storage());
  const value = combo ? (normalizeCombo(formatKeyCombo(combo)) ?? null) : null;
  return pruneOverrides({ [SWITCH_SEAT_ACTION]: value });
};

export const readOverrides = (): KeybindOverrides => {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(KEYBINDS_STORAGE) ?? null;
  } catch {
    // Unreadable storage: the defaults still work.
  }
  return { ...parseStoredOverrides(raw), ...readSwitchSeatOverride() };
};

export type KeybindSnapshot = ResolvedKeybinds & { overrides: KeybindOverrides };

const snapshotOf = (overrides: KeybindOverrides): KeybindSnapshot => ({
  overrides,
  ...resolveBindings(overrides),
});

const DEFAULT_SNAPSHOT = snapshotOf({});

// Read once and kept until something changes: storage is not touched on a
// key press or a render.
let cached: KeybindSnapshot | undefined;

export const getKeybindSnapshot = (): KeybindSnapshot =>
  (cached ??= snapshotOf(readOverrides()));

/** Forget the cached read (a write, another tab, the hotseat settings). */
export const refreshKeybinds = () => {
  cached = undefined;
};

let subscribers = 0;

const subscribe = (onChange: () => void) => {
  // Nobody was listening, so a change may have been missed: read again.
  if (subscribers === 0) refreshKeybinds();
  subscribers += 1;
  // Our own write has already replaced the snapshot.
  window.addEventListener(CHANGE_EVENT, onChange);
  // The hotseat settings changed the switch-seat key, or (this also carries
  // the `storage` event) another tab changed something: read again.
  const stopHotseat = subscribeHotseatSettings(() => {
    refreshKeybinds();
    onChange();
  });
  return () => {
    subscribers -= 1;
    window.removeEventListener(CHANGE_EVENT, onChange);
    stopHotseat();
  };
};

/**
 * Saves a full set of overrides (as returned by the `with…` helpers above)
 * and tells every key badge, the palette and the listener at once.
 */
export const writeOverrides = (next: KeybindOverrides) => {
  const pruned = pruneOverrides(next);
  const before = getKeybindSnapshot().overrides;
  try {
    const entry = serializeOverrides(pruned);
    if (entry === null) storage()?.removeItem(KEYBINDS_STORAGE);
    else storage()?.setItem(KEYBINDS_STORAGE, entry);
  } catch {
    // Storage full or blocked: the change holds for this page only.
  }
  // Until the next real read, this is the truth (also when storage threw).
  cached = snapshotOf(pruned);
  const seat = pruned[SWITCH_SEAT_ACTION];
  if (seat !== before[SWITCH_SEAT_ACTION]) {
    // Notifies on the hotseat channel, which re-reads everything.
    writeSwitchSeatKey(seat === undefined ? undefined : (seat ?? "off"));
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
};

/** Every shortcut back to its default, the switch-seat key included. */
export const resetAllKeybinds = () => writeOverrides({});

/** The live bindings, re-rendering on every change. */
export const useKeybinds = (): KeybindSnapshot =>
  useSyncExternalStore(subscribe, getKeybindSnapshot, () => DEFAULT_SNAPSHOT);
