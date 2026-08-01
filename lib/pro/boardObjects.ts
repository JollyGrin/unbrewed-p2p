/**
 * Board-object presentation registry (issue #553, protocol v26). The object-scoped
 * parallel to FIGHTER_STATUS_BADGES: it maps a mechanical, engine-stable
 * `ViewToken.kind` (see protocol.ts `ViewTokenKind`) to how that object draws on
 * the board and reads in the log.
 *
 * Why a SEPARATE registry from FIGHTER_STATUS_BADGES / HERO_STATE_FLAGS:
 *  - HERO_STATE_FLAGS is per-PLAYER (reads PlayerView.flags, can swap the hero's own
 *    portrait/nameplate); FIGHTER_STATUS_BADGES is per-FIGHTER (rides
 *    ViewFighter.statuses, rim badges on a living token).
 *  - A board object is NEITHER. It is a positioned non-fighter entity in
 *    `PlayerView.tokens` with its own lifecycle — no hp, no statuses, no owner
 *    nameplate. Before v26 there was exactly one kind ('totem') so ProBoard hardcoded
 *    a diamond; now the union grows (corpse today; walls/traps/decoys tomorrow) and
 *    each new kind must be ONE entry here, not another branch in ProBoard.
 *
 * DEGRADE-GRACEFULLY RULE, and the reason this differs from `fighterStatusBadgesFor`
 * (which drops an unknown status kind): the protocol says a client that does not know
 * a kind "should still render SOMETHING at `space`". An unmapped kind therefore falls
 * back to `UNKNOWN_OBJECT` rather than vanishing — an object silently missing from the
 * board is a rules-misleading render, whereas an unlabelled marker is merely plain.
 */
import { ViewToken } from "./protocol";

/** How one board-object kind draws + reads. */
export interface BoardObjectVisual {
  /** the `ViewToken.kind` this presentation renders. */
  kind: string;
  /** Display noun, capitalized — tooltips and hints. */
  label: string;
  /** Lowercase noun for log lines ("placed a totem", "corpse rotted away"). */
  noun: string;
  /**
   * Token silhouette. `diamond` is the pre-v26 totem sprite (a rotated square);
   * `disc` is a fighter-shaped circle, used by objects that WERE a fighter.
   */
  shape: "diamond" | "disc";
  /**
   * Draw the object as a dead thing: desaturated art, upside-down, dimmed border.
   * A corpse must never read as a living token that happens to be greyed out.
   */
  muted: boolean;
  /** Fallback glyph when no origin art resolves. */
  glyph: string;
}

/**
 * The registry, keyed by `ViewToken.kind`.
 *
 * - totem (Thrall): unchanged from the pre-v26 hardcoded sprite — an owner-colored
 *   diamond. Permanent (no `ownerTurnsRemaining`), so it never draws pips.
 * - corpse (Gerry the Isopod): a defeated Larry's body, left on the board for three
 *   of its owner's turns. Drawn as a MUTED DISC so it reads as the fighter it was
 *   (see `boardObjectArt` in ProBoard — the `origin` fighter's token art, greyed and
 *   flipped) rather than as a card-placed marker, and it carries countdown pips.
 */
export const BOARD_OBJECT_VISUALS: Record<string, BoardObjectVisual> = {
  totem: {
    kind: "totem",
    label: "Totem",
    noun: "totem",
    shape: "diamond",
    muted: false,
    glyph: "",
  },
  corpse: {
    kind: "corpse",
    label: "Corpse",
    noun: "corpse",
    shape: "disc",
    muted: true,
    glyph: "☠",
  },
};

/** Presentation for a kind this client does not map yet — visible, honestly unlabelled. */
export const UNKNOWN_OBJECT: BoardObjectVisual = {
  kind: "unknown",
  label: "Board object",
  noun: "board object",
  shape: "diamond",
  muted: false,
  glyph: "?",
};

/** Never returns undefined — an unmapped kind still renders (see the file header). */
export const boardObjectVisualFor = (token: Pick<ViewToken, "kind">): BoardObjectVisual =>
  BOARD_OBJECT_VISUALS[token.kind] ?? UNKNOWN_OBJECT;

/** Countdown-lifecycle readout for one object. */
export interface BoardObjectCountdown {
  /** Owner turns left, straight off the wire. */
  remaining: number;
  /** Filled pips to draw. */
  pips: number;
  /**
   * `remaining === 0` — the object disappears at the START of the owner's next turn.
   * Zero pips would read as "permanent", so the caller draws a distinct last-gasp
   * marker instead.
   */
  expiring: boolean;
}

/**
 * Countdown for an object, or null when it is PERMANENT. Per protocol v26,
 * `ownerTurnsRemaining` ABSENT means permanent (every totem) — which is NOT the same
 * as 0, and conflating the two would show a totem as about to vanish.
 */
export const boardObjectCountdown = (
  token: Pick<ViewToken, "ownerTurnsRemaining">
): BoardObjectCountdown | null => {
  const remaining = token.ownerTurnsRemaining;
  if (remaining === undefined || remaining === null) return null;
  return { remaining, pips: Math.max(0, remaining), expiring: remaining <= 0 };
};

/**
 * The fighter this object came FROM, or null. Provenance rides as the opaque display
 * string `"<kind>-of:<fighterId>"` (protocol v26 `ViewToken.origin`); a fighter id can
 * itself contain ':' , so only the FIRST separator is split on. Absent for card-placed
 * objects, and an origin whose fighter the viewer cannot resolve just yields art-less
 * fallback rendering.
 */
export const boardObjectOriginFighter = (token: Pick<ViewToken, "origin">): string | null => {
  const origin = token.origin;
  if (!origin) return null;
  const at = origin.indexOf(":");
  const id = at < 0 ? "" : origin.slice(at + 1).trim();
  return id.length > 0 ? id : null;
};

/**
 * Number any labels that repeat within one option list, so two prompt buttons never
 * read as the same button. This exists because of the v26 sharing rule: two corpses
 * on ONE space, spawned on the same turn from same-named sidekicks, describe
 * themselves identically ("Corpse of Larry at a3 · 3 turns left") — which is TRUE
 * (destroying either does the same thing) but reads as a broken UI.
 *
 * Options whose label is already unique are returned untouched, so this is inert for
 * every prompt that has no collision — which is all of them outside this deck.
 */
export const disambiguateLabels = <T extends { label: string }>(options: T[]): T[] => {
  const counts = new Map<string, number>();
  for (const o of options) counts.set(o.label, (counts.get(o.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return options.map((o) => {
    if ((counts.get(o.label) ?? 0) < 2) return o;
    const n = (seen.get(o.label) ?? 0) + 1;
    seen.set(o.label, n);
    return { ...o, label: `${o.label} (${n})` };
  });
};

/**
 * Hover title for an object's board sprite. `ownerLabel` is the caller's seat wording
 * ("You" / "Opponent" / a seat name) and `originName` the display name of the fighter
 * it came from, when the caller could resolve one.
 */
export const boardObjectTitle = (
  token: Pick<ViewToken, "kind" | "ownerTurnsRemaining" | "origin">,
  ownerLabel: string,
  originName?: string | null
): string => {
  const visual = boardObjectVisualFor(token);
  const head = originName
    ? `${visual.label} of ${originName} (${ownerLabel})`
    : `${visual.label} (${ownerLabel})`;
  const countdown = boardObjectCountdown(token);
  if (!countdown) return head;
  const tail = countdown.expiring
    ? "removed at the start of its owner's next turn"
    : `${countdown.remaining} owner turn${countdown.remaining === 1 ? "" : "s"} left`;
  return `${head} — ${tail}`;
};
