/**
 * Client for the Pro server's stateless `POST /replay` endpoint (#122). The server
 * owns the rules engine; the browser ships it a bundle and gets back the God-view
 * step sequence (both hands/decks/discards/tokens per step) to scrub. The same call
 * VALIDATES an imported/shared bundle — the server rejects an illegal or
 * incompatible one, and we surface that message instead of saving garbage.
 */
import { PRO_WS_URL } from "./wsUrl";
import type { ReplayBundle, ReplayErrorCode, ReplayExpansion, ReplayResponse } from "./protocol";

/** ws(s):// → http(s):// on the same host, so /replay hits the same server. */
export function replayHttpBase(wsUrl: string = PRO_WS_URL): string {
  return wsUrl.replace(/^ws(s?):\/\//i, "http$1://").replace(/\/+$/, "");
}

export type ReplayFetchResult =
  | { ok: true; expansion: ReplayExpansion }
  // `code` is the server's typed reason when it answered at all (absent for a
  // network/parse failure). VERSION_MISMATCH is the one hard refusal left after
  // engine #509 — a digest-less bundle recorded on an older engine — and callers
  // title their toast differently for it.
  | { ok: false; message: string; code?: ReplayErrorCode };

/**
 * POST a bundle to `/replay`. Returns the expansion on success, or a
 * human-readable message on any failure (typed server rejection, network error,
 * or a non-JSON response). Never throws.
 */
export async function fetchReplayExpansion(
  bundle: ReplayBundle,
  opts: { wsUrl?: string; signal?: AbortSignal } = {},
): Promise<ReplayFetchResult> {
  const url = `${replayHttpBase(opts.wsUrl)}/replay`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle),
      signal: opts.signal,
    });
  } catch (e) {
    return { ok: false, message: `Could not reach the replay server (${(e as Error).message}). Is it running?` };
  }
  let body: ReplayResponse | null = null;
  try {
    body = (await res.json()) as ReplayResponse;
  } catch {
    return { ok: false, message: `Replay server returned a non-JSON response (HTTP ${res.status}).` };
  }
  if (body && body.ok) return { ok: true, expansion: body };
  return {
    ok: false,
    message: body?.message ?? `Replay rejected (HTTP ${res.status}).`,
    code: body?.code,
  };
}
