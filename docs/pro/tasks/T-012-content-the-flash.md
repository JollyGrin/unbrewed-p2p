# T-012 — Content: The Flash

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-006 (ideally authored via the T-014 skill as its first real run)
- **More info needed:** NONE

## Context
Launch deck #3 — mobility/tempo archetype with exactly one hero state: the
SPEED FORCE flag unlocking ⚡ card modes (deck analysis §5). Deck JSON:
`https://unbrewed-api.vercel.app/api/unmatched-deck/p1Ew`.

## Scope
- `data/heroes/the-flash.rules.ts`: HeroDef (15 HP, move 4; Impulse sidekick)
  + all 11 unique cards.
- SPEED_FORCE as a generic flag: set by boosting a maneuver (hero trigger on
  BOOST_APPLIED during maneuver), cleared end of turn; `⚡` card halves are
  `if FLAG(SPEED_FORCE)` branches. "The Fastest man alive" persists it to next
  turn; "Infinite Mass Punch" uses `denyFlag` next turn.
- Engine-state dependencies this deck exercises (verify T-005 exposed them):
  `UNIQUE_SPACES_THIS_TURN`, `STAT MOVE of opponent`, `playRange` constraint
  (Speed Blitz), `MOVED_THIS_TURN`, vacant-start-space placement.
- Known flagged card: "Into the multiverse" (name-a-value + count opponent
  hand by value) — expected `custom` or a small prompt-input extension; decide
  against the escape budget.
- Scenario test per card + golden replay (Flash vs Baba Yaga or Kong).

## Acceptance criteria
- Same bar as T-006/T-011. SPEED FORCE lifecycle covered: enter via boost-a-
  maneuver, ⚡ branches fire only while set, expiry at TURN_END, persist and
  deny variants.

## Out of scope
Stress decks (T-013).
