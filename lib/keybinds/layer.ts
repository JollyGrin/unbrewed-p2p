import { useEffect } from "react";
import { toast } from "react-hot-toast";

import { matchesKeyCombo, readSwitchSeatKey } from "@/lib/hotseat/switchSeatKey";
import { KEYBIND_ACTION_BY_ID } from "./actions";
import { comboFromEvent } from "./combo";
import { keyEventBlocked } from "./guards";
import { DISCARD_SELECTED_CARD, runKeybindAction } from "./handlers";
import { getKeybindSnapshot } from "./store";

type LayerOptions = {
  /**
   * An opponent is seated in hotseat, so the switch-seat listener is live.
   * Any press it would take is left to it.
   */
  hotseatActive?: boolean;
};

const switchSeatTakes = (e: KeyboardEvent): boolean => {
  let combo;
  try {
    combo = readSwitchSeatKey(window.localStorage);
  } catch {
    combo = readSwitchSeatKey(undefined);
  }
  return !!combo && matchesKeyCombo(e, combo);
};

/**
 * Runs the table shortcut a key press is bound to, if any. Returns whether
 * the press was taken (and its default prevented).
 */
export const handleTableKey = (
  e: KeyboardEvent,
  { hotseatActive = false }: LayerOptions = {},
): boolean => {
  if (keyEventBlocked(e)) return false;
  const combo = comboFromEvent(e);
  if (!combo) return false;
  const id = getKeybindSnapshot().byCombo.get(combo);
  const action = id ? KEYBIND_ACTION_BY_ID[id] : undefined;
  // The switch-seat key has its own listener (lib/hotseat/switchSeatKey.ts).
  if (!action || action.kind === "external") return false;
  if (hotseatActive && switchSeatTakes(e)) return false;
  // A held key acts once. The repeats are still ours, so the browser does
  // not get them either (Firefox opens quick find on a held "/").
  const held = e.repeat && !action.repeatable;
  // Backspace counts as Delete, except that it never deletes a piece: a
  // Backspace meant for a typo in a piece's label must not cost the piece.
  // A card it may discard, since that comes back from the discard pile.
  // Shift+Backspace is deliberate, so it is a full Delete (the only one a
  // Mac laptop has).
  const target =
    action.id === "removeSelected" && e.key === "Backspace" && !e.shiftKey
      ? DISCARD_SELECTED_CARD
      : action.id;
  const result = runKeybindAction(target, held);
  if (result === "missing") return false;
  e.preventDefault();
  if (held) return true;
  if (result === "unavailable") {
    // One toast, replaced on every press, never a stack.
    toast.error(`Not available right now: ${action.label}`, {
      id: "table-keybind-unavailable",
    });
  }
  return true;
};

/** Listens for table shortcuts for as long as the table is mounted. */
export const useTableKeybinds = (options: LayerOptions = {}) => {
  const { hotseatActive = false } = options;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleTableKey(e, { hotseatActive });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotseatActive]);
};
