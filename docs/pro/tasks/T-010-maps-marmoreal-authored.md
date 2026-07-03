# T-010 — Maps: authored Marmoreal map file

- **Status:** blocked
- **Repo:** unbrewed-pro-server (file lands there; work happens in the T-009 editor)
- **Depends on:** T-008, T-009
- **More info needed:** NONE (inherits T-008's image decision)

## Context
The v1 battlefield (context doc decisions log; rationale in maps doc §6:
mechanically vanilla, no special printed rules). Geometry comes seeded from
T-008; a human (the user, guided by an agent session) draws adjacency edges and
start slots in the T-009 editor against a reference photo of the physical
board.

## Scope
- Load `marmoreal.zones.draft.json` into the editor; draw every adjacency line
  by eye from a board photo; mark hero start spaces "1" and "2"; fix any seed
  coordinate drift; fill metadata (title, imageUrl, players, source/license).
- Export → `data/maps/marmoreal.zones.json` in the pro-server repo; run the
  T-002 validator.
- Spot-check with the engine: pick 5 known positions from the physical board
  and assert `inAttackRange`/`movementRange` results match manual reading
  (write these as tests — they document the board).

## Acceptance criteria
- Validator green (symmetric edges, all spaces zoned, starts present).
- The 5 positional spot-check tests pass and are committed.
- T-006's golden replay re-pointed from the fixture map to Marmoreal and green.

## Out of scope
More maps; client-side board rendering (T-019).
