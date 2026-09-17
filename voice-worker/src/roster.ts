/**
 * unbrewed-voice — the VoiceRoom Durable Object's roster, as a pure reducer.
 * Kept free of Durable Object / WebSocket types so it's trivially unit tested;
 * `voiceRoom.ts` is the only place that drives it against real connections.
 */
import type { VoiceRole } from "./validation";

export type ParticipantTrack = { sessionId: string; trackName: string; location: "remote" };

export type Participant = {
  pid: string;
  name: string;
  role: VoiceRole;
  muted: boolean;
  track: ParticipantTrack | null;
};

export type RosterState = { participants: Participant[] };

export type RosterAction =
  | { type: "join"; pid: string; name: string; role: VoiceRole }
  | { type: "leave"; pid: string }
  | { type: "publish"; pid: string; track: ParticipantTrack | null }
  | { type: "mute"; pid: string; muted: boolean };

export const EMPTY_ROSTER: RosterState = { participants: [] };

/** Immutable transition: every branch returns a new state, the input is never mutated. */
export function applyRosterAction(state: RosterState, action: RosterAction): RosterState {
  switch (action.type) {
    case "join": {
      // A second connection for the same pid replaces the seat instead of duplicating it.
      const withoutExisting = state.participants.filter((p) => p.pid !== action.pid);
      const joined: Participant = { pid: action.pid, name: action.name, role: action.role, muted: false, track: null };
      return { participants: [...withoutExisting, joined] };
    }
    case "leave":
      return { participants: state.participants.filter((p) => p.pid !== action.pid) };
    case "publish":
      return {
        participants: state.participants.map((p) => (p.pid === action.pid ? { ...p, track: action.track } : p)),
      };
    case "mute":
      return {
        participants: state.participants.map((p) => (p.pid === action.pid ? { ...p, muted: action.muted } : p)),
      };
    default:
      return state;
  }
}
