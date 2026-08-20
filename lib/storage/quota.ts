/**
 * Guarded localStorage writes (#645). A bag write that overflows the device
 * quota used to throw out of the hook and lose the deck silently; now it tells
 * the user where the space went and returns false so callers can skip their
 * success toast.
 */
import { toast } from "react-hot-toast";

import { notifyStorageChanged } from "./breakdown";

export const QUOTA_MESSAGE =
  "Device storage full — delete replays or move your bag to your account";

/**
 * Browsers disagree on the shape: Chrome/Safari throw a DOMException named
 * QuotaExceededError (code 22), Firefox NS_ERROR_DOM_QUOTA_REACHED (code 1014).
 */
export function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code } = error as { name?: string; code?: number };
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

/**
 * Write a key, surfacing a toast (once per write) if the device is full.
 * Returns whether the value actually landed — never throws on a full disk.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    notifyStorageChanged();
    return true;
  } catch (error) {
    if (!isQuotaExceeded(error)) throw error;
    toast.error(QUOTA_MESSAGE, { id: "storage-quota" });
    return false;
  }
}

/** Remove a key and keep the storage meter honest. */
export function safeRemoveItem(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
  notifyStorageChanged();
}
