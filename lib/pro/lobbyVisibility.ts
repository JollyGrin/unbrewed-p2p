/**
 * "Show me in the lobby" (Dean, 2026-11-08): a per-browser opt-out of the Quick
 * Play presence socket. Default ON. OFF means this page never opens `/lobby`:
 * nobody sees you on the ribbon or can 👋 you, and you don't see who else is
 * here either (it's symmetric, not a lurk mode). Open lobbies, Join and Quick
 * Match keep working off the game socket's LIST_LOBBIES poll.
 *
 * `null` until the stored choice is read (after mount, so SSR and hydration agree);
 * the page keeps the socket closed until then, so an opted-out player never
 * flashes onto anyone's ribbon.
 */
import { useCallback, useEffect, useState } from "react";

export const LOBBY_VISIBLE_KEY = "pro:lobby-visible";

export const readLobbyVisible = (): boolean => {
  try {
    return window.localStorage.getItem(LOBBY_VISIBLE_KEY) !== "0";
  } catch {
    return true; // storage blocked: the default
  }
};

export function useLobbyVisible(): [boolean | null, (visible: boolean) => void] {
  const [visible, setVisibleState] = useState<boolean | null>(null);
  useEffect(() => {
    setVisibleState(readLobbyVisible());
  }, []);
  const setVisible = useCallback((next: boolean) => {
    setVisibleState(next);
    try {
      if (next) window.localStorage.removeItem(LOBBY_VISIBLE_KEY);
      else window.localStorage.setItem(LOBBY_VISIBLE_KEY, "0");
    } catch {
      // storage blocked: the choice lasts for this page only
    }
  }, []);
  return [visible, setVisible];
}
