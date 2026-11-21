import { useSyncExternalStore } from "react";

/**
 * "Sharp hand cards" (issue #1712): an opt-in sandbox setting, off by default,
 * saved on this device in localStorage (same shape as
 * lib/hotseat/hotseatSettings.ts). When on, the hand fan never puts the card
 * being read on a compositor layer: no cursor tilt, no `will-change` (see
 * stepFan in components/Game/game.carousel.tsx).
 *
 * A link can switch it too: `?sharpHand=1` turns it on and `?sharpHand=0`
 * turns it off, and either is saved like a click on the switch.
 */
export const SHARP_HAND_KEY = "unbrewed-sharp-hand";
export const SHARP_HAND_PARAM = "sharpHand";

const CHANGE_EVENT = "unbrewed-sharp-hand-change";

const write = (on: boolean) => {
  try {
    if (on) localStorage.setItem(SHARP_HAND_KEY, "1");
    else localStorage.removeItem(SHARP_HAND_KEY);
  } catch {
    // Storage can throw (privacy modes); the setting just isn't saved.
  }
};

/** The query string last applied, so a link is taken once per page address
 * and a later click on the switch is not undone by the same URL. */
let appliedSearch: string | null = null;

const applyUrl = () => {
  const { search } = window.location;
  if (search === appliedSearch) return;
  appliedSearch = search;
  let value: string | null = null;
  try {
    value = new URLSearchParams(search).get(SHARP_HAND_PARAM);
  } catch {
    return;
  }
  if (value === "1") write(true);
  else if (value === "0") write(false);
};

export const readSharpHand = (): boolean => {
  if (typeof window === "undefined") return false;
  applyUrl();
  try {
    return localStorage.getItem(SHARP_HAND_KEY) === "1";
  } catch {
    return false;
  }
};

export const writeSharpHand = (on: boolean) => {
  write(on);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
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

/** Tests only: forget which URL was applied, as a page load would. */
export const resetSharpHandUrlForTests = () => {
  appliedSearch = null;
};
