/**
 * Hero-state flag registry (issue #329). ONE source of truth mapping a public
 * per-player engine `flag` (PlayerView.flags — see protocol.ts; set via the
 * engine `setFlag` op) to its two client surfaces:
 *
 *  - `nameplate` — the always-visible HUD player-card pill (ProHud <FlagChip>).
 *  - `token`     — a corner badge on the fighter's board token (ProBoard).
 *  - `tokenArt`  — a per-state swap of the HERO token's PORTRAIT art (issue #330),
 *                  not just a badge overlay. The deck JSON's fixed `tokenImageUrl`
 *                  stays the default; this override picks a state-specific portrait.
 *
 * A single registry entry lights up ALL THREE surfaces, so a new flag-driven hero
 * state needs only an entry here (+ optionally a bespoke nameplate glyph in
 * ProHud's FLAG_CHIP_ICONS) — ZERO ProHud/ProBoard component changes. This
 * replaces the split systems that predated it: the nameplate-only FLAG_HUD_CHIPS
 * and the token-only, Malfurion-hardcoded druidFormTokenBadge.
 *
 * Two shapes of state are expressed with the same fields:
 *
 *  - Standalone two-state flag (Thetis tide): one entry whose `token.off` /
 *    `nameplate.showWhenAbsent` describe the ABSENT variant, so the surfaces
 *    still render (LOW TIDE) when the flag is off.
 *  - Exclusive group (Malfurion druid forms): several entries sharing a `group`,
 *    of which exactly one is active — the one whose flag is set, or the
 *    `isDefault` entry when none is (an older snapshot may omit the form flag;
 *    Night Elf is the useful default so the surfaces still answer "what form?").
 */
import { PlayerId } from "./protocol";

/** Board-token corner badge presentation (icon + label + colors). */
export interface FlagTokenBadge {
  icon: string;
  label: string;
  title: string;
  bg: string;
  color: string;
}

/** HUD nameplate pill presentation for a flag's on/off words. */
export interface FlagNameplate {
  onLabel: string;
  offLabel: string;
  /** render `offLabel` when the flag is absent (public two-state mechanics like
   *  tide). Ignored for exclusive-group entries (the active member always shows
   *  its `onLabel`). */
  showWhenAbsent: boolean;
}

export interface HeroStateFlag {
  /** the PlayerView `flags` key this state reads. */
  flag: string;
  /** hero ids the state applies to (the "has the mechanic" gate). An absent flag
   *  on any other hero means nothing, so the state never renders there. */
  heroes: string[];
  /** exclusive-group id: entries sharing it are mutually exclusive; exactly one
   *  renders — the set flag's, or the group's `isDefault`. Omit for standalone
   *  two-state flags. */
  group?: string;
  /** within a group, the entry to show when NONE of the group's flags is set. */
  isDefault?: boolean;
  /** HUD nameplate pill; omit for token-only states. */
  nameplate?: FlagNameplate;
  /** board-token badge (`on` = flag set, `off` = absent variant for two-state
   *  flags); omit for nameplate-only states. */
  token?: { on: FlagTokenBadge; off?: FlagTokenBadge };
  /** per-state HERO-token PORTRAIT art (issue #330): swaps the token image, not
   *  just a corner badge. `on` = flag set, `off` = absent variant. A missing
   *  variant (or no `tokenArt` at all) falls back to the deck's fixed
   *  `tokenImageUrl`, so heroes without an entry render exactly as before. Only
   *  the HERO token swaps; the sidekick keeps its fixed art. */
  tokenArt?: { on: string; off?: string };
  /** when a variant supplies portrait art, suppress its corner badge — the
   *  portrait already conveys the state (recommended for art swaps like tide).
   *  A variant with no art keeps its badge regardless. */
  hideBadgeWhenArt?: boolean;
}

/**
 * The registry. Each entry declares the surfaces its flag drives.
 *
 * - Thetis `HIGH_TIDE`: standalone two-state — nameplate flips HIGH/LOW TIDE,
 *   token flips the whole PORTRAIT (high- vs low-tide art, both already committed
 *   under public/evergreen-decks/art/thetis/). `hideBadgeWhenArt` drops the corner
 *   badge here since the portrait itself reads as the tide state.
 * - Malfurion `DRUID_FORM_*`: an exclusive `druid-form` group — one form active
 *   at a time; Night Elf is the default. Each form swaps the whole PORTRAIT (elf /
 *   bear / moonkin busts, committed under public/evergreen-decks/art/
 *   malfurion-stormrage/) AND keeps its corner rim badge (🐾 / ☾ / ✦) — unlike
 *   tide, the form is worth calling out on all three surfaces at once (portrait +
 *   rim badge + nameplate), so these entries leave `hideBadgeWhenArt` off (#385).
 */
