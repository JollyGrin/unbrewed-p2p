/**
 * Per-fighter status-effect registry (issue #371; markers added in #596 ↔ engine
 * #360). The fighter-scoped parallel to HERO_STATE_FLAGS: it maps a mechanical,
 * engine-stable `ViewFighter.statuses` entry (see protocol.ts `FighterStatus`) to
 * its rim-badge presentation on the board token.
 *
 * Why a SEPARATE registry from HERO_STATE_FLAGS:
 *  - HERO_STATE_FLAGS is per-PLAYER / per-HERO — it reads PlayerView.flags and can
 *    swap the hero's OWN portrait + nameplate (tide, druid form). Those states
 *    only ever describe the controller's own hero.
 *  - Fighter statuses are per-FIGHTER: any hero, can land on a SIDEKICK, and are
 *    typically inflicted by the OPPONENT (roots, marks). They ride on
 *    `ViewFighter.statuses`, so they get their own registry — never folded into the
 *    hero-flag model.
 *
 * TWO KEYINGS, because the protocol has two shapes here:
 *  - by `kind` — a status whose kind IS the effect ('PINNED').
 *  - by `name` — a `kind: 'MARKED'` entry (protocol v29), where the kind says only
 *    "this is a durable per-fighter marker" and `name` says WHICH marker
 *    ('MERIDIAN', 'REVENGE', …), with `count` stacks. The engine emits one entry per
 *    distinct name, sorted by name.
 *
 * Adding a new status kind or marker name is ONE entry here — ProBoard maps every
 * `ViewFighter.statuses` entry through `fighterStatusBadgesFor` generically.
 */
import type { FighterId, GameEvent, PlayerId, PlayerView, ViewPrompt, ViewFighter, ViewSecretMark } from "./protocol";

/** Board-token rim badge presentation for one status (icon + label + colors). */
export interface FighterStatusBadge {
  /** the `ViewFighter.statuses` `kind` this presentation renders. */
  kind: string;
  /** stable per-badge key — `kind`, or `MARKED:<name>` for a marker. One fighter can
   *  carry several markers at once, so the kind alone is not unique as a React key. */
  key: string;
  icon: string;
  label: string;
  title: string;
  bg: string;
  color: string;
  /** stacks, for a marker that has more than one. Drawn beside the icon so the depth
   *  reads off the BOARD; absent/1 renders the icon alone (a lone mark needs no "1"). */
  count?: number;
}

/** Client-only status kinds for a v38 secret mark (see the registry rows). */
export const SECRET_MARK_KIND = "SECRET_MARK";
export const OPEN_SECRET_MARK_KIND = "SECRET_MARK_OPEN";
/** A hidden mark on a hands-visible TEAMMATE's fighter (2v2): same badge, teammate copy. */
export const TEAM_SECRET_MARK_KIND = "SECRET_MARK_TEAM";

/**
 * Kind-keyed registry — statuses whose `kind` fully identifies the effect.
 *
 * - PINNED (engine `pin` op — Malfurion's Entangling Roots, Thrall's earthbind
 *   totem): a "Rooted" rim badge. Deliberately a CHAIN glyph on a cold slate
 *   palette — NOT a green vine — so it never reads as one of Malfurion's green
 *   druid-form badges (🐾/☾/✦ on brown/blue/green over in HERO_STATE_FLAGS): this
 *   badge can land on the very hero token those forms decorate, so the two palettes
 *   are kept visibly apart.
 *
 * `MARKED` is deliberately ABSENT here — it is dispatched by marker name below.
 */
export const FIGHTER_STATUS_BADGES: Record<string, FighterStatusBadge> = {
  PINNED: {
    kind: "PINNED",
    key: "PINNED",
    icon: "⛓",
    label: "Rooted",
    title: "Rooted — pinned in place, cannot move",
    bg: "#3A4A55",
    color: "#DCEBF2",
  },
  // Protocol v38 SECRET FIGHTER MARKS (issue #1453 ↔ engine #918; the Xenomorph's
  // Marked Blip). CLIENT-ONLY kinds: the engine never puts a secret mark on
  // `ViewFighter.statuses` (fighters are public) — it sends `marks?` on the seat
  // views, already redacted per viewer, and `withSecretMarkStatuses` below folds
  // what THIS viewer may see onto the bearer as one of these two kinds. So the
  // badge is private exactly as far as the engine's redaction is: the owner's
  // view carries the hidden mark, every other view carries only `open` ones.
  [SECRET_MARK_KIND]: {
    kind: SECRET_MARK_KIND,
    key: SECRET_MARK_KIND,
    icon: "◉",
    label: "Marked",
    title: "Marked — secret: only you can see which of your fighters bears it",
    bg: "#14301F",
    color: "#C9F2D5",
  },
  [TEAM_SECRET_MARK_KIND]: {
    kind: TEAM_SECRET_MARK_KIND,
    key: TEAM_SECRET_MARK_KIND,
    icon: "◉",
    label: "Marked",
    title: "Marked — your teammate's Marked Blip — only your team can see it",
    bg: "#14301F",
    color: "#C9F2D5",
  },
  [OPEN_SECRET_MARK_KIND]: {
    kind: OPEN_SECRET_MARK_KIND,
    key: OPEN_SECRET_MARK_KIND,
    icon: "◉",
    label: "Marked",
    title: "Marked — revealed: every seat can see this fighter bears it",
    bg: "#6B1E14",
    color: "#FDE5DF",
  },
};

