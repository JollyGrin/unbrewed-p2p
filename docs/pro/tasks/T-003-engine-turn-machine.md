# T-003 — Engine: turn state machine & legalActions

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-001, T-002
- **More info needed:** NONE

## Context
The 2-action turn loop and the authoritative legal-action enumerator. Spec:
rules doc §2 (state diagram + legality gates), §3.4 (movement boost), §8
(hand limit, exhaustion); prior-art doc §8 (enumerate, don't just validate).

## Scope
- `engine/reduce.ts`: `reduce(state, action) → { state, events }` skeleton +
  typed `GameEvent` list (event names per prior-art doc §2 recommendation).
- `engine/turn.ts`: turn start/end, `actionsRemaining` as a counter (bonus
  attacks and "gain action" adjust it later), end-of-turn hand-limit discard
  prompt, pass to next player.
- Maneuver: mandatory draw (empty deck ⇒ 2 damage to EACH of that player's
  fighters — rules doc §8.3), optional per-fighter move using T-002 queries,
  optional movement boost (discard, add boost value).
- Scheme/Attack action gates exactly per rules doc §2.2 (attack requires usable
  card AND in-range target; combat itself is T-004 — until then, entering the
  attack action may end at a `NotImplemented` boundary behind a flag).
- `engine/legalActions.ts`: `legalActions(state, playerId) → Action[]`; the
  reducer rejects any submitted action not in the current set (single source of
  truth). Auto-skip: prompts with empty/pass-only option sets resolve silently.

## Acceptance criteria
- Tests: maneuver-twice is always a legal turn; attack is absent from
  legalActions when no card or no target; hand limit only enforced at end of
  own turn (rules doc §8.4); exhaustion clock can kill a hero and ends the game.
- A scripted 10-turn maneuver-only game replays deterministically
  (`{seed, actionLog}` golden).

## Out of scope
Combat resolution (T-004), card effects (T-005).
