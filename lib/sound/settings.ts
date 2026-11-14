import { useCallback, useSyncExternalStore } from "react";

/**
 * Sound preferences, saved on this device in localStorage (same shape as
 * lib/hotseat/hotseatSettings.ts): writers notify, every reader re-renders,
 * another tab's change arrives through the `storage` event.
 *
 * Defaults: sounds ON at a quiet level, other players' actions audible.
 */
const KEYS = {
  muted: "unbrewed-sound-muted",
  volume: "unbrewed-sound-volume",
  others: "unbrewed-sound-others",
} as const;

/** Flip this to ship the table silent until a player turns sounds on. */
export const DEFAULT_SOUND_MUTED = false;
/** 0..1 on the slider; see `volumeToGain` for what it does to the level. */
export const DEFAULT_SOUND_VOLUME = 0.7;
/** Whether other players' actions make (quieter) sounds by default. */
export const DEFAULT_SOUND_OTHERS = true;

export type SoundPrefs = {
  muted: boolean;
  /** 0..1 */
  volume: number;
  /** Play (quieter) sounds for other players' actions. */
  others: boolean;
};

const CHANGE_EVENT = "unbrewed-sound-settings-change";

const DEFAULTS: SoundPrefs = {
  muted: DEFAULT_SOUND_MUTED,
  volume: DEFAULT_SOUND_VOLUME,
  others: DEFAULT_SOUND_OTHERS,
};

const readFlag = (key: string, fallback: boolean): boolean => {
  const raw = localStorage.getItem(key);
  return raw === "1" ? true : raw === "0" ? false : fallback;
};

const load = (): SoundPrefs => {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    // Anything that is not a number in 0..1 (missing, "", "loud", 7) is the
    // default; note Number("") is 0, which would silence the table.
    const rawVolume = localStorage.getItem(KEYS.volume)?.trim();
    const volume = rawVolume ? Number(rawVolume) : NaN;
    return {
      muted: readFlag(KEYS.muted, DEFAULT_SOUND_MUTED),
      volume:
        Number.isFinite(volume) && volume >= 0 && volume <= 1
          ? volume
          : DEFAULT_SOUND_VOLUME,
      others: readFlag(KEYS.others, DEFAULT_SOUND_OTHERS),
    };
  } catch {
    // Storage can throw (privacy modes): play with the defaults.
    return DEFAULTS;
  }
};

// One snapshot object until something changes: useSyncExternalStore compares
// by identity, and the engine reads this on every sound.
let cached: SoundPrefs | undefined;
const listeners = new Set<() => void>();
let wired = false;

const invalidate = () => {
  cached = undefined;
  listeners.forEach((l) => l());
};

const wire = () => {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener(CHANGE_EVENT, invalidate);
  window.addEventListener("storage", invalidate);
};

export const getSoundPrefs = (): SoundPrefs => {
  if (typeof window === "undefined") return DEFAULTS;
  wire();
  if (!cached) cached = load();
  return cached;
};

export const subscribeSoundPrefs = (onChange: () => void) => {
  wire();
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

export const setSoundPrefs = (patch: Partial<SoundPrefs>) => {
  const next = { ...getSoundPrefs(), ...patch };
  try {
    localStorage.setItem(KEYS.muted, next.muted ? "1" : "0");
    localStorage.setItem(KEYS.volume, String(next.volume));
    localStorage.setItem(KEYS.others, next.others ? "1" : "0");
  } catch {
    // Not saved; it still applies until the page goes away.
    cached = next;
    listeners.forEach((l) => l());
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const toggleSoundMuted = () =>
  setSoundPrefs({ muted: !getSoundPrefs().muted });

/** The preferences and their setter, kept current as any control changes them. */
export const useSoundPrefs = (): [
  SoundPrefs,
  (patch: Partial<SoundPrefs>) => void,
] => {
  const prefs = useSyncExternalStore(
    subscribeSoundPrefs,
    getSoundPrefs,
    () => DEFAULTS,
  );
  const set = useCallback((patch: Partial<SoundPrefs>) => setSoundPrefs(patch), []);
  return [prefs, set];
};