/** Presentation for one durable marker NAME (`kind: 'MARKED'`, protocol v29). */
export interface FighterMarkerBadge {
  icon: string;
  label: string;
  /** `{n}` is substituted with the live stack count. */
  titleTemplate: string;
  bg: string;
  color: string;
}

/**
 * Name-keyed registry for `kind: 'MARKED'` statuses (engine #360).
 *
 * - MERIDIAN (Kenshiro, issue #596 ↔ engine #362): his "708 Meridian hidden
 *   channeling points" ability marks an OPPOSING fighter that took combat damage
 *   from a HOKUTO card, and every marked fighter takes 1 damage at the end of his
 *   turn. The mark is inflicted by the opponent and can land on a SIDEKICK, which is
 *   exactly why it is fighter-keyed and not a hero flag (per-player `counter`/
 *   `setFlag` cannot say WHICH fighter is marked — the gap engine #360 exists to
 *   close, and the Cairne RAGE lesson in registry form).
 *
 *   Hokuto crimson, deliberately the SAME family as the HUNDRED-FIST counter badge
 *   (heroStateFlags) and deliberately NOT the cold slate of PINNED: the two can sit
 *   on the same token, and a player must be able to tell "rooted" from "about to
 *   take the Meridian tick" at a glance.
 */
export const FIGHTER_MARKER_BADGES: Record<string, FighterMarkerBadge> = {
  MERIDIAN: {
    icon: "✷",
    label: "Meridian",
    titleTemplate: "Meridian ×{n} — takes {n} damage at the end of Kenshiro's turn",
    bg: "#8C1C24",
    color: "#FDE9E4",
  },
  // Superman's *Unchained* (5zMj): a transient per-turn mark (`until: TURN_END`) on each
  // fighter he damaged, so the follow-up move prompt can offer them. Not a counter/flag.
  UNCHAINED: {
    icon: "⛓",
    label: "Unchained",
    titleTemplate: "Unchained — may be moved up to 1 space (Superman, this turn)",
    bg: "#1F5F7A",
    color: "#E3F4FB",
  },
  // Cloud Strife's Omnislash target (gate0 §1 row 5): `markFighter OMNI_TARGET until
  // TURN_END` on the opposing fighter the card named; Cloud's restricted PLACE lands
  // adjacent to it. Rides `FIGHTER_MARKED` like MERIDIAN. P1 re-verifies the key.
  OMNI_TARGET: {
    icon: "⚔",
    label: "Omnislash target",
    titleTemplate: "Omnislash target — Cloud may place adjacent to this fighter (this turn)",
    bg: "#1F3F73",
    color: "#E6EEFB",
  },
};

/**
 * Fallback for a marker name this client does not know — a NEWER engine deck's
 * marker. The protocol's own instruction (v29 note on `FighterStatus.name`): "a name
 * it does not know should still render a generic mark with the count". Rendering
 * nothing would silently hide live, public, rules-relevant state; rendering the raw
 * name in a tooltip is honest and degrades gracefully.
 */
const genericMarkerBadge = (name: string): FighterMarkerBadge => ({
  icon: "◈",
  label: name,
  titleTemplate: `${name} ×{n}`,
  bg: "#4A3B57",
  color: "#F1EAF7",
});

/**
 * The rim badges to render for one fighter, in `ViewFighter.statuses` order. Pure +
 * generic: a status whose `kind` is in the kind registry yields its badge; a
 * `kind: 'MARKED'` entry is dispatched on `name` through the marker registry (with a
 * generic fallback, so an unknown marker still shows); any other unknown kind is
 * silently skipped so an older client degrades gracefully. A fighter with no
 * statuses gets []. The badge is present exactly while the status is in `statuses`,
 * so it clears the instant the engine drops it (pin expiry, turn-edge marker sweep,
 * an explicit clear, or the fighter's defeat — which clears markers engine-side).
 */
