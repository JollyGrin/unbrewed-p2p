/**
 * Where to send a player who wants to complain that we lost their game
 * (issue #133). Reached from the "Game lost" fallback screen — see
 * components/Pro/GameLostScreen (rendered in pages/pro/game.tsx).
 *
 * TODO(Dean): exact Discord invite/DM URL to bake in — the invite/channel/DM
 * link that reaches JollyGrin. Until it's filled in this stays `null` on
 * purpose: we would rather show a disabled, honest placeholder than send a
 * frustrated player to a guessed URL that goes nowhere. The screen falls back
 * to the existing `[pro]` GitHub issue path (lib/pro/bugReport.ts) meanwhile.
 */
export const DISCORD_REPORT_URL: string | null = null;

/** Who the report is meant to reach — shown next to the (placeholder) button. */
export const DISCORD_REPORT_HANDLE = "JollyGrin";