export const HERO_STATE_FLAGS: HeroStateFlag[] = [
  {
    flag: "HIGH_TIDE",
    heroes: ["thetis", "thetis-spice"],
    nameplate: { onLabel: "HIGH TIDE", offLabel: "LOW TIDE", showWhenAbsent: true },
    token: {
      on: { icon: "🌊", label: "High", title: "High Tide", bg: "#2E6E8E", color: "#EAF6FB" },
      off: { icon: "🐚", label: "Low", title: "Low Tide", bg: "#586A73", color: "#E9F0F3" },
    },
    // Both tide portraits are committed; the board swaps between them by flag. The
    // deck's fixed tokenImageUrl (low tide) remains the safe default if the query
    // hasn't resolved the flag yet.
    tokenArt: {
      on: "https://unbrewed.xyz/evergreen-decks/art/thetis/token-thetis-high.webp",
      off: "https://unbrewed.xyz/evergreen-decks/art/thetis/token-thetis-low.webp",
    },
    hideBadgeWhenArt: true,
  },
  {
    flag: "DRUID_FORM_BEAR",
    heroes: ["malfurion-stormrage"],
    group: "druid-form",
    nameplate: { onLabel: "BEAR", offLabel: "", showWhenAbsent: false },
    token: { on: { icon: "🐾", label: "Bear", title: "Bear Form", bg: "#5A351C", color: "#FFF1D6" } },
    // Bear-form bust (shipped #334). Keep the rim badge alongside the portrait
    // (#385) so the form reads on the token even at a glance.
    tokenArt: { on: "https://unbrewed.xyz/evergreen-decks/art/malfurion-stormrage/token-malfurion-bear.webp" },
  },
  {
    flag: "DRUID_FORM_MOONKIN",
    heroes: ["malfurion-stormrage"],
    group: "druid-form",
    nameplate: { onLabel: "MOONKIN", offLabel: "", showWhenAbsent: false },
    token: { on: { icon: "☾", label: "Moonkin", title: "Moonkin Form", bg: "#244D7A", color: "#EAF4FF" } },
    tokenArt: { on: "https://unbrewed.xyz/evergreen-decks/art/malfurion-stormrage/token-malfurion-moonkin.webp" },
  },
  {
    flag: "DRUID_FORM_HUMAN",
    heroes: ["malfurion-stormrage"],
    group: "druid-form",
    isDefault: true,
    nameplate: { onLabel: "NIGHT ELF", offLabel: "", showWhenAbsent: false },
    token: { on: { icon: "✦", label: "Night Elf", title: "Night Elf Form", bg: "#2E6B48", color: "#ECFFF4" } },
    // Stated explicitly (== the deck's fixed tokenImageUrl) so the group self-
    // documents its default, and stays correct if that fixed art ever diverges.
    tokenArt: { on: "https://unbrewed.xyz/evergreen-decks/art/malfurion-stormrage/token-malfurion.webp" },
  },
];

/** All registry entries a hero participates in, in registry order. */
const entriesForHero = (heroId: string) =>
  HERO_STATE_FLAGS.filter((e) => e.heroes.includes(heroId));

/** The active member of an exclusive group: the entry whose flag is set, else
 *  the group's `isDefault`, else none. */
const activeGroupEntry = (
  group: HeroStateFlag[],
  flags: Record<string, boolean> | undefined
): HeroStateFlag | null =>
  group.find((e) => flags?.[e.flag]) ?? group.find((e) => e.isDefault) ?? null;

/**
 * Nameplate chip shape consumed by ProHud's <FlagChip>. A thin projection of a
 * registry entry — just the fields the pill renders (flag for its optional glyph
 * lookup, on/off words) — so the component stays a dumb consumer of this output.
 */
export interface FlagHudChip {
  flag: string;
  onLabel: string;
  offLabel: string;
}

const toChip = (e: HeroStateFlag): FlagHudChip => ({
  flag: e.flag,
  onLabel: e.nameplate!.onLabel,
  offLabel: e.nameplate!.offLabel,
});

/**
 * Resolve the nameplate chips to render for one player card. Pure + generic over
 * the registry: a standalone two-state flag yields a chip when set OR when
 * `showWhenAbsent`; an exclusive group yields exactly its active member's chip.
 * Non-registered heroes get [] (no stray "off" pill). Each chip is paired with
 * its live on/off state so ProHud can pick the label/palette.
 */
