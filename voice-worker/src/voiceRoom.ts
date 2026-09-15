/**
 * unbrewed-voice — the VoiceRoom Durable Object.
 *
 * One instance per game room (`idFromName(room)`), holding the roster in memory
 * via the WebSocket Hibernation API: each connection's participant record lives
 * in `serializeAttachment`, so the DO can be evicted between messages without
 * losing state. `index.ts` verifies the join ticket and forwards the upgrade
 * here with the participant's identity already resolved as query params —
 * this class only trusts what's in the URL, so keep it unreachable except
 * through that forward.
 */
import { applyRosterAction, type Participant, type ParticipantTrack, type RosterState } from "./roster";
import type { VoiceRole } from "./validation";

type ClientMessage = { type: "publish"; track: ParticipantTrack | null } | { type: "mute"; muted: boolean };

function isClientMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  if (raw.type === "mute") return typeof raw.muted === "boolean";
  if (raw.type === "publish") {
    return raw.track === null || (typeof raw.track === "object" && raw.track !== null);
  }
  return false;
}

export class VoiceRoom implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    const pid = url.searchParams.get("pid");
    const name = url.searchParams.get("name");
    const role = url.searchParams.get("role") as VoiceRole | null;
    if (!pid || !name || (role !== "player" && role !== "spectator")) {
      return new Response("Missing participant identity", { status: 400 });
    }

    // A reconnect under the same pid replaces the previous socket instead of duplicating the seat.
    for (const existing of this.ctx.getWebSockets(pid)) {
      existing.close(4000, "replaced by a new connection");
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [pid]);
    const participant: Participant = { pid, name, role, muted: false, track: null };
    server.serializeAttachment(participant);
    this.broadcastRoster();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const participant = ws.deserializeAttachment() as Participant | null;
    if (!participant) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    if (!isClientMessage(parsed)) return;

    const updated: Participant =
      parsed.type === "publish" ? { ...participant, track: parsed.track } : { ...participant, muted: parsed.muted };
    ws.serializeAttachment(updated);
    this.broadcastRoster();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.dropConnection(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.dropConnection(ws);
  }

  private dropConnection(ws: WebSocket): void {
    const participant = ws.deserializeAttachment() as Participant | null;
    if (!participant) return;
    // The just-closed socket is still in getWebSockets() at this point, so filter it out explicitly
    // rather than relying on applyRosterAction alone.
    this.broadcastRoster(ws);
  }

  private broadcastRoster(excluding?: WebSocket): void {
    const state = this.readRoster(excluding);
    const payload = JSON.stringify({ type: "roster", participants: state.participants });
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excluding) continue;
      socket.send(payload);
    }
  }

  private readRoster(excluding?: WebSocket): RosterState {
    let state: RosterState = { participants: [] };
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excluding) continue;
      const participant = socket.deserializeAttachment() as Participant | null;
      if (!participant) continue;
      state = applyRosterAction(state, { type: "join", pid: participant.pid, name: participant.name, role: participant.role });
      if (participant.track) state = applyRosterAction(state, { type: "publish", pid: participant.pid, track: participant.track });
      if (participant.muted) state = applyRosterAction(state, { type: "mute", pid: participant.pid, muted: true });
    }
    return state;
  }
}
