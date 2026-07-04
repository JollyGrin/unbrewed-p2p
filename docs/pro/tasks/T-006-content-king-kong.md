# T-006 — Content: King Kong (hand-authored deck #1)

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-005
- **More info needed:** NONE

## Context
The first deck is authored BY HAND to shake out the DSL before any automation
(context doc roadmap step 3). Card-by-card decompositions already exist:
deck analysis doc §5 (King Kong table) — treat them as a first draft, not
gospel; verify each against the actual card text from the deck JSON
(`https://unbrewed-api.vercel.app/api/unmatched-deck/kdKM`).

## Scope
- `data/heroes/king-kong.rules.ts`: `HeroDef` (32 HP, move 1, melee, no
  sidekick, start-of-turn trigger) + all 12 unique cards as `CardDef`s per the
  DSL spec, keyed `king-kong/<slug>`.
- Minimal `renderOps(cardDef) → string[]` English readback (DSL §13) — good
  enough for a reviewer to diff against printed card text.
- A scenario test per card (T-005's machinery), e.g. Clobber's zone AoE only on
  won; "eighth wonder" constraint blocks play after maneuvering; "pounce"
  dynamic move amount = damage received.
- One golden replay: full scripted Kong-vs-Kong game on the fixture map (swap
  to real Marmoreal when T-010 lands), `{seed, actionLog, stateHash}`.
- Append every spec discrepancy found to `docs/KICKOFF.md` (that repo) — this
  list drives DSL v0.2 and the conversion skill (T-014).

## Acceptance criteria
- All 12 cards typecheck; every card has a passing scenario test; golden replay
  green; `custom` op usage ≤2 cards (DSL escape budget).
- Readback output for all 12 cards committed alongside (review artifact).

## Out of scope
Other decks (T-011/T-012/T-013), automation (T-014).
