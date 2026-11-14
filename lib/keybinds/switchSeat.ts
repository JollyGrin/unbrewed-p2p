import { SWITCH_SEAT_ACTION } from "./actions";
import { normalizeCombo } from "./combo";
import { findConflict, getKeybindSnapshot } from "./store";

/**
 * For the hotseat settings' own key recorder: the label of the table shortcut
 * that already has this key, or undefined when the key is free. `text` is the
 * recorder's combo text (`Shift+Tab`).
 */
export const switchSeatKeyClash = (text: string): string | undefined => {
  const combo = normalizeCombo(text);
  if (!combo) return undefined;
  return findConflict(getKeybindSnapshot().overrides, SWITCH_SEAT_ACTION, combo)
    ?.label;
};
