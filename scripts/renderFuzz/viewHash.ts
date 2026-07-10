/**
 * Deterministic content hash of a view (unbrewed-p2p-179).
 *
 * Keys are sorted recursively before stringifying so the same logical view
 * always hashes the same regardless of property order — the hash names the
 * finding artifact and lets a repro confirm it re-rendered the exact view.
 */
import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function viewHash(view: unknown): string {
  return createHash("sha1").update(JSON.stringify(canonicalize(view))).digest("hex").slice(0, 16);
}
