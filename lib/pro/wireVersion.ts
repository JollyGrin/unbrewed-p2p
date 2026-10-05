/**
 * Which protocol version this tab speaks to an engine (p2p #880).
 *
 * The rematch offer/confirm messages (engine #607) need v35, but prod engines
 * that predate it accept only {33, 34} and answer anything else with
 * ERROR{VERSION}. And the v35 engine decides whether a seat can take REMATCH_*
 * from the `v` of the message that BOUND the seat (CREATE/JOIN/RECONNECT/
 * RESUME) — a seat bound at v34 is never offered a rematch, and one that comes
 * back at v34 mid-offer closes it.
 *
 * `/healthz` would say `rematch: true`, but it sends no CORS header, so a page
 * can't read it. Every server frame stamps its own `v` though, so the tab
 * learns the engine's version from the first reply on a socket (the
 * LIST_HEROES answer every open asks for) and remembers it per engine URL in
 * sessionStorage.
 *
 * #1201: since engine #754 the server accepts only {35, 36} and answers v34 with
 * ERROR{VERSION}, so the v34 fallback is gone: every seat binds at
 * `PROTOCOL_VERSION` (37 since engine #755), which is already rematch-capable. The learned version
 * still gates the rematch UI (`engineSpeaksRematch`).
 */
import { PROTOCOL_VERSION, REMATCH_PROTOCOL_VERSION } from "./protocol";

const KEY_PREFIX = "unbrewed-pro-engine-v-";
const memory = new Map<string, number>();

function read(url: string): number | null {
  if (memory.has(url)) return memory.get(url)!;
  try {
    const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(KEY_PREFIX + url) : null;
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** The engine version this tab last saw on `url`, or null if it has seen none. */
export function knownEngineVersion(url: string): number | null {
  return read(url);
}

/** Record the `v` an engine frame carried. Non-numbers are ignored. */
export function rememberEngineVersion(url: string, v: unknown): void {
  if (typeof v !== "number" || !Number.isFinite(v) || read(url) === v) return;
  memory.set(url, v);
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(KEY_PREFIX + url, String(v));
  } catch {
    /* private mode: the in-memory copy still serves this page */
  }
}

/** Drop what we learned (the engine answered ERROR{VERSION} — e.g. it was rolled back). */
export function forgetEngineVersion(url: string): void {
  memory.delete(url);
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(KEY_PREFIX + url);
  } catch {
    /* nothing stored */
  }
}

/** True once `url` has shown it serves the rematch negotiation (v35+). */
export function engineSpeaksRematch(url: string): boolean {
  const v = read(url);
  return v !== null && v >= REMATCH_PROTOCOL_VERSION;
}

/** The `v` to bind a seat with on `url`. Always `PROTOCOL_VERSION` since #1201 —
 *  a prod engine refuses anything below 35, so there is no older version to fall
 *  back to. Kept as a function so callers stay unchanged. */
export function wireVersionFor(_url: string): number {
  return PROTOCOL_VERSION;
}

/** Test hook: forget every URL. */
export function resetEngineVersions(): void {
  for (const url of Array.from(memory.keys())) forgetEngineVersion(url);
}
