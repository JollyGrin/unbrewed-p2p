/**
 * Voice chat — client call to the voice worker's POST /join.
 * Never throws: every failure becomes a typed result the UI can explain.
 */
import type { VoiceJoinRequest } from "./voiceRequest";

export type VoiceTicket = { ticket: string; participantId: string };

export type VoiceJoinFailure = "wrong-password" | "invalid" | "not-configured" | "network" | "server";

export type VoiceJoinResult = { ok: true; ticket: VoiceTicket } | { ok: false; reason: VoiceJoinFailure; message: string };

const FAILURE_BY_STATUS: Record<number, VoiceJoinFailure> = {
  400: "invalid",
  401: "wrong-password",
  503: "not-configured",
};

const DEFAULT_MESSAGES: Record<VoiceJoinFailure, string> = {
  "wrong-password": "Wrong password",
  invalid: "Please check your name",
  "not-configured": "Voice chat isn't set up yet",
  network: "No connection — check your internet",
  server: "Voice server error — try again",
};

const failure = (reason: VoiceJoinFailure, message?: string): VoiceJoinResult => ({
  ok: false,
  reason,
  message: message || DEFAULT_MESSAGES[reason],
});

function isTicket(body: unknown): body is VoiceTicket {
  const value = body as Partial<VoiceTicket> | null;
  return typeof value?.ticket === "string" && typeof value?.participantId === "string";
}

export async function joinVoice(voiceUrl: string, request: VoiceJoinRequest): Promise<VoiceJoinResult> {
  if (!voiceUrl) return failure("not-configured");

  let response: Response;
  try {
    response = await fetch(`${voiceUrl}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return failure("network");
  }

  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return isTicket(body) ? { ok: true, ticket: body } : failure("server");
  }

  const message = typeof (body as { error?: unknown })?.error === "string" ? (body as { error: string }).error : undefined;
  return failure(FAILURE_BY_STATUS[response.status] ?? "server", message);
}
