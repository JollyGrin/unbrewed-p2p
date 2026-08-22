/**
 * Atomic position swaps (protocol v31 ↔ engine #445, DSL v0.46.0).
 *
 * `POSITIONS_SWAPPED { a, b, aTo, bTo }` says two fighters exchanged spaces in
 * one beat. It is a TELEPORT, not movement: no path, nothing "moved through",
 * and NO accompanying `FIGHTER_MOVED` — so it is the only record of the
 * exchange, and every client channel that reads a space change as a WALK has to
 * be told otherwise:
 *
 *  - `moveTween.ts` would otherwise glide the opponent's fighter along a
 *    straight two-node route, which reads as an ordinary walk (it filters on
 *    `swappedFighters`).
 *  - `gameLog.ts` would otherwise print two unrelated "X moved" lines instead of
 *    the one line that explains them ("X and Y swapped places").
 *
 * The board still has to SHOW something — both figures are simply somewhere else
 * in the next `PlayerView` — so this module also derives the beat it plays: a
 * crossfade in place of a path tween (`PendingSwap`, consumed by ProBoard and
 * driven by `usePositionSwaps.ts`). Presentation only, sibling to
 * combatFx/moveTween/tokenLife: nothing here feeds back into play.
 *
 * Kept free of React and of the board component on purpose — `gameLog.ts` reads
 * `swappedFighters` and stays a pure, dependency-light module. The hook lives
 * next door in `usePositionSwaps.ts`.
 *
 * `aTo`/`bTo` are LANDING poses and may be TWO spaces for a LARGE body; the
 * `from` pose handed to the board is read off the PREVIOUS view instead, which
 * covers head and tail with one rule and needs no size special-casing.
 */
import { FighterId, GameEvent, PlayerView, SpaceId } from "./protocol";

// Duration of the swap crossfade. Deliberately NOT a multiple of the move
// tween's per-hop step: a swap is not made of hops.
export const SWAP_SECONDS = 0.45;
/** Keyframe stops of that crossfade: fade out, jump (invisible), fade back in. */
export const SWAP_TIMES = [0, 0.45, 0.55, 1];

/** An atomic `POSITIONS_SWAPPED`: this fighter exchanged spaces with another
 * one, with NO route between them. `from` is the head pose it held BEFORE the
 * swap (`fromTail` the trailing space of a LARGE body, null for NORMAL); the
 * token is already drawn at its LANDING space, so the board only needs where it
 * came from to play the crossfade back-to-front. `key` is a monotonic trigger id
 * so a second swap of the same fighter replays the beat. */
export interface PendingSwap {
  fighterId: FighterId;
  from: SpaceId;
  fromTail?: SpaceId | null;
  key: number;
}

/** A swap beat before the hook stamps it with a monotonic key. */
export type RawSwap = Omit<PendingSwap, "key">;

/**
 * Every fighter named by a `POSITIONS_SWAPPED` this batch. A pre-v31 server (or
 * any batch without one) yields an empty set, so callers that filter on it stay
 * byte-identical to their pre-v31 behaviour.
 */
export function swappedFighters(events: GameEvent[]): Set<FighterId> {
  const out = new Set<FighterId>();
  for (const e of events) {
    if (e.type === "POSITIONS_SWAPPED") {
      out.add(e.a);
      out.add(e.b);
    }
  }
  return out;
}

/**
 * Diff consecutive views into the swap beats to play. Pure and view-derived
 * (mirrors diffViews/diffIncomingMove/diffCombatCallouts): the first snapshot is
 * a state dump, not a play, so it stays silent, and a fighter that did not
 * actually change space (a replayed batch, a swap the view already showed) is
 * dropped rather than blinking for nothing.
 *
 * BOTH seats' fighters are included — unlike the incoming-move tween, a swap is
 * never a move the viewer committed optimistically, so there is no local path to
 * double-drive.
 */
export function diffPositionSwaps(
  prev: PlayerView | null,
  next: PlayerView,
  events: GameEvent[]
): RawSwap[] {
  if (!prev) return [];
  const swapped = swappedFighters(events);
  if (swapped.size === 0) return [];
  const before = new Map(prev.fighters.map((f) => [f.id, f]));
  const out: RawSwap[] = [];
  for (const f of next.fighters) {
    if (!swapped.has(f.id) || !f.space) continue;
    const was = before.get(f.id);
    if (!was?.space || was.space === f.space) continue;
    out.push({ fighterId: f.id, from: was.space, fromTail: was.tailSpace ?? null });
  }
  return out;
}
