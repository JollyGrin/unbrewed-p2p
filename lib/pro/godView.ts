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
} from "./protocol";

const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");

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
  const oppId = other(focus);
  const me = requireStepPlayer(step, focus);
  const opp = requireStepPlayer(step, oppId);
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
    self: {
      id: focus,
      heroId: me.heroId,
      hand: me.hand,
      deckCount: me.deckCount,
      discard: me.discard,
      committedCard: me.committedCard,
      counters: me.counters,
    },
    opponent: {
      id: oppId,
      heroId: opp.heroId,
      handCount: opp.hand.length,
      deckCount: opp.deckCount,
      discard: opp.discard,
      hasCommitted: opp.committedCard !== null,
      counters: opp.counters,
    },
    players: [
      {
        id: focus,
        heroId: me.heroId,
        you: true,
        hand: me.hand,
        handCount: me.hand.length,
        deckCount: me.deckCount,
        discard: me.discard,
        committedCard: me.committedCard,
        hasCommitted: me.committedCard !== null,
        counters: me.counters,
      },
      {
        id: oppId,
        heroId: opp.heroId,
        you: false,
        handCount: opp.hand.length,
        deckCount: opp.deckCount,
        discard: opp.discard,
        hasCommitted: opp.committedCard !== null,
        counters: opp.counters,
      },
    ],
    combat: step.combat,
    prompt: step.prompt,
    winner: step.winner,
  };
}

/** The other seat's actual hand (God-view only) — for the top-of-table fan. */
export function opponentHand(step: ReplayStep, focus: PlayerId): CardInstanceId[] {
  return requireStepPlayer(step, other(focus)).hand;
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
