/**
 * Voice chat — per-device preferences in localStorage.
 * Every access is guarded: storage can be unavailable (private mode, blocked).
 */
const KEYS = {
  password: "voice:password",
  name: "voice:name",
} as const;

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the user just has to type it again next time.
  }
}

export const loadVoicePassword = () => read(KEYS.password);
export const saveVoicePassword = (value: string) => write(KEYS.password, value);
export const loadVoiceName = () => read(KEYS.name);
export const saveVoiceName = (value: string) => write(KEYS.name, value);
