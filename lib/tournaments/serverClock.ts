/**
 * The api's clock, learned from each response's `Date` header (p2p #1269), so
 * deadline and seat-hold countdowns agree with the server, not a skewed phone.
 * No header (cross-origin without `Access-Control-Expose-Headers: Date`), an
 * unparsable one, an absurd offset or a cached response (`Age`) all fall back
 * to the client clock.
 */

/** Skew beyond this is a broken header or proxy, not a clock: ignore it. */
export const MAX_SKEW_MS = 12 * 60 * 60 * 1000;

let offsetMs = 0;

/** Record one response's `Date` header, received at client time `receivedAt`. */
export const noteServerDate = (header: string | null | undefined, receivedAt: number = Date.now()): void => {
  if (!header) return;
  const server = Date.parse(header);
  if (!Number.isFinite(server)) return;
  // The header has whole seconds: the server's real time is up to 1 s later.
  const offset = server + 500 - receivedAt;
  if (Math.abs(offset) > MAX_SKEW_MS) return;
  offsetMs = offset;
};

/**
 * One response's headers. A response with an `Age` header came from a cache or
 * proxy: its `Date` is when the ORIGIN answered, maybe long ago, so it says
 * nothing about the clock now — ignored.
 */
export const noteResponseClock = (headers: { get(name: string): string | null } | undefined | null, receivedAt: number = Date.now()): void => {
  if (!headers?.get) return;
  if (headers.get("Age") !== null) return;
  noteServerDate(headers.get("Date"), receivedAt);
};

/** Server time minus client time, in ms (0 until a usable header arrives). */
export const serverOffset = (): number => offsetMs;

/** `Date.now()` on the api's clock. */
export const serverNow = (): number => Date.now() + offsetMs;

export const __resetServerClockForTests = () => {
  offsetMs = 0;
};
