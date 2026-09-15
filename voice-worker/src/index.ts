/**
 * unbrewed-voice — Worker entry point.
 * Routes: POST /join, GET /rooms/:room/ws, ALL /partytracks/*, all CORS-gated
 * to ALLOWED_ORIGINS. See README.md for the full setup checklist.
 */
import { routePartyTracksRequest } from "partytracks/server";
import { corsHeaders, parseAllowedOrigins, withCors } from "./cors";
import { handleJoin } from "./join";
import { verifyTicket } from "./ticket";
import { VoiceRoom } from "./voiceRoom";

export { VoiceRoom };

export interface Env {
  SFU_APP_ID?: string;
  SFU_APP_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  VOICE_PASSWORD?: string;
  TICKET_SECRET?: string;
  TURN_APP_ID?: string;
  TURN_APP_TOKEN?: string;
  VOICE_ROOM: DurableObjectNamespace;
  JOIN_LIMITER?: { limit: (options: { key: string }) => Promise<{ success: boolean }> };
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

const ROOM_WS_PATTERN = /^\/rooms\/([A-Za-z0-9_-]{1,32})\/ws$/;

async function handleRoomWebSocket(request: Request, env: Env, room: string): Promise<Response> {
  if (!env.TICKET_SECRET) return jsonResponse(503, { error: "Voice chat is not configured on this server" });

  const ticket = new URL(request.url).searchParams.get("ticket");
  if (!ticket) return jsonResponse(401, { error: "Missing ticket" });

  const verified = await verifyTicket(ticket, env.TICKET_SECRET);
  if (!verified.ok || verified.payload.room !== room) {
    return jsonResponse(401, { error: "Invalid or expired ticket" });
  }

  const stub = env.VOICE_ROOM.get(env.VOICE_ROOM.idFromName(room));
  const forwardUrl = new URL(request.url);
  forwardUrl.searchParams.set("pid", verified.payload.pid);
  forwardUrl.searchParams.set("name", verified.payload.name);
  forwardUrl.searchParams.set("role", verified.payload.role);
  return stub.fetch(new Request(forwardUrl.toString(), request));
}

async function handlePartyTracks(request: Request, env: Env): Promise<Response> {
  if (!env.TICKET_SECRET || !env.SFU_APP_ID || !env.SFU_APP_TOKEN) {
    return jsonResponse(503, { error: "Voice chat is not configured on this server" });
  }

  const ticket = request.headers.get("X-Voice-Ticket");
  if (!ticket) return jsonResponse(401, { error: "Missing ticket" });

  const verified = await verifyTicket(ticket, env.TICKET_SECRET);
  if (!verified.ok) return jsonResponse(401, { error: "Invalid or expired ticket" });

  return routePartyTracksRequest({
    appId: env.SFU_APP_ID,
    token: env.SFU_APP_TOKEN,
    request,
    prefix: "/partytracks",
    lockSessionToInitiator: false,
    turnServerAppId: env.TURN_APP_ID,
    turnServerAppToken: env.TURN_APP_TOKEN,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowedOrigins) });
    }

    if (url.pathname === "/join" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (env.JOIN_LIMITER && !(await env.JOIN_LIMITER.limit({ key: ip })).success) {
        return withCors(jsonResponse(429, { error: "Too many attempts, wait a minute" }), origin, allowedOrigins);
      }
      const response = await handleJoin(request, { env, createParticipantId: () => crypto.randomUUID() });
      return withCors(response, origin, allowedOrigins);
    }

    const roomMatch = url.pathname.match(ROOM_WS_PATTERN);
    if (roomMatch && request.method === "GET") {
      // Not CORS-gated: this is a WebSocket upgrade, browsers don't apply CORS to it.
      return handleRoomWebSocket(request, env, roomMatch[1]);
    }

    if (url.pathname.startsWith("/partytracks/")) {
      const response = await handlePartyTracks(request, env);
      return withCors(response, origin, allowedOrigins);
    }

    return withCors(jsonResponse(404, { error: "Not found" }), origin, allowedOrigins);
  },
};
