import { useSyncExternalStore } from "react";

/**
 * "Sharp hand cards" (issue #1712): an opt-in sandbox setting, off by default,
 * saved on this device in localStorage (same shape as
 * lib/hotseat/hotseatSettings.ts). When on, the hand card being read gets no
 * cursor tilt and no `will-change` (see stepFan in
 * components/Game/game.carousel.tsx). Chrome still draws that card from a
 * compositor layer of its own (it is raised over the table's layers), but one
 * at the card's size on screen, not a small one scaled up and tilted.
 *
 * A link can switch it too: `?sharpHand=1` turns it on and `?sharpHand=0`
 * turns it off, and either is saved like a click on the switch. The link is
 * applied once per page load, and not when the page is reloaded or reached
 * with back/forward, so it never undoes a later click on the switch. The
 * parameter is left in the address: the sandbox pages rewrite their own query
 * (hotseat seat, map) from the router's copy, which would put it back.
 */
export const SHARP_HAND_KEY = "unbrewed-sharp-hand";
export const SHARP_HAND_PARAM = "sharpHand";

const CHANGE_EVENT = "unbrewed-sharp-hand-change";

/** The value when storage refuses the write (privacy modes): it still holds
 * until the page goes away. */
let memory: boolean | null = null;

export const readSharpHand = (): boolean => {
  if (typeof window === "undefined") return false;
  if (memory != null) return memory;
  try {
    return localStorage.getItem(SHARP_HAND_KEY) === "1";
  } catch {
    return false;
  }
};

export const writeSharpHand = (on: boolean) => {
  try {
    if (on) localStorage.setItem(SHARP_HAND_KEY, "1");
    else localStorage.removeItem(SHARP_HAND_KEY);
    memory = null;
  } catch {
    memory = on;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

/** A reload or back/forward shows an address the player already acted on. */
const revisited = (): boolean => {
  try {
    const [nav] = performance.getEntriesByType(
      "navigation",
    ) as PerformanceNavigationTiming[];
    return nav?.type === "reload" || nav?.type === "back_forward";
  } catch {
    return false;
  }
};

let urlApplied = false;

/** Take `?sharpHand=` from the address, once per page load. */
export const applySharpHandUrl = () => {
  if (urlApplied || typeof window === "undefined") return;
  urlApplied = true;
  if (revisited()) return;
  let value: string | null = null;
  try {
    value = new URLSearchParams(window.location.search).get(SHARP_HAND_PARAM);
  } catch {
    return;
  }
  if (value !== "1" && value !== "0") return;
  if (readSharpHand() !== (value === "1")) writeSharpHand(value === "1");
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  // After the listener, so this reader hears the link's change too.
  applySharpHandUrl();
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** The setting and its setter, kept current as any control changes it. */
export const useSharpHand = (): [boolean, (on: boolean) => void] => {
  const on = useSyncExternalStore(subscribe, readSharpHand, () => false);
  return [on, writeSharpHand];
};

/** Tests only: a new page load (the link may apply again, nothing in memory). */
export const resetSharpHandUrlForTests = () => {
  urlApplied = false;
  memory = null;
};
