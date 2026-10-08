/**
 * The map lock's content hash (#1268, hardening contract item 3). When the
 * organizer fixes a board, the rule's map lock carries
 * `sha256Hex(canonicalJson(customMap))` of the EXACT object a ticketed
 * CREATE_ROOM sends for it (`ticketBoard` in lib/pro/tournamentTicket), and the
 * engine refuses a room whose board hashes differently. A lock without a hash
 * behaves as before, so anything that can't hash (no WebCrypto, an engine board
 * that sends no customMap) simply omits it — map selection never blocks on it.
 */
import { ticketBoard } from "@/lib/pro/tournamentTicket";

import type { MapRef, MatchupRule } from "./types";

/**
 * Recursively key-sorted (code-unit order), array order kept, no whitespace,
 * `JSON.stringify` for every scalar and string (so `é` stays literal). Input is
 * a JSON value: what went through `JSON.stringify` on the wire.
 */
export const canonicalJson = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
};

/** SHA-256 of the UTF-8 bytes as 64 lowercase hex chars, or null without WebCrypto. */
export const sha256Hex = async (text: string): Promise<string | null> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
};

/**
 * The hash of the board a ticketed CREATE_ROOM sends for this lock, or null
 * when it sends none (an engine board, an unknown or custom map). The object is
 * taken through a JSON round trip first: the engine hashes what it parsed off
 * the wire, where `undefined` keys are gone.
 */
export const mapLockHash = async (ref: MapRef): Promise<string | null> => {
  const board = ticketBoard({ kind: ref.kind, id: ref.id });
  if (!board.ok || board.customMap === undefined) return null;
  return sha256Hex(canonicalJson(JSON.parse(JSON.stringify(board.customMap))));
};

/** The ref with its content hash, or as it was (no `hash` key) when none can be made. */
export const withMapHash = async (ref: MapRef): Promise<MapRef> => {
  const { hash: _stale, ...plain } = ref;
  const hash = await mapLockHash(plain);
  return hash ? { ...plain, hash } : plain;
};

/** A matchup rule whose map lock carries its content hash. */
export const ruleWithMapHash = async <R extends MatchupRule | null>(rule: R): Promise<R> =>
  rule?.map ? ({ ...rule, map: await withMapHash(rule.map) } as R) : rule;
