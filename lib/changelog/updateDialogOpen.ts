/**
 * Tiny shared flag: "the update dialog is on screen". The landing card reads
 * it so the card and the dialog are never both shown (unbrewed-p2p-985).
 */
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let open = false;

export const setUpdateDialogOpen = (next: boolean): void => {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useUpdateDialogOpen = (): boolean =>
  useSyncExternalStore(subscribe, () => open, () => false);
