/**
 * unbrewed-voice — CORS for the allowed origins listed in ALLOWED_ORIGINS.
 * An origin that isn't on the list gets no CORS headers at all, so the browser
 * blocks it client-side; we don't try to enumerate a "not allowed" error.
 */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Voice-Ticket",
    Vary: "Origin",
  };
}

export function withCors(response: Response, origin: string | null, allowedOrigins: string[]): Response {
  const extra = corsHeaders(origin, allowedOrigins);
  if (Object.keys(extra).length === 0) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
