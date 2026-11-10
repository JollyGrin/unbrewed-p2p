import { useCallback, useSyncExternalStore } from "react";

/**
 * Hotseat settings (the gear by the Switch seat chip on /offline), saved on
 * this device in localStorage. Writers call {@link notifyHotseatSettings} so
 * every reader re-renders at once; another tab's change arrives through the
 * `storage` event. The switch-seat key lives in switchSeatKey.ts on the same
 * channel.
 */
const CHANGE_EVENT = "unbrewed-hotseat-settings-change";

export const notifyHotseatSettings = () => {
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const subscribeHotseatSettings = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** On/off settings. Both default off, which is how hotseat first shipped. */
export const HOTSEAT_FLAGS = {
  /** Turn the board 180° while the second seat plays (sitting across a table). */
  rotateBoard: "unbrewed-hotseat-rotate-board",
  /** Show the new seat's hand straight away, with no pass-the-device cover. */
  autoReveal: "unbrewed-hotseat-auto-reveal",
} as const;

export type HotseatFlag = keyof typeof HOTSEAT_FLAGS;

export const readHotseatFlag = (flag: HotseatFlag): boolean => {
  try {
    return localStorage.getItem(HOTSEAT_FLAGS[flag]) === "1";
  } catch {
    return false;
  }
};

export const writeHotseatFlag = (flag: HotseatFlag, on: boolean) => {
  try {
    if (on) localStorage.setItem(HOTSEAT_FLAGS[flag], "1");
    else localStorage.removeItem(HOTSEAT_FLAGS[flag]);
  } catch {
    // Storage can throw (privacy modes); the setting just isn't saved.
  }
  notifyHotseatSettings();
};

/** A flag and its setter, kept current as any control changes it. */
export const useHotseatFlag = (
  flag: HotseatFlag,
): [boolean, (on: boolean) => void] => {
  const on = useSyncExternalStore(
    subscribeHotseatSettings,
    () => readHotseatFlag(flag),
    () => false,
  );
  const set = useCallback((v: boolean) => writeHotseatFlag(flag, v), [flag]);
  return [on, set];
};
