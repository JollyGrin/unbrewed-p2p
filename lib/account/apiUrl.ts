/**
 * Accounts API (unbrewed-api on Railway) — see the epic plan at
 * https://github.com/JollyGrin/unbrewed-api/blob/main/docs/plan/accounts-phase-1-2.md
 *
 * Hardcoded as the default so a plain GitHub Pages build with no env still
 * points at the real service. Override via NEXT_PUBLIC_API_URL (e.g.
 * http://localhost:8789 in .env.local for local dev).
 *
 * `||` not `??`: CI expands an unset repo variable to "" — an empty string must
 * also fall through to this default, and only `||` treats "" as absent.
 * (Same pattern and caveat as PRO_WS_URL in lib/pro/wsUrl.ts.)
 */
const DEFAULT_API_URL = "https://api.unbrewed.xyz";

/** No trailing slash, so `${API_URL}/me` never becomes a double slash. */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL
).replace(/\/+$/, "");
