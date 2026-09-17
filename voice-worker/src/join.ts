/**
 * unbrewed-voice — POST /join: password check → signed ticket.
 * `createId`/`now` are injected so the handler is deterministic under test.
 */
import { constantTimeEqual, signTicket } from "./ticket";
import { parseJoinRequest } from "./validation";

export type JoinEnv = {
  VOICE_PASSWORD?: string;
  TICKET_SECRET?: string;
};

export type JoinDeps = {
  env: JoinEnv;
  createParticipantId: () => string;
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

export async function handleJoin(request: Request, { env, createParticipantId }: JoinDeps): Promise<Response> {
  if (!env.VOICE_PASSWORD || !env.TICKET_SECRET) {
    return jsonResponse(503, { error: "Voice chat is not configured on this server" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid request body" });
  }

  const parsed = parseJoinRequest(body);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });

  const { room, name, password, role } = parsed.value;
  if (!constantTimeEqual(password, env.VOICE_PASSWORD)) {
    return jsonResponse(401, { error: "Wrong password" });
  }

  const participantId = createParticipantId();
  const ticket = await signTicket({ room, pid: participantId, name, role }, env.TICKET_SECRET);
  return jsonResponse(200, { ticket, participantId });
}
