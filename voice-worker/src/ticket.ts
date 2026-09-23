/**
 * unbrewed-voice — signed join tickets.
 *
 * A ticket is `base64url(payload-json).base64url(hmac-sha256-signature)`, built
 * with Web Crypto so it runs the same in the Worker and in Vitest (Node's Web
 * Crypto implements the same `crypto.subtle` surface). Verifying rejects a
 * tampered payload, a bad signature, and an expired ticket.
 */
import type { VoiceRole } from "./validation";

export type TicketPayload = {
  room: string;
  pid: string;
  name: string;
  role: VoiceRole;
  exp: number; // epoch seconds
};

export type VerifyFailureReason = "malformed" | "signature" | "expired";

export type VerifyTicketResult =
  | { ok: true; payload: TicketPayload }
  | { ok: false; reason: VerifyFailureReason };

const TICKET_TTL_SECONDS = 8 * 60 * 60;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signTicket(
  claims: Omit<TicketPayload, "exp">,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const payload: TicketPayload = { ...claims, exp: Math.floor(now / 1000) + TICKET_TTL_SECONDS };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyTicket(
  ticket: string,
  secret: string,
  now: number = Date.now(),
): Promise<VerifyTicketResult> {
  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, signature] = parts;

  let payload: TicketPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as TicketPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload.room !== "string" || typeof payload.pid !== "string" || typeof payload.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }

  const key = await hmacKey(secret);
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signature) as BufferSource,
    new TextEncoder().encode(body),
  );
  if (!isValid) return { ok: false, reason: "signature" };
  if (payload.exp * 1000 < now) return { ok: false, reason: "expired" };

  return { ok: true, payload };
}

/** Constant-time comparison so response timing doesn't leak the voice password. */
export function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let mismatch = 0;
  for (let i = 0; i < aBytes.length; i += 1) mismatch |= aBytes[i] ^ bBytes[i];
  return mismatch === 0;
}
