/**
 * Which bot tiers the lobby may offer, and how each one is labelled (#458).
 *
 * The tier list is SERVER DATA, not a client constant. Protocol v23 added an
 * optional `HeroListing.botTiers` and a fourth tier (`expert`, the search bot),
 * and the server ships that tier DORMANT behind its own switch: while dormant it
 * omits `botTiers` from every listing and refuses an `expert` room exactly like a
 * v22 server. So `PROTOCOL_VERSION` says what a build CAN do; only the listing
 * says what this server WILL do — the client must feature-detect off the listing,
 * never off the version. That also keeps the client deploy independent of the
 * server's flag flip: this code renders Expert the moment the flag goes on, with
 * no redeploy here.
 *
 * Skew rules (both directions), straight from protocol.ts:
 *  - ABSENT `botTiers` (old server, or a dormant new one) → fall back to the v22
 *    set `easy|medium|hard`. Absence is the NORMAL case, not an error, so it must
 *    never produce an empty picker or a loading skeleton.
 *  - PRESENT `botTiers` is authoritative and used as-is. It always carries the
 *    always-available tiers and adds `expert` only for heroes the strength claim
 *    was actually measured on, and two heroes may legitimately differ.
 *
 * `expert` is gated on EVERY hero the room names — the bot's and the creator's —
 * because the search evaluates both sides, so a measured deck facing an unmeasured
 * one is still an unmeasured matchup. CREATE_ROOM enforces the same rule
 * (BAD_MESSAGE), so intersecting here is an affordance over a real gate, not a
 * cosmetic guess. Per #458 we simply don't offer a tier a hero can't have — there
 * is deliberately no per-hero "unavailable" UI.
 */
import type { BotDifficulty, HeroListing } from "./protocol";

/** The v22 tier set — what a server that doesn't advertise `botTiers` serves. */
export const FALLBACK_BOT_TIERS: readonly BotDifficulty[] = ["easy", "medium", "hard"];

/** Weakest → strongest. Drives render order regardless of the server's ordering. */
const TIER_ORDER: readonly BotDifficulty[] = ["easy", "medium", "hard", "expert"];

export interface BotTierChoice {
  id: BotDifficulty;
  /** Long form, for the roomy seat cards ("Hard bot"). */
  label: string;
  /** Compact form, for the create screen's seat plates ("AI·H"). */
  chip: string;
  /** Tiny provenance badge rendered next to the label, when the tier has one. */
  badge?: string;
  /** Hover copy for the badge. Player-facing and neutral — no internal names. */
  tooltip?: string;
}

const TIER_META: Record<BotDifficulty, BotTierChoice> = {
  easy: { id: "easy", label: "Easy bot", chip: "AI·E" },
  medium: { id: "medium", label: "Medium bot", chip: "AI·M" },
  hard: { id: "hard", label: "Hard bot", chip: "AI·H" },
  expert: {
    id: "expert",
    label: "Expert bot",
    chip: "AI·X",
    badge: "alpha",
    tooltip: "experimental - beware",
  },
};

export const botTierMeta = (tier: BotDifficulty): BotTierChoice => TIER_META[tier];

/**
 * The tiers this server will accept for a room involving `heroIds`.
 *
 * `heroIds` is every hero the room NAMES: the creator's pick plus any explicitly
 * chosen bot hero. Nulls/blanks (a seat whose hero the server picks at random)
 * are dropped — the server draws a random hero for an `expert` seat only from
 * heroes that support it, so an unnamed seat constrains nothing.
 */
export function availableBotTiers(
  heroes: HeroListing[] | null | undefined,
  heroIds: ReadonlyArray<string | null | undefined>,
): BotDifficulty[] {
  const fallback = [...FALLBACK_BOT_TIERS];
  const named = [...new Set(heroIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  // No roster yet, or nothing picked yet: the v22 set is always safe to offer.
  if (!heroes || named.length === 0) return fallback;

  const advertised: BotDifficulty[][] = [];
  for (const heroId of named) {
    const tiers = heroes.find((h) => h.heroId === heroId)?.botTiers;
    // An unknown hero or a listing without the field = no advertisement at all.
    if (!tiers) return fallback;
    advertised.push(tiers);
  }

  const offered = TIER_ORDER.filter((tier) => advertised.every((tiers) => tiers.includes(tier)));
  // A conforming server always advertises the always-available tiers, so this is
  // unreachable in practice — but a picker with no bot at all is worse than the
  // v22 set, so degrade rather than render a dead strip.
  return offered.length > 0 ? offered : fallback;
}

/** The same list as render-ready choices (labels, badge, tooltip). */
export function botTierChoices(
  heroes: HeroListing[] | null | undefined,
  heroIds: ReadonlyArray<string | null | undefined>,
): BotTierChoice[] {
  return availableBotTiers(heroes, heroIds).map(botTierMeta);
}

/**
 * Narrow a stored seat choice to one the current heroes still support. A creator
 * can arm an Expert seat and then switch to a hero the tier isn't offered for;
 * without this the room would be created only to be refused with BAD_MESSAGE.
 * Anything no longer offered drops to the strongest tier that IS.
 */
export function coerceBotTier(tier: BotDifficulty, available: readonly BotDifficulty[]): BotDifficulty {
  if (available.includes(tier)) return tier;
  const ordered = TIER_ORDER.filter((t) => available.includes(t));
  return ordered[ordered.length - 1] ?? "hard";
}
