# T-002 — Engine: map graph & spatial queries

- **Status:** ready
- **Repo:** unbrewed-pro-server
- **Depends on:** — (parallel with T-001)
- **More info needed:** NONE

## Context
Movement/range legality all reduces to graph queries. Schema and pseudocode are
fully specified in the maps doc (`docs/05-scripted-maps.md` §3–§4); rules in the
rules doc §3 (movement) and §4 (zones/range).

## Scope
- `engine/map.ts`: `MapDef` types matching 05 §3 (spaces with normalized x/y,
  `adjacentTo[]`, `zones` as a set, start slots; zone color metadata) PLUS
  optional `oneWayTo[]` directed edges (added 2026-07-04 for the Mended Drum's
  stairs drop — movement out-edges are `adjacentTo ∪ oneWayTo`; validator
  checks `oneWayTo` targets exist and don't duplicate a symmetric edge).
- Queries: `areAdjacent`, `sharesZone` (set intersection), `inAttackRange`
  (melee = adjacent; ranged = adjacent OR shares any zone),
  `movementRange(state, fighter, maxSteps)` — BFS where friendly fighters are
  pass-through, enemy fighters block, destination must be empty —
  `isLegalPath(path)`, `legalSidekickStarts`.
- A hand-written **fixture map** in `test/fixtures/` (~8 spaces) that includes a
  split/multi-zone space and two start slots — used by all engine tests until
  the real Marmoreal file lands (T-010).
- Load-time validator: adjacency symmetric, every space has ≥1 zone, start
  spaces exist, ids unique.

## Acceptance criteria
- Unit tests for every query, including: multi-zone space counts for ranged
  attack from BOTH zones (rules doc §10.6); enemy blocks a path an ally
  doesn't; a fighter may pass through an ally but not end on it; forced move
  with no legal destination is a legal no-op (rules doc §3.3).
- Validator rejects an asymmetric-adjacency fixture.

## Out of scope
Real Marmoreal data (T-010), rendering, authoring tooling (T-009).
