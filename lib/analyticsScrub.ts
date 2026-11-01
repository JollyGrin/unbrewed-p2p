/**
 * Error-message scrubbing shared by `client_error` (lib/analyticsErrors.ts) and
 * the `$exception` before_send pass (lib/analytics.ts). No imports, so neither
 * module depends on the other for it.
 */
const MESSAGE_MAX = 200;
/** Quoted runs longer than this are likely input echoed back (e.g. JSON.parse errors). */
const QUOTED_MAX = 16;
const QUOTED = new RegExp(`"[^"]{${QUOTED_MAX + 1},}"|'[^']{${QUOTED_MAX + 1},}'`, "g");

/** The message with long quoted segments redacted, cut to MESSAGE_MAX chars. */
export const scrubMessage = (message: string): string =>
  message.replace(QUOTED, (m) => `${m[0]}…${m[0]}`).slice(0, MESSAGE_MAX);
