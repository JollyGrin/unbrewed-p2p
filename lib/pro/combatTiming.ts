/**
 * ONE place for the combat sequence's clock (issue #517, part of the #379
 * battle-sequence epic / #382 pacing).
 *
 * Two modules used to hold halves of the same timeline and drift apart: the damage
 * projectile's launch/flight live in `useGameFx.ts`, while the panel's linger and the
 * strike pose live in `combatStrike.ts`. When the linger TTL fell short of
 * launch + flight + the token-side beat, the combat panel unmounted mid-arc — you saw
 * a damage number flying out of nothing, with no cards left to explain it.
 *
 * So the linger is DERIVED, never hand-tuned: it is exactly the arc's whole life plus
 * the beat it lands on plus a settle dwell. Retune any leg below and the panel
 * automatically stays up long enough; `combatTiming.test.ts` fails if the invariant is
 * ever broken by hand.
 */

/** When the damage projectile leaves the panel — after the strike lands (~1.1s) and
 *  the comparison beat has begun pulsing, so the number departs AFTER the winning
 *  value glows rather than on top of the slam. */
export const ARC_LAUNCH_MS = 1900;

/** How long the projectile is in the air, panel clash point → defender token. */
export const ARC_FLIGHT_MS = 620;

/** The token-side damage beat: the `−N` pops, rings and holds legible. The board FX
 *  item lives ~1.5s total (`fxFloat` in ProBoard), but its last stretch is a drift-up
 *  fade — the cards only need to outlive the readable peak (pop through ~50%). */
export const DAMAGE_BEAT_MS = 750;

/** The settled dwell AFTER the beat: values pulsed, damage landed, both faces still
 *  on screen — so the resolved combat reads as a finished sentence before the panel
 *  unmounts, instead of being yanked on the last frame of the animation (#382). */
export const SETTLE_DWELL_MS = 450;

/**
 * How long a frozen combat lingers after `view.combat` clears (ms). Derived, not
 * chosen: the arc's full flight plus the beat it triggers plus the dwell. This is the
 * acceptance invariant of #517 — the card faces provably outlive the damage arc
 * landing and the token damage beat.
 */
export const LINGER_TTL_MS =
  ARC_LAUNCH_MS + ARC_FLIGHT_MS + DAMAGE_BEAT_MS + SETTLE_DWELL_MS;

/** Slack between the strike pose clearing and the panel unmounting. Small and
 *  positive so the defense card's held knocked/dimmed pose is still applied on the
 *  panel's final frame — it disappears rather than snapping back to rest. */
export const STRIKE_POSE_SLACK_MS = 120;

/** How long the strike descriptor stays live (ms) — kept just PAST the linger. */
export const STRIKE_TTL_MS = LINGER_TTL_MS + STRIKE_POSE_SLACK_MS;
