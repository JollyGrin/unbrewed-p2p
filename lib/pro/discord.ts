/**
 * Where to send a player who wants to complain that we lost their game
 * (issue #133). Reached from the "Game lost" fallback screen — see
 * components/Pro/GameLostScreen (rendered in pages/pro/game.tsx).
 *
 * We reuse the existing site-wide invite (the same one the navbar and the
 * Discord widget fall back to) so there's a single source of truth rather than a
 * second hardcoded invite code that could drift.
 */
import { DISCORD_FALLBACK_INVITE } from "@/lib/hooks/useDiscordWidget";

export const DISCORD_REPORT_URL: string | null = DISCORD_FALLBACK_INVITE;

/** Who the report is meant to reach — shown next to the (placeholder) button. */
export const DISCORD_REPORT_HANDLE = "JollyGrin";
