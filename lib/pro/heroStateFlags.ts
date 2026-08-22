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
import { CardInstanceId, PlayerId } from "./protocol";

/** Board-token corner badge presentation (icon + label + colors). */
export interface FlagTokenBadge {
  icon: string;
  label: string;
  title: string;
  bg: string;
  color: string;
  /** draw `label` next to the icon on the board token. Numeric states (a counter
   *  or a set-aside pile) set this so the LIVE VALUE reads off the board itself
   *  rather than only out of the badge tooltip; word-labelled flag states
   *  ("Bear", "High") leave it off — the icon carries them and the words would
   *  not fit the rim badge. */
  showLabel?: boolean;
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
 * - Doppelgänger `EQUILIBRIUM`: standalone but ONE-SIDED — nameplate pill + token
 *   badge appear only while the stance is held (no `off` variant, no portrait
 *   swap), since "not in equilibrium" is every other fighter's default state.
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
  {
    // Kenshiro's NUNCHAKU turn buff (issue #596 ↔ engine #362). Engine flag key is
    // `NUNCHAKU` — the scheme grants "all of Kenshiro's attacks this turn are +1
    // value", which is otherwise INVISIBLE: the buff lands on a card that has not
    // been played yet, so without a pill the player has no way to see the +1 is
    // live when they pick their attack. One-sided like EQUILIBRIUM: "no nunchaku"
    // is the default state, so no `off` variant and `showWhenAbsent: false`.
    //
    // NAMEPLATE ONLY, deliberately — and it STAYS that way now that nothing competes
    // for the token's single corner-badge slot. The old reason was that a flag badge
    // would win the slot from his chain-ledger counter (fighterTokenStateByOwner gives
    // flag badges precedence over counter badges); engine #377 deleted that counter, so
    // Kenshiro has no counter badge left to lose. Neither buff is promoted to the badge
    // regardless: both are TURN-scoped and only matter while their owner is choosing an
    // attack — the two nameplate pills already state them where that choice is made, and
    // a single rim badge could carry only one of the two anyway, so the board would
    // narrate half the buff state and imply the other half was off.
    //
    // Kenshiro's whole public state-key contract, as of engine #377: flag `NUNCHAKU`,
    // flag `DRAGON_FORM`, per-fighter marker `MERIDIAN` (lib/pro/fighterStatuses.ts).
    // NO counters — kenshiro.rules.ts declares none, so his `counters` map is empty for
    // the entire game and he owns no HERO_STATE_COUNTERS row.
    flag: "NUNCHAKU",
    heroes: ["kenshiro"],
    nameplate: { onLabel: "NUNCHAKU +1", offLabel: "", showWhenAbsent: false },
  },
  {
    // Kenshiro's DRAGON_FORM turn buff (issue #596 ↔ engine #362). Engine flag key
    // is `DRAGON_FORM`: Hokuto: Dragon Form Breathing Technique makes every HOKUTO
    // card +2 value this turn, but ONLY if an ally fighter was damaged last turn —
    // so the pill answers "did the condition hold?" without replaying the turn.
    // Nameplate only, for the same reason as NUNCHAKU above.
    //
    // The pill is the WHOLE story of the buff: an `ALLY_DAMAGED_LAST_TURN` flag entry
    // used to sit beside this one, showing the scheme's gate, but engine #368 turned
    // that gate into a live `FIGHTER_TOOK_DAMAGE … window:'LAST_TURN'` predicate over
    // the ally selector, so no carry-forward flag is set any more and the key is
    // retired from the contract. Only the RESULT is public now.
    flag: "DRAGON_FORM",
    heroes: ["kenshiro"],
    nameplate: { onLabel: "DRAGON FORM +2", offLabel: "", showWhenAbsent: false },
  },
  {
    // The Doppelgänger's EQUILIBRIUM stance (issue #545 ↔ engine #303). Raw engine
    // flag key is `EQUILIBRIUM` — the deck's two COMBAT_RESOLVED triggers are
    // `setFlag EQUILIBRIUM` on `{is:'UNKNOWN'}` and `setFlag EQUILIBRIUM
    // mode:'CLEAR'` on `{not:{is:'UNKNOWN'}}` (doppelganger-design.md § Hero) —
    // so the gate uses that exact key, not the "STILL WATERS" flavour label of the
    // resolver ability.
    //
    // Standalone but ONE-SIDED, unlike Thetis's tide: the flag is armed by a
    // no-winner combat and broken by ANY decided one (including the Doppelgänger's
    // own wins), and "not in equilibrium" is simply the default state of every
    // fighter on the board — there is nothing to announce. So no `off` variant and
    // `showWhenAbsent: false`: both surfaces appear only while the stance is held,
    // which is exactly when the opponent needs to know that The Omen reads 5 and
    // Shatter the Glass swings +2.
    //
    // No `tokenArt`: the deck has a single hero portrait (the mirror-double), so
    // the corner badge carries the state on the board.
    flag: "EQUILIBRIUM",
    heroes: ["doppelganger"],
    nameplate: { onLabel: "EQUILIBRIUM", offLabel: "", showWhenAbsent: false },
    token: {
      on: {
        icon: "⚖",
        label: "Balance",
        title: "Equilibrium — the last combat had no winner",
        // Silvered-glass slate, distinct from tide blue and the druid-form palettes.
        bg: "#55636F",
        color: "#F0F4F8",
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Counter-driven states (issue #420: Nancy Drew's CLUE economy; issue #539:
// Luke Skywalker's TRAINING pile, counted off a card zone instead of an int)
// ---------------------------------------------------------------------------

/**
 * A public per-player NUMERIC state, from either of two protocol fields:
 *
 *  - `counter` — a `PlayerView.counters` int (moved by the engine `counter` op,
 *    broadcast via COUNTER_CHANGED). Nancy's CLUE, Cairne's RAGE.
 *  - `pile` — the LENGTH of a `PlayerView.piles` set-aside pile (protocol v25 /
 *    DSL v0.29.0: a named, public, face-up per-player zone of cards tucked under
 *    the hero card). Luke's TRAINING pile. A pile is a CARD LIST, not an int, but
 *    its player-facing state is "how many are tucked" — so it projects onto the
 *    same two surfaces through the same entry shape, and additionally exposes the
 *    card ids so the pill can open an inspection overlay (the zone is public, so
 *    EITHER player may read EITHER pile).
 *
 * Both are a DIFFERENT protocol field from `flags`: flags are booleans. Rather
 * than fake a count as N boolean flag states (a hardcoded 0..max group that
 * multiplies per resource deck), each is ONE registry entry here, projected onto
 * the SAME two render surfaces the flag registry drives — the nameplate
 * <FlagChip> pill and the token corner badge. A future counter/pile deck adds a
 * single entry; zero ProHud/ProBoard component changes.
 *
 * Both surfaces are HIDDEN AT 0 (an empty resource / untucked pile reads as no
 * chip / no badge). Counters and piles are public, so they render on BOTH seats'
 * plates.
 *
 * Exactly one of `counter` / `pile` is set — `sourceKey` is the entry's identity
 * either way.
 */
export interface HeroStateCounter {
  /** the PlayerView `counters` key the engine emits. VERIFY against the engine's
   *  rules.ts — the key is the raw counter name (Nancy's is `CLUE`, singular),
   *  which is NOT necessarily the flavor label ("CLUES"). Omit when `pile` is set. */
  counter?: string;
  /** the PlayerView `piles` key (protocol v25). The rendered value is the pile's
   *  LENGTH, and its cards are inspectable. VERIFY against the engine's rules.ts —
   *  Luke's is `TRAINING`. Omit when `counter` is set. */
  pile?: string;
  /** hero ids the counter applies to (the "has the mechanic" gate). */
  heroes: string[];
  /** HUD nameplate pill. `labelTemplate` substitutes `{n}` with the live value
   *  (e.g. "CLUES: {n}" -> "CLUES: 3"). Omit for token-only counters. */
  nameplate?: { labelTemplate: string };
  /** board-token corner badge. The badge `label` is the live value; `icon`,
   *  `title` prefix, and colors are fixed. Omit for nameplate-only counters. */
  token?: { icon: string; title: string; bg: string; color: string };
  /** the counter's declared ceiling, when the resource reads as "n OF max" rather
   *  than an open-ended pool. Substituted for `{max}` in `labelTemplate` and drawn
   *  on the token badge as "n/max", so both surfaces say the same thing the printed
   *  card does. Omit for open-ended counters (Nancy's CLUE, Cairne's RAGE), which
   *  render the bare value exactly as before. */
  outOf?: number;
  /** render both surfaces AT ZERO instead of hiding them (issue #663). The default
   *  is right for an UP counter — an empty pool is nothing to announce — and exactly
   *  wrong for a DOWN counter, where 0 is the loudest state on the board: Skull Kid's
   *  clock reads TIME 0/5 for the whole Clock Tower strike, which is the one moment
   *  both players most need the pill. */
  showAtZero?: boolean;
}

export const HERO_STATE_COUNTERS: HeroStateCounter[] = [
  {
    // Nancy Drew's CLUE economy (issue #420 ↔ engine #225). Engine counter key is
    // `CLUE` (singular; { name: 'CLUE', max: 5 } in nancy-drew.rules.ts) — the
    // "CLUES" plural is only flavor, so the pill/badge label carry it, the gate
    // uses the exact key.
    counter: "CLUE",
    heroes: ["nancy-drew"],
    nameplate: { labelTemplate: "CLUES: {n}" },
    token: { icon: "🔍", title: "CLUES", bg: "#6D4C8D", color: "#F3ECFA" },
  },
  {
    // Cairne Bloodhoof's RAGE economy (issue #480-family ↔ engine #241). Engine
    // counter key is `RAGE` (counters: [{ name: 'RAGE' }] in cairne-bloodhoof.rules.ts).
    // Rage-crimson bg / cream text match the deck's POSTER-STYLE palette. Hidden at
    // 0 like every counter (an empty rage pool reads as no chip / no badge).
    counter: "RAGE",
    heroes: ["cairne-bloodhoof"],
    nameplate: { labelTemplate: "RAGE: {n}" },
    token: { icon: "😡", title: "RAGE", bg: "#A61C1C", color: "#FDF3E3" },
  },
  {
    // Luke Skywalker's TRAINING pile (issue #539 ↔ engine #293/#294). PILE-sourced,
    // not a counter: the engine tucks each played "Training: …" scheme under the
    // hero card into the public `TRAINING` pile (const PILE = 'TRAINING' in
    // luke-skywalker.rules.ts), and two combat cards plus his maneuver allowance
    // scale off CARDS_IN_PILE. The count is therefore the pile's LENGTH, and the
    // pill opens the pile so either player can read WHICH Training cards are down.
    // Jedi-green/saber-blue palette, distinct from Nancy's purple and Cairne's red.
    pile: "TRAINING",
    heroes: ["luke-skywalker"],
    nameplate: { labelTemplate: "TRAINING: {n}" },
    token: { icon: "🌱", title: "TRAINING", bg: "#2E6B48", color: "#ECFFF4" },
  },
  {
    // Skull Kid's Clock Tower dial (issue #663 ↔ engine #449). Engine counter key is
    // `TIME` (`counters: [{ name: 'TIME', max: 5 }]` in skull-kid.rules.ts), seeded to
    // 5 by setupOps and ticked DOWN; at 0 the tower deals 5 to every opposing fighter
    // and the dial reverts to 5 in the same run.
    //
    // The deck is unreadable without this: every card in it is priced off "how close is
    // the clock", and Final Hour literally reads its value off `5 - TIME`. So it is
    // registered on BOTH surfaces — the nameplate pill AND the token badge — per the
    // Cairne lesson: a counter on only one surface is a resource the OPPONENT cannot
    // see, and this one is aimed squarely at them.
    //
    // `outOf: 5` mirrors the declared max so both surfaces read "3/5" the way the rule
    // card does, and `showAtZero` keeps them up at TIME 0 — the instant of the strike,
    // when the mitigation prompts are parked and the clock is the whole story. That 0 is
    // an ABSENT key on the wire, not a zero value: the engine drops a counter key when
    // it empties, so "no TIME on a Skull Kid seat" IS "TIME 0/5".
    //
    // The deck's OTHER declared counter, `MITIGATION`, is deliberately absent: it is
    // engine bookkeeping, non-zero only between the mitigation discards and the damage
    // inside a single strike run. This registry is OPT-IN — a counter with no row here
    // renders on neither surface — so its absence IS the suppression. Its live value is
    // surfaced in exactly one place where it is actionable: the mitigation prompt's own
    // running-total line (lib/pro/clockTower.ts).
    counter: "TIME",
    heroes: ["skull-kid"],
    outOf: 5,
    showAtZero: true,
    nameplate: { labelTemplate: "TIME {n}/{max}" },
    token: { icon: "⏳", title: "TIME", bg: "#2E0E4E", color: "#E7D6FF" },
  },
  {
    // Cecil Palmer's Broadcast dial (issue #668 ↔ engine #456). Engine counter key is
    // `BROADCAST` (`counters: [{ name: 'BROADCAST', max: 6 }]` in
    // cecil-palmer.rules.ts), earned 1 at a time whenever one of his fighters ends a
    // movement on a multi-zone space, and SPENT — automatically, at declare time —
    // to buy attack range.
    //
    // BOTH surfaces, per the Cairne lesson, and here the opponent's need is sharper
    // than usual: the dial is literally the radius of Cecil's threat. A player who
    // cannot see it cannot tell which of their fighters are safe, and the bought-range
    // highlight on their own screen would be the first they hear of it. So the pill
    // AND the token badge render on BOTH seats' plates.
    //
    // `outOf: 6` mirrors the declared max so both surfaces read "4/6" the way the rule
    // card's "You have 6 Broadcast tokens" does. NO `showAtZero`: this is an UP
    // counter starting empty, and "Cecil has no tokens" is the game's default state,
    // not an event — the default hide-at-0 is exactly right, and matches the wire
    // (the engine deletes a counter key when it empties, so 0 arrives as an absent
    // key either way).
    counter: "BROADCAST",
    heroes: ["cecil-palmer"],
    outOf: 6,
    nameplate: { labelTemplate: "BROADCAST {n}/{max}" },
    // Night Vale violet + the deck's own on-air motif, distinct from Skull Kid's
    // deeper Majora purple and from Nancy's plum.
    token: { icon: "📻", title: "BROADCAST", bg: "#653E7A", color: "#F6E8DD" },
  },
];

/** An entry's identity key — its counter name or its pile name. */
const sourceKey = (e: HeroStateCounter): string => e.counter ?? e.pile ?? "";

/**
 * The live value an entry renders: a `counters` int, or a `piles` pile's length.
 * A missing counter/pile (older server, or nothing tucked — the engine prunes an
 * emptied pile's key) reads 0, which hides both surfaces.
 */
const valueOf = (
  e: HeroStateCounter,
  counters: Record<string, number> | undefined,
  piles: Record<string, CardInstanceId[]> | undefined
): number =>
  e.pile ? piles?.[e.pile]?.length ?? 0 : counters?.[e.counter!] ?? 0;

/**
 * Does this entry render at value `n`? Every counter/pile is hidden at 0 — an empty
 * resource or untucked pile reads as no chip and no badge — EXCEPT one that sets
 * `showAtZero`, which is how a DOWN counter (Skull Kid's clock) keeps both surfaces
 * up at its most significant reading.
 *
 * There is no "is the key present?" refinement to make here: the engine DELETES a
 * counter key the moment it reaches 0 (engine/effects.ts `counter` op — "a zero result
 * drops the key, COUNTER reads default to 0"), so an empty clock and an absent one are
 * the same wire state by design. The `heroes` gate is what keeps the 0 reading off
 * every other deck's plate.
 */
const rendersAt = (e: HeroStateCounter, n: number): boolean => n > 0 || !!e.showAtZero;

const counterEntriesForHero = (heroId: string) =>
  HERO_STATE_COUNTERS.filter((e) => e.heroes.includes(heroId));

/**
 * Nameplate chips a hero's counters/piles contribute, in the SAME `{ chip, on }[]`
 * shape `flagChipsFor` returns — so ProHud renders both through one <FlagChip> map
 * with no branching. Each positive value yields one chip (`on: true`, label with
 * `{n}` filled); a value of 0/absent yields nothing (hidden at 0). The chip's
 * `flag` key is namespaced `counter:` / `pile:` so it never collides with a
 * boolean-flag glyph in FLAG_CHIP_ICONS (these render text-only, which is what we
 * want). A pile-sourced chip also carries `pile` + `cards`, which is what makes the
 * pill an inspection affordance — the zone is public, so this is filled for EITHER
 * seat's plate.
 */
export const counterChipsFor = (
  heroId: string,
  counters: Record<string, number> | undefined,
  piles?: Record<string, CardInstanceId[]>
): { chip: FlagHudChip; on: boolean }[] => {
  const chips: { chip: FlagHudChip; on: boolean }[] = [];
  for (const e of counterEntriesForHero(heroId)) {
    if (!e.nameplate) continue;
    const n = valueOf(e, counters, piles);
    if (!rendersAt(e, n)) continue; // hidden at 0 unless the entry opts in
    chips.push({
      chip: {
        flag: `${e.pile ? "pile" : "counter"}:${sourceKey(e)}`,
        onLabel: e.nameplate.labelTemplate
          .replace("{n}", String(n))
          .replace("{max}", String(e.outOf ?? "")),
        offLabel: "",
        ...(e.pile ? { pile: e.pile, cards: [...(piles?.[e.pile] ?? [])] } : {}),
      },
      on: true,
    });
  }
  return chips;
};

/**
 * The token corner badge a hero's counters/piles contribute, or null. First
 * positive entry wins (registry order); a value of 0/absent contributes nothing
 * (hidden at 0). Reuses FlagTokenBadge so it drops straight into ProBoard's
 * existing `fighterTokenBadge` path — the numeric value is the badge `label`, and
 * `showLabel` draws it on the token beside the icon so the live count reads off
 * the BOARD, not just the tooltip.
 */
export const fighterTokenCounterBadgeFor = (
  heroId: string | undefined,
  counters: Record<string, number> | undefined,
  piles?: Record<string, CardInstanceId[]>
): FlagTokenBadge | null => {
  if (!heroId) return null;
  for (const e of counterEntriesForHero(heroId)) {
    if (!e.token) continue;
    const n = valueOf(e, counters, piles);
    if (!rendersAt(e, n)) continue; // hidden at 0 unless the entry opts in
    const reading = e.outOf == null ? String(n) : `${n}/${e.outOf}`;
    return {
      icon: e.token.icon,
      label: reading,
      title: `${e.token.title}: ${reading}`,
      bg: e.token.bg,
      color: e.token.color,
      showLabel: true,
    };
  }
  return null;
};

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
  /** set-aside pile this chip counts (protocol v25) — present ONLY for
   *  pile-sourced chips. Its presence is what turns the pill into a clickable
   *  inspection affordance; `cards` are the tucked instances to show. */
  pile?: string;
  cards?: CardInstanceId[];
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
 *
 * The corner badge merges both state families: a flag-driven badge (tide / druid
 * form) wins; otherwise a counter/pile-driven badge (Nancy's CLUE, Luke's TRAINING
 * pile) fills it. A hero today drives only one, so the precedence is academic —
 * but it keeps the single badge slot deterministic if a future hero ever declares
 * both.
 */
export const fighterTokenStateByOwner = (
  players: Array<{
    id: PlayerId;
    heroId: string;
    flags?: Record<string, boolean>;
    counters?: Record<string, number>;
    /** v25 set-aside piles; absent on older servers / an untucked seat. */
    piles?: Record<string, CardInstanceId[]>;
  }>
): Partial<Record<PlayerId, FighterTokenState>> =>
  Object.fromEntries(
    players
      .map((p) => {
        const flagState = fighterTokenStateFor(p.heroId, p.flags);
        const badge =
          flagState.badge ??
          fighterTokenCounterBadgeFor(p.heroId, p.counters, p.piles);
        return [p.id, { badge, heroArtUrl: flagState.heroArtUrl }] as const;
      })
      .filter(([, st]) => st.badge || st.heroArtUrl)
  );