export const fighterStatusBadgesFor = (
  fighter: Pick<ViewFighter, "statuses">
): FighterStatusBadge[] =>
  (fighter.statuses ?? [])
    .map((s): FighterStatusBadge | null => {
      if (s.kind !== "MARKED") return FIGHTER_STATUS_BADGES[s.kind] ?? null;
      // A MARKED entry with no name is malformed (the engine always sets one); treat
      // it as an unknown marker rather than dropping the fact on the floor.
      const name = s.name ?? "MARK";
      const badge = FIGHTER_MARKER_BADGES[name] ?? genericMarkerBadge(name);
      const count = s.count ?? 1;
      return {
        kind: "MARKED",
        key: `MARKED:${name}`,
        icon: badge.icon,
        label: badge.label,
        title: badge.titleTemplate.replace(/\{n\}/g, String(count)),
        bg: badge.bg,
        color: badge.color,
        count,
      };
    })
    .filter((b): b is FighterStatusBadge => !!b);

/**
 * Every v38 secret mark this viewer may see (issue #1453): its own seat's
 * `self.marks` plus whatever `players[].marks` carries (open marks of other seats,
 * a hands-visible teammate's). The engine's `redactFor` already decided what each
 * view holds, so this only unions and de-duplicates — it never infers a mark.
 */
export const visibleSecretMarks = (
  view: Pick<PlayerView, "self" | "players">
): ViewSecretMark[] => {
  const seen = new Map<string, ViewSecretMark>();
  for (const m of [...(view.self.marks ?? []), ...view.players.flatMap((p) => p.marks ?? [])]) {
    const key = `${m.name}:${m.fighter}`;
    // an open copy wins over a hidden one of the same mark
    if (!seen.has(key) || m.open) seen.set(key, m);
  }
  return [...seen.values()];
};

/** The fighters this viewer sees a secret mark on (the HUD sidekick rows). */
export const secretMarkedFighterIds = (view: Pick<PlayerView, "self" | "players">): Set<FighterId> =>
  new Set(visibleSecretMarks(view).map((m) => m.fighter));

/**
 * Folds the viewer's visible secret marks onto their bearers as a client-only
 * status, so the board (2D + 3D) badges them through `fighterStatusBadgesFor` with
 * no component change. Returns `fighters` itself when there is nothing to fold —
 * every deck without marks keeps its identity-stable array. Pass `you` so a hidden
 * mark on a teammate's fighter gets the teammate tooltip; omitted = owner copy.
 */
export const withSecretMarkStatuses = (
  fighters: ViewFighter[],
  marks: ViewSecretMark[],
  you?: PlayerId
): ViewFighter[] => {
  if (marks.length === 0) return fighters;
  return fighters.map((f) => {
    const mine = marks.filter((m) => m.fighter === f.id);
    if (mine.length === 0) return f;
    return {
      ...f,
      statuses: [
        ...(f.statuses ?? []),
        ...mine.map((m) => ({
          kind: m.open ? OPEN_SECRET_MARK_KIND : you && f.owner !== you ? TEAM_SECRET_MARK_KIND : SECRET_MARK_KIND,
          name: m.name,
        })),
      ],
    };
  });
};

/**
 * Client label for a v38 secret mark NAME (the engine's own string). The Xenomorph's
 * `MARK` is "the Marked Blip"; any future deck's name falls back to Title Case
 * ("SHADOW_TAG" → "Shadow Tag").
 */
const SECRET_MARK_LABELS: Record<string, string> = { MARK: "the Marked Blip" };
export const secretMarkLabel = (name: string): string =>
  SECRET_MARK_LABELS[name] ??
  name
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const SECRET_MARK_PROMPT = /^(Secretly choose the fighter that bears )(.+)$/;
/** Swaps the raw mark name in the engine's `assignSecretMark` prompt description for its label. */
export const secretMarkPromptDescription = (description: string | undefined): string | undefined => {
  const m = description?.match(SECRET_MARK_PROMPT);
  return m ? `${m[1]}${secretMarkLabel(m[2])}` : description;
};

/**
 * Caption for the Xenomorph's reveal placement. `ViewPrompt.source` does not name the
 * trigger (it names the card whose effect killed the Blip, e.g. Thorns), so the cue is
 * the batch itself: the last event before the prompt is SECRET_MARK_REVEALED for the
 * prompted player. null = keep the usual "Effect of <card>" attribution.
 */
export const emergenceCaption = (
  prompt: Pick<ViewPrompt, "kind" | "player"> | null | undefined,
  events: readonly GameEvent[] | undefined
): string | null => {
  const last = events?.[events.length - 1];
  return prompt?.kind === "CHOOSE_SPACE" && last?.type === "SECRET_MARK_REVEALED" && last.player === prompt.player
    ? "The Xenomorph emerges — choose its space"
    : null;
};
