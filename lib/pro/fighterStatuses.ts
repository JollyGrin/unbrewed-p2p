/**
 * Per-fighter status-effect registry (issue #371). The fighter-scoped parallel to
 * HERO_STATE_FLAGS: it maps a mechanical, engine-stable `ViewFighter.statuses`
 * `kind` (see protocol.ts `FighterStatus` — 'PINNED' today) to its rim-badge
 * presentation on the board token.
 *
 * Why a SEPARATE registry from HERO_STATE_FLAGS:
 *  - HERO_STATE_FLAGS is per-PLAYER / per-HERO — it reads PlayerView.flags and can
 *    swap the hero's OWN portrait + nameplate (tide, druid form). Those states
 *    only ever describe the controller's own hero.
 *  - Fighter statuses are per-FIGHTER: any hero, can land on a SIDEKICK, and are
 *    typically inflicted by the OPPONENT (roots today; poison/snare/marks/buffs
 *    tomorrow). They ride on `ViewFighter.statuses`, keyed by `kind`, so they get
 *    their own registry keyed the same way — never folded into the hero-flag model.
 *
 * Adding a new status kind is ONE entry here — no ProBoard change (ProBoard maps
 * every `ViewFighter.statuses` entry through this registry generically).
 */
import { ViewFighter } from "./protocol";

/** Board-token rim badge presentation for one status kind (icon + label + colors). */
export interface FighterStatusBadge {
  /** the `ViewFighter.statuses` `kind` this presentation renders. */
  kind: string;
  icon: string;
  label: string;
  title: string;
  bg: string;
  color: string;
}

/**
 * The registry, keyed by `FighterStatus.kind`.
 *
 * - PINNED (engine `pin` op — Malfurion's Entangling Roots, Thrall's earthbind
 *   totem): a "Rooted" rim badge. Deliberately a CHAIN glyph on a cold slate
 *   palette — NOT a green vine — so it never reads as one of Malfurion's green
 *   druid-form badges (🐾/☾/✦ on brown/blue/green over in HERO_STATE_FLAGS): this
 *   badge can land on the very hero token those forms decorate, so the two palettes
 *   are kept visibly apart.
 */
export const FIGHTER_STATUS_BADGES: Record<string, FighterStatusBadge> = {
  PINNED: {
    kind: "PINNED",
    icon: "⛓",
    label: "Rooted",
    title: "Rooted — pinned in place, cannot move",
    bg: "#3A4A55",
    color: "#DCEBF2",
  },
};

/**
 * The rim badges to render for one fighter, in `ViewFighter.statuses` order. Pure +
 * generic: every status whose `kind` is in the registry yields its badge; an
 * unknown kind (a newer engine effect this client doesn't map yet) is silently
 * skipped so an older client degrades gracefully. A fighter with no statuses
 * gets []. The badge is present exactly while the status is in `statuses`, so it
 * clears the instant the engine drops the status (pin expiry / unpin).
 */
export const fighterStatusBadgesFor = (
  fighter: Pick<ViewFighter, "statuses">
): FighterStatusBadge[] =>
  (fighter.statuses ?? [])
    .map((s) => FIGHTER_STATUS_BADGES[s.kind])
    .filter((b): b is FighterStatusBadge => !!b);
