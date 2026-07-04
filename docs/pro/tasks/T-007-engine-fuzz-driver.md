# T-007 — Engine: random-playout fuzz driver

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-004 (more valuable after T-005/T-006)
- **More info needed:** NONE

## Context
Cheapest way to find timing-window edge cases and stuck states (prior-art doc
§7 layer 3). Free once `legalActions` exists: pick random legal actions until
game end.

## Scope
- `test/fuzz.test.ts`: seeded driver — from `initialState`, repeatedly pick a
  uniformly random action from `legalActions` (including prompt responses)
  until win/loss or a turn cap (e.g. 200 turns ⇒ fail as "stuck").
- Detect: reducer throws, illegal state invariants (negative HP without defeat,
  two fighters on one space, hand/deck/discard card-count conservation, prompt
  with empty options emitted), non-termination.
- CI mode: bounded run (e.g. 300 games); local mode: `FUZZ_GAMES=n` env for
  long hunts. On failure, print `{seed, actionLog}` so the case becomes a
  replayable regression test verbatim.

## Acceptance criteria
- CI-bounded fuzz run green against whatever content exists (vanilla test decks
  at minimum; re-point at King Kong once T-006 lands).
- A deliberately-broken invariant (mutation test) is caught — proves the
  invariant checks actually run.

## Out of scope
Coverage-guided fuzzing, performance work, AI heuristics.