export const flagChipsFor = (
  heroId: string,
  flags: Record<string, boolean> | undefined
): { chip: FlagHudChip; on: boolean }[] => {
  const entries = entriesForHero(heroId).filter((e) => e.nameplate);
  const chips: { chip: FlagHudChip; on: boolean }[] = [];
  const seenGroups = new Set<string>();
  for (const e of entries) {
    if (e.group) {
      if (seenGroups.has(e.group)) continue;
      seenGroups.add(e.group);
      const active = activeGroupEntry(
        entriesForHero(heroId).filter((x) => x.group === e.group),
        flags
      );
      if (active?.nameplate) chips.push({ chip: toChip(active), on: true });
    } else {
      const on = !!flags?.[e.flag];
      if (on || e.nameplate!.showWhenAbsent) chips.push({ chip: toChip(e), on });
    }
  }
  return chips;
};

/**
 * The winning token variant for one fighter's hero given its live flags: which
 * registry entry, and whether its `on` (flag set / group-default) or `off`
 * (absent two-state variant) presentation applies. A set flag wins (first in
 * registry order); with none set, an exclusive group falls back to its
 * `isDefault` (`on`), and a standalone two-state flag shows its `off`. Considers
 * entries bearing EITHER a badge or portrait art, so badge and art always resolve
 * the SAME variant and never disagree. Null when the hero has no token entry.
 */
const activeTokenVariant = (
  heroId: string | undefined,
  flags: Record<string, boolean> | undefined
): { entry: HeroStateFlag; on: boolean } | null => {
  if (!heroId) return null;
  const entries = entriesForHero(heroId).filter((e) => e.token || e.tokenArt);
  for (const e of entries) if (flags?.[e.flag]) return { entry: e, on: true };
  for (const e of entries) {
    if (e.isDefault) return { entry: e, on: true };
    if (e.token?.off || e.tokenArt?.off) return { entry: e, on: false };
  }
  return null;
};

const badgeOf = (v: { entry: HeroStateFlag; on: boolean }): FlagTokenBadge | null =>
  (v.on ? v.entry.token?.on : v.entry.token?.off) ?? null;

const artOf = (v: { entry: HeroStateFlag; on: boolean }): string | null =>
  (v.on ? v.entry.tokenArt?.on : v.entry.tokenArt?.off) ?? null;

/**
 * Resolve the single token badge for one fighter's hero, or null. Heroes with no
 * token-bearing entry get null (initials-only token as before). This is the badge
 * a state DECLARES; art-driven suppression (`hideBadgeWhenArt`) is applied by the
 * composed `fighterTokenStateFor`, so this stays a pure per-state unit.
 */
export const fighterTokenBadgeFor = (
  heroId: string | undefined,
  flags: Record<string, boolean> | undefined
): FlagTokenBadge | null => {
  const v = activeTokenVariant(heroId, flags);
  return v ? badgeOf(v) : null;
};

/**
 * Resolve the per-state HERO-token PORTRAIT art override for one fighter's hero,
 * or null to fall back to the deck's fixed `tokenImageUrl`. Reads the same active
 * variant as the badge, so tide art and tide badge always agree.
 */
export const fighterTokenArtFor = (
  heroId: string | undefined,
  flags: Record<string, boolean> | undefined
): string | null => {
  const v = activeTokenVariant(heroId, flags);
  return v ? artOf(v) : null;
};

/**
 * Combined token presentation for one fighter's hero: the corner `badge` and the
 * HERO-token portrait art override (`heroArtUrl`). When the active variant swaps
 * art AND its entry sets `hideBadgeWhenArt`, the badge is dropped (the portrait
 * conveys the state). Both fields null for a hero with no token entry.
 */
export interface FighterTokenState {
  badge: FlagTokenBadge | null;
  /** HERO-token portrait override URL, or null to keep the deck's fixed art. */
  heroArtUrl: string | null;
}

export const fighterTokenStateFor = (
  heroId: string | undefined,
  flags: Record<string, boolean> | undefined
): FighterTokenState => {
  const v = activeTokenVariant(heroId, flags);
  if (!v) return { badge: null, heroArtUrl: null };
  const heroArtUrl = artOf(v);
  const badge = heroArtUrl && v.entry.hideBadgeWhenArt ? null : badgeOf(v);
  return { badge, heroArtUrl };
};

/**
 * Per-owner token state for a set of seats. ProBoard resolves both the badge and
 * the portrait-art swap by fighter owner (ViewFighter carries owner, not heroId),
 * so callers pre-resolve here — ONE map feeding both the `fighterTokenBadge` and
 * `fighterTokenArt` props. Owners whose state has neither a badge nor an art
 * override are omitted.
 */
export const fighterTokenStateByOwner = (
  players: Array<{ id: PlayerId; heroId: string; flags?: Record<string, boolean> }>
): Partial<Record<PlayerId, FighterTokenState>> =>
  Object.fromEntries(
    players
      .map((p) => [p.id, fighterTokenStateFor(p.heroId, p.flags)] as const)
      .filter(([, st]) => st.badge || st.heroArtUrl)
  );
