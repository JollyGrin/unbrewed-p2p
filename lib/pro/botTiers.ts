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

/**
 * The tiers THIS CLIENT will ever render. `BotDifficulty` mirrors the engine and
 * so also names `jev`, but the client deliberately does not show it (#933): a
 * tier missing here is dropped even when a server lists it.
 */
export type ClientBotTier = Exclude<BotDifficulty, "jev">;

/** The v22 tier set — what a server that doesn't advertise `botTiers` serves. */
export const FALLBACK_BOT_TIERS: readonly ClientBotTier[] = ["easy", "medium", "hard"];

/** Weakest → strongest. Drives render order regardless of the server's ordering. */
const TIER_ORDER: readonly ClientBotTier[] = ["easy", "medium", "hard", "expert", "jevx3"];

export interface BotTierChoice {
  id: BotDifficulty;
  /** Long form, for the roomy seat cards ("Hard bot"). The everyday name. */
  label: string;
  /** The exact, versioned name ("Prodigy 3") for a tier that has one — shown only
   *  where a player looks closer (the chip's tooltip), never where space is tight. */
  fullName?: string;
  /** Compact form, for the create screen's seat plates ("AI·H"). */
  chip: string;
  /** Tiny provenance badge rendered next to the label, when the tier has one. */
  badge?: string;
  /** Hover copy for the badge. Player-facing and neutral — no internal names. */
  tooltip?: string;
  /** Offered by the server but not yet earned by this player (#933): the chip
   *  renders, but picking it is a no-op. Set by lib/pro/tierUnlock.ts. */
  locked?: boolean;
  /** Why it is locked / how far along the player is. Shown instead of `tooltip`. */
  lockHint?: string;
}

/**
 * A tier named like a model family + exact version: `label` is the everyday name,
 * `fullName` the versioned one, and the tooltip is derived from them.
 */
const versioned = (meta: BotTierChoice & { fullName: string }): BotTierChoice => ({
  ...meta,
  tooltip: meta.badge ? `${meta.fullName} · ${meta.badge}` : meta.fullName,
});

/**
 * Everything a player can read about a tier. Player-facing text must never reveal
 * the tech behind a tier (no internal ids, model or API names) — the wire id
 * `jevx3` stays internal. Rename it, or bump its version, by editing the `jevx3`
 * line below and nothing else.
 */
const TIER_META: Record<ClientBotTier, BotTierChoice> = {
  easy: { id: "easy", label: "Easy bot", chip: "Bot·E" },
  medium: { id: "medium", label: "Medium bot", chip: "Bot·M" },
  hard: { id: "hard", label: "Hard bot", chip: "Bot·H" },
  expert: {
    id: "expert",
    label: "Expert bot",
    chip: "Bot·X",
    badge: "alpha",
    tooltip: "experimental - beware",
  },
  jevx3: versioned({ id: "jevx3", label: "Prodigy", fullName: "Prodigy 3", chip: "Bot·P", badge: "preview" }),
};

export const botTierMeta = (tier: ClientBotTier): BotTierChoice => TIER_META[tier];

/**
 * A chip's tooltip. Unlocked: the tier's own tooltip. Locked: the unlock hint,
 * then the full name on its own line (render with `whiteSpace="pre-line"`).
 */
export const tierTooltip = (
  c: Pick<BotTierChoice, "tooltip" | "locked" | "lockHint" | "fullName">,
): string | undefined =>
  c.locked ? [c.lockHint, c.fullName].filter(Boolean).join("\n") || undefined : c.tooltip;

/** Player-facing meta for any difficulty string, or null for one this client never shows. */
export const knownBotTierMeta = (tier: string): BotTierChoice | null =>
  Object.prototype.hasOwnProperty.call(TIER_META, tier) ? TIER_META[tier as ClientBotTier] : null;

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
): ClientBotTier[] {
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
