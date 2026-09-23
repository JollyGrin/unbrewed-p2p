/**
 * Voice chat — the WebRTC + roster socket glue for one joined
 * session. Not unit tested itself (it's all browser/WebRTC/WebSocket side
 * effects); the decisions it makes (which tracks to pull/drop) live in
 * lib/voice/rosterTracks.ts and are tested there.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createAudioSink, getMic, PartyTracks, type TrackMetadata } from "partytracks/client";
import { of, type Subscription } from "rxjs";
import { diffRemoteTracks } from "@/lib/voice/rosterTracks";
import { parseRosterMessage, type Participant } from "@/lib/voice/voiceRoster";
import { voiceRoomSocketUrl } from "@/lib/voice/voiceSocketUrl";

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8000;

export type VoiceSession = { voiceUrl: string; roomId: string; ticket: string; myPid: string };

export type VoiceConnection = {
  participants: Participant[];
  myPid: string;
  isConnected: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  leave: () => void;
  audioRef: RefObject<HTMLAudioElement>;
  needsAudioUnlock: boolean;
  unlockAudio: () => void;
};

export function useVoiceConnection(session: VoiceSession, onLeave: () => void): VoiceConnection {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  const toggleMuteRef = useRef<() => void>(() => {});
  const leaveRef = useRef<() => void>(() => {});
  const unlockAudioRef = useRef<() => void>(() => {});

  // One effect owns the whole connection's lifetime: a new ticket (a fresh
  // join) tears down the old session and opens a new one from scratch.
  useEffect(() => {
    let isCancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | null = null;
    let pulledPids = new Set<string>();
    const pulledSubs = new Map<string, Subscription>();

    const partyTracks = new PartyTracks({
      prefix: `${session.voiceUrl}/partytracks`,
      headers: new Headers({ "X-Voice-Ticket": session.ticket }),
    });
    const mic = getMic({ broadcasting: true });
    const audioSink = audioRef.current ? createAudioSink({ audioElement: audioRef.current }) : null;

    function sendMessage(message: unknown): void {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    }

    function applyRoster(list: Participant[]): void {
      setParticipants(list);
      const diff = diffRemoteTracks(pulledPids, list, session.myPid);
      for (const pid of diff.toDrop) {
        pulledSubs.get(pid)?.unsubscribe();
        pulledSubs.delete(pid);
      }
      for (const participant of diff.toPull) {
        if (!audioSink) continue;
        pulledSubs.set(participant.pid, audioSink.attach(partyTracks.pull(of(participant.track))));
      }
      pulledPids = new Set(pulledSubs.keys());
    }

    function connectSocket(): void {
      if (isCancelled) return;
      const ws = new WebSocket(voiceRoomSocketUrl(session.voiceUrl, session.roomId, session.ticket));
      socket = ws;
      ws.onopen = () => {
        reconnectAttempt = 0;
        setIsConnected(true);
      };
      ws.onmessage = (event) => {
        const roster = parseRosterMessage(event.data as unknown);
        if (roster) applyRoster(roster);
      };
      ws.onclose = () => {
        setIsConnected(false);
        if (isCancelled) return;
        const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(connectSocket, delay);
      };
      ws.onerror = () => ws.close();
    }
    connectSocket();

    const micPushSub = partyTracks.push(mic.broadcastTrack$).subscribe((metadata: TrackMetadata) => {
      if (!metadata.sessionId || !metadata.trackName) return;
      sendMessage({ type: "publish", track: { sessionId: metadata.sessionId, trackName: metadata.trackName, location: "remote" } });
    });
    const micEnabledSub = mic.isSourceEnabled$.subscribe((enabled: boolean) => {
      if (isCancelled) return;
      setIsMuted(!enabled);
      sendMessage({ type: "mute", muted: !enabled });
    });

    const tryAudioPlay = () => {
      audioRef.current?.play().catch(() => setNeedsAudioUnlock(true));
    };
    audioRef.current?.addEventListener("canplay", tryAudioPlay);

    toggleMuteRef.current = () => mic.toggleIsSourceEnabled();
    unlockAudioRef.current = () => {
      audioRef.current
        ?.play()
        .then(() => setNeedsAudioUnlock(false))
        .catch(() => undefined);
    };
    leaveRef.current = () => {
      isCancelled = true;
      onLeaveRef.current();
    };

    return () => {
      isCancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      audioRef.current?.removeEventListener("canplay", tryAudioPlay);
      socket?.close();
      micPushSub.unsubscribe();
      micEnabledSub.unsubscribe();
      pulledSubs.forEach((sub) => sub.unsubscribe());
      audioSink?.cleanup();
      mic.disableSource();
    };
  }, [session.voiceUrl, session.roomId, session.ticket, session.myPid]);

  const toggleMute = useCallback(() => toggleMuteRef.current(), []);
  const leave = useCallback(() => leaveRef.current(), []);
  const unlockAudio = useCallback(() => unlockAudioRef.current(), []);

  return { participants, myPid: session.myPid, isConnected, isMuted, toggleMute, leave, audioRef, needsAudioUnlock, unlockAudio };
}
