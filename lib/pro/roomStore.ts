/**
 * Where a Pro socket keeps a room's reconnect token, resume blob and bot seats.
 *
 * The game page's socket keeps them in the browser (lib/pro/recentRooms.ts), so
 * a reload, a new tab or "resume tomorrow" can find the seat again. An
 * EPHEMERAL socket (issue #1678: a puzzle panel sitting on a page beside the
 * real game) keeps them in memory instead: it can still RECONNECT after a
 * dropped socket for as long as it is mounted, but it never writes
 * `unbrewed-pro-token-*`, never joins `unbrewed-pro-recent-rooms`, and never
 * reads a token the real game stored.
 */
import {
  forgetRoom,
  getResumeToken,
  getRoomBots,
  getTabToken,
  getToken,
  rememberRoom,
  retireFinishedRoom,
  setResumeToken,
  setRoomBots,
  setToken,
} from "./recentRooms";
import type { RoomBots } from "./rematch";

export interface RoomStore {
  getToken: (roomId: string) => string | null;
  getTabToken: (roomId: string) => string | null;
  setToken: (roomId: string, token: string) => void;
  getResumeToken: (roomId: string) => string | null;
  setResumeToken: (roomId: string, blob: string) => void;
  getRoomBots: (roomId: string) => RoomBots | null;
  setRoomBots: (roomId: string, bots: RoomBots) => void;
  rememberRoom: (roomId: string) => void;
  retireFinishedRoom: (roomId: string) => void;
  forgetRoom: (roomId: string) => void;
}

/** localStorage + sessionStorage: what every Pro socket used before #1678. */
export const browserRoomStore: RoomStore = {
  getToken,
  getTabToken,
  setToken,
  getResumeToken,
  setResumeToken,
  getRoomBots,
  setRoomBots,
  rememberRoom,
  retireFinishedRoom,
  forgetRoom,
};

/** One socket's private, in-memory store. Gone when the hook unmounts. */
export const createMemoryRoomStore = (): RoomStore => {
  const tokens = new Map<string, string>();
  const resume = new Map<string, string>();
  const bots = new Map<string, RoomBots>();
  return {
    getToken: (roomId) => tokens.get(roomId) ?? null,
    getTabToken: (roomId) => tokens.get(roomId) ?? null,
    setToken: (roomId, token) => void tokens.set(roomId, token),
    getResumeToken: (roomId) => resume.get(roomId) ?? null,
    setResumeToken: (roomId, blob) => void resume.set(roomId, blob),
    getRoomBots: (roomId) => bots.get(roomId) ?? null,
    setRoomBots: (roomId, value) => void bots.set(roomId, value),
    // No recent-rooms index: an ephemeral room is never offered for resume.
    rememberRoom: () => {},
    // A decided game can't be revived; the seat token stays so the result holds.
    retireFinishedRoom: (roomId) => void resume.delete(roomId),
    forgetRoom: (roomId) => {
      tokens.delete(roomId);
      resume.delete(roomId);
      bots.delete(roomId);
    },
  };
};
