/**
 * Voice chat — the deployed voice worker's base URL.
 * Must be referenced as the literal `process.env.NEXT_PUBLIC_VOICE_URL` (not a
 * dynamic key) so Next.js can inline it into the client bundle at build time.
 */
export function readVoiceUrl(): string {
  return process.env.NEXT_PUBLIC_VOICE_URL ?? "";
}
