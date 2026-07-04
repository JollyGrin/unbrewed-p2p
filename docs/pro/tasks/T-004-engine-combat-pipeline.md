# T-004 — Engine: combat pipeline

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-003
- **More info needed:** NONE

## Context
The heart of the engine and where correctness effort pays most (~45% of all
card logic hangs off the after-combat window). Spec: rules doc §5 (the exact
timeline + mermaid), §9 items 9–20 (decision points), DSL spec §8 (ternary
outcome), prior-art doc §3 (prompts as data, simultaneous commit).

## Scope
- `engine/combat.ts`: window pipeline
  `DECLARE → COMMIT → REVEAL → IMMEDIATELY → DURING → DAMAGE → AFTER → HERO_POST → CLEANUP`.
- COMMIT: attacker chooses face-down card, then defender may (both stored in
  the owner's secret zone; auto-skip defender prompt if they hold no usable
  defense/versatile). Reveal flips both simultaneously.
- Defender-first ordering inside every effect window (rules doc §5.2).
- DAMAGE: `max(0, atk − def)`; outcome computed ONCE and stored:
  `ATTACKER_WON | DEFENDER_WON | UNKNOWN` (ties → defender; UNKNOWN only via a
  hero `outcomeResolver` hook — DSL spec §8). Effect damage never changes it.
- Hero-death check mid-pipeline: hero at 0 ends the game immediately; both-at-0
  in one step ⇒ active player wins (rules doc §8.2). Defeated sidekick's AFTER
  block still fires (rules doc §5.2.4).
- `PendingPrompt` as serializable data with named continuation refs (prior-art
  doc §3); every prompt auto-skips when empty.
- Versatile counts as attack AND defense for all references (rules doc §5.5).
- Combat card windows execute via a stub effect runner (real interpreter is
  T-005): for this ticket, cards with no effect blocks are enough.

## Acceptance criteria
- Golden test reproducing the rulebook example: attack 4 vs defense 4 ⇒ 0
  damage ⇒ defender wins (rules doc §5.3).
- Tests: no-defense-card combat; sidekick defeat removes token but its AFTER
  hook point still fires; simultaneous hero death ⇒ active player wins; prompts
  serialize/deserialize round-trip.

## Out of scope
Effect ops (T-005), bonus attacks (explicitly deferred — leave a typed
`NotImplemented` path; see DSL spec §14 open item 1).
