# T-020 — Tooling: DSL coverage sweep

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-014 (reuses the conversion skill's decomposition step)
- **More info needed:** NONE

## Context
Replaces wider up-front deck analysis (context doc roadmap step 6): once the
DSL is frozen and proven, measure how much of the broader deck ecosystem it
covers, and re-run whenever choosing the next deck to support.

## Scope
- `scripts/coverage-sweep.ts`: fetch the next N popular decks from
  unmatched.cards via the unbrewed-api (N configurable, default ~50, skipping
  already-converted decks), extract every effect-text unit.
- LLM-classify each unit against the current primitive catalog (cheap model;
  the conversion skill's decomposition prompt, classification-only mode).
- Report (`docs/coverage/<date>.md` in that repo): coverage % overall and per
  deck; every uncovered effect quoted verbatim with deck/card; per-gap proposed
  disposition (new primitive / escape hatch / don't support deck yet);
  a ranked "cheapest next decks to convert" list.
- Deterministic re-runs: cache fetched decks; the LLM step logs its
  classifications so diffs between sweeps are reviewable.

## Acceptance criteria
- One full sweep committed with the report; at least the top-10 unconverted
  decks ranked by conversion cost.
- Re-running against unchanged inputs produces an identical report modulo the
  date header.

## Out of scope
Auto-converting decks (human decision stays in the loop), official-deck
sources.
