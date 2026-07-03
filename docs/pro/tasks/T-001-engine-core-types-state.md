# T-001 — Engine: core types, state & seeded RNG

- **Status:** ready
- **Repo:** unbrewed-pro-server (`~/git/unbrewed-pro-server`)
- **Depends on:** —
- **More info needed:** NONE

## Context
First engine milestone step (see `docs/KICKOFF.md` step 1 in that repo). The
engine is a pure reducer over immutable state; everything downstream (replay,
redaction, AI) leans on the shapes chosen here. Specs: rules doc §0/§6/§7
(entities), prior-art doc §4/§6 (reducer + RNG-in-state), DSL spec §2/§9
(CardDef/HeroDef).

## Scope
- `engine/types.ts`: `GameState`, `PlayerState`, `Fighter` (hero/sidekick, hp,
  space, 1-hp-token flag), card zones (deck/hand/discard/committed), turn info
  (`activePlayer`, `actionsRemaining`), `CombatState | null`, `PendingPrompt | null`,
  counters/flags storage, action log, `rng: { seed, counter }`.
- Group each player's secrets (hand, deck order, face-down commit) under one
  sub-object so a later `redactFor` is a shallow operation.
- `engine/rng.ts`: small deterministic PRNG (e.g. mulberry32) advanced only via
  engine calls; `shuffle(deck, rng)`.
- `engine/state.ts`: `initialState(config)` — setup per rules doc §1 (draw 5,
  place heroes on start spaces, sidekick zone constraint, first player = space
  "1" owner).

## Acceptance criteria
- `npm run typecheck` green under the repo's strict tsconfig.
- Test: same seed + same config ⇒ identical initial state (deep equal); two
  seeds ⇒ different shuffles.
- Test: a grep/lint check asserting `Math.random`/`Date.now`/`new Date` do not
  appear anywhere under `engine/`.

## Out of scope
Reducer logic, legalActions, map queries (T-002), any I/O.
