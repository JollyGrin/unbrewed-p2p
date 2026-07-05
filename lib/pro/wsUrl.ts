// Live Pro server (Railway). Hardcoded as the default so a plain GitHub Pages
// build with no env still connects to a real backend and is playable. Override
// via NEXT_PUBLIC_PRO_WS_URL (e.g. ws://localhost:8787 in .env for local dev).
// `||` not `??`: CI expands an unset repo variable to "" — an empty string must
// also fall through to this default, and only `||` treats "" as absent.
const DEFAULT_PRO_WS_URL = "wss://unbrewed-engine-production.up.railway.app";
export const PRO_WS_URL = process.env.NEXT_PUBLIC_PRO_WS_URL || DEFAULT_PRO_WS_URL;
