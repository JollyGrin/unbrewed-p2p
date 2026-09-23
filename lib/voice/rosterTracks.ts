/**
 * Voice chat — pure track diffing: given the room roster and
 * which remote pids we currently have pulled, which tracks should be pulled
 * from the SFU next and which previously-pulled ones should be dropped.
 * Kept pure so the WebRTC-heavy connection hook only has to apply the result.
 */
import type { Participant, ParticipantTrack } from "./voiceRoster";

export type RemoteParticipant = Participant & { track: ParticipantTrack };

/** Other participants who currently have a published track. */
export function remoteParticipantsWithTracks(participants: Participant[], myPid: string): RemoteParticipant[] {
  return participants.filter((p): p is RemoteParticipant => p.pid !== myPid && p.track !== null);
}

export type TrackDiff = { toPull: RemoteParticipant[]; toDrop: string[] };

/**
 * `pulledPids` is the set of pids we've already pulled a track for (from the
 * previous call). A participant keeps its pulled track across roster updates
 * as long as it's still present with a track — we never re-pull just because
 * an unrelated field (e.g. another participant's `muted`) changed.
 */
export function diffRemoteTracks(pulledPids: ReadonlySet<string>, participants: Participant[], myPid: string): TrackDiff {
  const current = remoteParticipantsWithTracks(participants, myPid);
  const currentPids = new Set(current.map((p) => p.pid));
  return {
    toPull: current.filter((p) => !pulledPids.has(p.pid)),
    toDrop: [...pulledPids].filter((pid) => !currentPids.has(pid)),
  };
}
