/**
 * God-view render adapter (#122). The live game renders one REDACTED PlayerView
 * (your secrets full, the opponent's stripped to counts). A replay has nothing to
 * hide, so the server ships a ReplayStep with BOTH players face-up. This adapter
 * folds one step back into the exact `PlayerView` shape the existing
 * ProBoard / ProHud / ProHand already consume — so the replay viewer reuses the
 * live table components unchanged, just fed a full-information view.
 *
 * `focus` chooses whose seat is "self" (bottom of the table); the other seat is
 * mapped into `opponent`. Because a replay reveals everything, `opponentHand()`
 * exposes the other seat's actual hand too (the live view never could), so the
 * viewer can fan BOTH hands face-up.
 */
import type {
  CardInstanceId,
  PlayerId,
  PlayerView,
  ReplayExpansion,
  ReplayStep,
  ViewPlayer,
} from "./protocol";
import { RUNTIME_PLAYER_IDS } from "./replayHeroes";

/** Runtime-ordered seat ids present in a step (duel → [p1,p2]; ffa-3 → [p1,p2,p3]). */
export function seatIds(step: ReplayStep): PlayerId[] {
  return RUNTIME_PLAYER_IDS.filter((id) => !!step.players[id]);
}

/** The primary opponent seat for a focus — the first non-focus seat in runtime order
 * (matches the server's duel-compat `opponent` alias). null in a solo/degenerate step. */
function firstOpponent(step: ReplayStep, focus: PlayerId): PlayerId | null {
  return seatIds(step).find((id) => id !== focus) ?? null;
}

function requireStepPlayer(step: ReplayStep, player: PlayerId) {
  const entry = step.players[player];
  if (!entry) throw new Error(`Replay step is missing player ${player}`);
  return entry;
}

/**
 * Build a full-information PlayerView for `focus` from a replay step + the hoisted
 * map/catalog. Board (fighters/tokens/combat) is shared; hands/decks/discards come
 * from the step's per-player blobs.
 */
export function toPlayerView(
  step: ReplayStep,
  exp: Pick<ReplayExpansion, "map" | "catalog">,
  focus: PlayerId,
): PlayerView {
  const ids = seatIds(step);
  const me = requireStepPlayer(step, focus);
  const oppId = firstOpponent(step, focus);
  const opp = oppId ? requireStepPlayer(step, oppId) : null;
  // Every seat in runtime order — ProHud renders one plate per entry, so an
  // ffa-3/team-2v2 replay shows all seats. Non-self seats carry counts only
  // (the plate never fans a non-local hand), matching the live redacted view.
  const players: ViewPlayer[] = ids.map((id) => {
    const p = requireStepPlayer(step, id);
    const isSelf = id === focus;
    return {
      id,
      heroId: p.heroId,
      you: isSelf,
      ...(isSelf ? { hand: p.hand, committedCard: p.committedCard } : {}),
      handCount: p.hand.length,
      deckCount: p.deckCount,
      discard: p.discard,
      hasCommitted: p.committedCard !== null,
      counters: p.counters,
      // Replay bundles predate v16 `flags`; god-view synthesizes an empty map
      // (no active flags) since replay/god-view tide surfacing is a follow-up.
      flags: {},
      // Carry the seat's team through so ProHud's deriveTeams sees a real team
      // format when scrubbing a 2v2 replay (ALLY chips etc.). Live play is
      // unaffected (uses the server view). (#211)
      team: p.team ?? id,
    };
  });
  return {
    you: focus,
    phase: step.phase,
    turnNumber: step.turnNumber,
    activePlayer: step.activePlayer,
    actionsRemaining: step.actionsRemaining,
    turnPhase: step.turnPhase,
    maneuver: step.maneuver,
    map: exp.map,
    catalog: exp.catalog,
    fighters: step.fighters,
    tokens: step.tokens,
    encounter: null,
    self: {
      id: focus,
      heroId: me.heroId,
      hand: me.hand,
      deckCount: me.deckCount,
      discard: me.discard,
      committedCard: me.committedCard,
      counters: me.counters,
      flags: {},
    },
    opponent:
      opp && oppId
        ? {
            id: oppId,
            heroId: opp.heroId,
            handCount: opp.hand.length,
            deckCount: opp.deckCount,
            discard: opp.discard,
            hasCommitted: opp.committedCard !== null,
            counters: opp.counters,
            flags: {},
          }
        : null,
    players,
    combat: step.combat,
    prompt: step.prompt,
    winner: step.winner,
  };
}

/** The primary opponent seat's actual hand (God-view only) — the first non-focus
 * seat. Kept for the duel top-of-table fan; multiplayer uses `opponentSeats`. */
export function opponentHand(step: ReplayStep, focus: PlayerId): CardInstanceId[] {
  const oppId = firstOpponent(step, focus);
  return oppId ? requireStepPlayer(step, oppId).hand : [];
}

/** Every non-focus seat, face-up (God-view only) — the top-of-table fans. In a
 * duel this is one entry (identical to the old single-opponent fan); an ffa-3
 * shows two, a team-2v2 three. */
export function opponentSeats(
  step: ReplayStep,
  focus: PlayerId,
): { id: PlayerId; heroId: string; hand: CardInstanceId[] }[] {
  return seatIds(step)
    .filter((id) => id !== focus)
    .map((id) => {
      const p = requireStepPlayer(step, id);
      return { id, heroId: p.heroId, hand: p.hand };
    });
}

/** First step index at (or after) a given 1-based turn number — for jump-to-turn. */
export function stepIndexForTurn(steps: ReplayStep[], turn: number): number {
  const hit = steps.findIndex((s) => s.turnNumber >= turn);
  return hit === -1 ? steps.length - 1 : hit;
}

/** Distinct turn numbers present in the sequence (for the jump-to-turn control). */
export function turnMarkers(steps: ReplayStep[]): number[] {
  const seen = new Set<number>();
  for (const s of steps) seen.add(s.turnNumber);
  return [...seen].sort((a, b) => a - b);
}
