# T-014 — Tooling: card-conversion skill

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-006 (skills document a PROVEN process — never write this before Kong ships)
- **More info needed:** NONE

## Context
The repeatable pipeline for adding decks with agents doing the mechanical work
(context doc roadmap step 3). The DSL spec §13 authoring conventions + the
discrepancy notes appended to KICKOFF during T-006 are the source material.

## Scope
- `.claude/skills/convert-deck/SKILL.md` in the pro-server repo. The skill
  instructs an agent to, given a deck id:
  1. Fetch deck JSON from the unbrewed-api; enumerate unique cards.
  2. Decompose each card's text into DSL ops (few-shot examples: real cards
     from King Kong / Baba Yaga rule files).
  3. Emit `data/heroes/<id>.rules.ts`; run `npm run typecheck`.
  4. Generate a scenario test per card; run the suite.
  5. Produce the review report: per card, printed text vs `renderOps` readback
     side by side, plus flags.
  6. Flag rules: anything that doesn't decompose cleanly → `NEEDS-PRIMITIVE`
     or `ESCAPE-HATCH`, never force-fit; stop and report rather than guess.
- Include the escape-budget rule (≤2 custom/deck) and the "new primitive needs
  ≥2 corpus occurrences" rule from DSL §13.
- Document intended model routing in the skill header: cheap model for the
  mechanical pass; flagged cards escalate.

## Acceptance criteria
- Dry run: re-convert King Kong with the skill and diff against the
  hand-authored file — differences are explainable (or improvements).
- First real run: used for T-012 (The Flash) with a clean review report.

## Out of scope
The coverage sweep (T-020); converting beyond the launch decks.
