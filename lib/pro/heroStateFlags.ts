/**
 * Hero-state flag registry (issue #329). ONE source of truth mapping a public
 * per-player engine `flag` (PlayerView.flags — see protocol.ts; set via the
 * engine `setFlag` op) to its two client surfaces:
 *
 *  - `nameplate` — the always-visible HUD player-card pill (ProHud <FlagChip>).
 *  - `token`     — a corner badge on the fighter's board token (ProBoard).
 *
 * A single registry entry lights up BOTH surfaces, so a new flag-driven hero
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
 *    Human is the useful default so the surfaces still answer "what form?").
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
}

/**
 * The registry. Each entry declares the surfaces its flag drives.
 *
 * - Thetis `HIGH_TIDE`: standalone two-state — nameplate flips HIGH/LOW TIDE,
 *   token flips a rising/ebbing badge.
 * - Malfurion `DRUID_FORM_*`: an exclusive `druid-form` group — one form active
 *   at a time; Human is the default.
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
  },
  {
    flag: "DRUID_FORM_BEAR",
    heroes: ["malfurion-stormrage"],
    group: "druid-form",
    nameplate: { onLabel: "BEAR", offLabel: "", showWhenAbsent: false },
    token: { on: { icon: "🐾", label: "Bear", title: "Bear Form", bg: "#5A351C", color: "#FFF1D6" } },
  },
  {
    flag: "DRUID_FORM_MOONKIN",
    heroes: ["malfurion-stormrage"],
    group: "druid-form",
    nameplate: { onLabel: "MOONKIN", offLabel: "", showWhenAbsent: false },
    token: { on: { icon: "☾", label: "Moonkin", title: "Moonkin Form", bg: "#244D7A", color: "#EAF4FF" } },
  },
  {
    flag: "DRUID_FORM_HUMAN",
    heroes: ["malfurion-stormrage"],
    group: "druid-form",
    isDefault: true,
    nameplate: { onLabel: "HUMAN", offLabel: "", showWhenAbsent: false },
    token: { on: { icon: "✦", label: "Human", title: "Human Form", bg: "#2E6B48", color: "#ECFFF4" } },
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
 * Resolve the single token badge for one fighter's hero, or null. A set flag
 * wins (first in registry order); with none set, an exclusive group falls back
 * to its `isDefault`, and a standalone two-state flag shows its `off` variant.
 * Heroes with no token-bearing entry get null (initials-only token as before).
 */
export const fighterTokenBadgeFor = (
  heroId: string | undefined,
  flags: Record<string, boolean> | undefined
): FlagTokenBadge | null => {
  if (!heroId) return null;
  const entries = entriesForHero(heroId).filter((e) => e.token);
  for (const e of entries) if (flags?.[e.flag]) return e.token!.on;
  for (const e of entries) {
    if (e.isDefault) return e.token!.on;
    if (e.token!.off) return e.token!.off;
  }
  return null;
};

/**
 * Per-owner token badges for a set of seats. ProBoard renders badges by fighter
 * owner (ViewFighter carries owner, not heroId), so callers pre-resolve here.
 * Owners with no active badge are omitted.
 */
export const tokenBadgesByOwner = (
  players: Array<{ id: PlayerId; heroId: string; flags?: Record<string, boolean> }>
): Partial<Record<PlayerId, FlagTokenBadge>> =>
  Object.fromEntries(
    players
      .map((p) => [p.id, fighterTokenBadgeFor(p.heroId, p.flags)] as const)
      .filter((entry): entry is readonly [PlayerId, FlagTokenBadge] => !!entry[1])
  );
