/**
 * When a key press is NOT a table shortcut, whatever it is bound to.
 *
 * The rule of thumb: a shortcut only fires when the key had nowhere else to
 * go. Someone typing, an open dialog or menu, the pass-the-device cover, an
 * IME composing a character and a handler that already took the press all
 * come first.
 */

/** Inputs that take no typed text; a checkbox or switch does not block. */
const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "color",
  "file",
  "image",
]);

/** Widgets that own every key while focus is inside them. */
const KEY_OWNERS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
].join(",");

/** An open modal anywhere on the page: the palette, a deck browser, a confirm. */
const OPEN_MODAL = '[role="dialog"][aria-modal="true"],[role="alertdialog"]';

/**
 * Anything on the page that switches the table's shortcuts off while it is
 * shown: the hotseat pass-the-device cover, which hides the hand until the
 * incoming player taps it.
 */
const KEYS_OFF = "[data-table-keys-off]";

/** Keys a slider (the size sliders on the token panels) moves with. */
const SLIDER_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

const asElement = (target: EventTarget | null): HTMLElement | null =>
  target && typeof (target as HTMLElement).tagName === "string"
    ? (target as HTMLElement)
    : null;

/** The press is going into a text field, select or contenteditable. */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = asElement(target);
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.closest?.('[contenteditable]:not([contenteditable="false"])')) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    // A range input keeps its arrow keys (see the slider rule), not letters.
    return type !== "range" && !NON_TEXT_INPUTS.has(type);
  }
  return false;
};

/** An IME is composing: the press is part of typing a character. */
export const isComposing = (
  e: Pick<KeyboardEvent, "isComposing" | "key" | "keyCode">,
): boolean => e.isComposing || e.keyCode === 229 || e.key === "Process";

/**
 * True when the press must be left alone. Modifier combos need no rule here:
 * Ctrl+D is the combo `Ctrl+D`, which no table shortcut can be bound to
 * (lib/keybinds/combo.ts), so the browser keeps it.
 */
export const keyEventBlocked = (e: KeyboardEvent): boolean => {
  if (e.defaultPrevented) return true;
  if (isComposing(e)) return true;
  if (isTypingTarget(e.target)) return true;
  const el = asElement(e.target);
  if (el?.closest?.(KEY_OWNERS)) return true;
  const slider =
    el?.getAttribute("role") === "slider" ||
    (el?.tagName === "INPUT" && (el as HTMLInputElement).type === "range");
  if (slider && SLIDER_KEYS.has(e.key)) return true;
  return !!document.querySelector(`${OPEN_MODAL},${KEYS_OFF}`);
};
