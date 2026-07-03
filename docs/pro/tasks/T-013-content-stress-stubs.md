# T-013 — Content: stress-test stubs (Pinocchio, Schrödinger's Cat)

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-005
- **More info needed:** NONE

## Context
These two decks exist to pressure-test the DSL BEFORE the protocol/server
freeze — they must TYPECHECK against the DSL, they do NOT need to be playable
or shipped (context doc decisions log). Decompositions: deck analysis §5.
Deck JSONs: `72Dz` (Pinocchio), `G_nr` (Schrödinger's Cat).

## Scope
- `data/heroes/pinocchio.rules.ts` + `data/heroes/schrodingers-cat.rules.ts`:
  every unique card + hero ability encoded as CardDef/HeroDef data. Where an op
  or predicate doesn't exist yet, encode the closest honest shape and add a
  `// DSL-GAP:` comment — do NOT silently force-fit.
- Pinocchio exercises: Lie counter (capped), `oppMay` cost/effect trades,
  UNCANCELLABLE flags, provenance predicate, `linkedWith`, schedule-based
  cross-turn buff, ability-driven attack switch (the hero trigger itself may be
  a `custom`).
- Schrödinger exercises: `outcomeResolver` (tie → UNKNOWN), `onOutcome`
  `unknown:'BOTH'` on ~half the deck, `BOOST_EQUALS`, `ignoreDefense`,
  remove-and-redeploy, discard→deck recursion.
- Deliverable doc: append a "DSL v0.2 candidates" list to the DSL spec —
  every `DSL-GAP` found, with the proposed primitive or explicit
  escape-hatch/wontfix call.

## Acceptance criteria
- Both files typecheck (gaps expressed via `custom` + `DSL-GAP` comments, not
  type errors).
- The DSL v0.2 candidate list exists in the spec doc with a decision proposed
  per item.

## Out of scope
Making these decks playable; scenario tests (welcome where cheap, not
required).
