# T-005 — Engine: effect interpreter (DSL v0.1)

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-004
- **More info needed:** NONE

## Context
Executes the card-effect DSL. The DSL spec (`docs/06-effect-dsl-spec.md`) is the
contract — implement it, and where reality disagrees, change the spec doc in
the same commit (versioned: bump `dslVersion`).

## Scope
- `engine/effects.ts`: interpreter for **Tier 1 ops** (DSL §4.1) + Amounts
  (§5, incl. explicit rounding) + Predicates/selectors (§6). Selector picks that
  need a player emit prompts through the T-004 prompt machinery; `each` never
  prompts.
- Cancellation per DSL §7: cancels hit only unresolved blocks; scope objects;
  printed value/boost immune; `setValue(..., locked)`; `UNCANCELLABLE` flag.
- `onOutcome` incl. `unknown: 'BOTH'` (won ops then lost ops).
- Counters/flags/scheduler (`counter`, `setFlag`, `schedule`) — the Tier 2
  subset King Kong + the launch decks need; add remaining Tier 2 ops lazily,
  each with its own tests.
- `custom` op registry (name → function) with a clear error for unknown names;
  reducer rejects unknown op kinds (forward compat, DSL §13).
- Trigger runner for `HeroDef.triggers` (DSL §9): active-player-first ordering,
  `oncePer` counters cleared at TURN_END.

## Acceptance criteria
- Unit tests per implemented op (happy path + one edge each).
- Cancellation ordering tests: attacker's IMMEDIATELY cancel cannot undo the
  defender's already-resolved IMMEDIATELY effect; canceling DURING kills a
  pending `setValue`; UNCANCELLABLE survives.
- Ternary outcome test: an `outcomeResolver` turning a tie into UNKNOWN, with
  an `onOutcome unknown:'BOTH'` card resolving both branches in order.
- Exhaustion interaction: `draw` op on empty deck deals the 2-damage clock;
  `mill`/`discardTop` does NOT (rules doc §8.3).

## Out of scope
Deck data (T-006), English readback renderer (part of T-006 conventions).
