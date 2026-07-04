# T-011 — Content: Baba Yaga

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-006 (King Kong lessons; ideally via the T-014 skill)
- **More info needed:** NONE

## Context
Launch deck #2 — the zone-conditional archetype ("fixed effect, upgraded if
inside The Hut", deck analysis §5). Deck JSON:
`https://unbrewed-api.vercel.app/api/unmatched-deck/yAJ-`. Per-card
decompositions: deck analysis §5 Baba Yaga table.

## Scope
- `data/heroes/baba-yaga.rules.ts`: HeroDef (11 HP, move 2, melee; **The Hut**
  sidekick 13 HP ×1) + all 13 unique cards.
- The Hut is a fighter-like movable entity that also acts as a REGION for
  `IN_REGION` predicates ("inside the Hut" vs "adjacent to it") plus the hero
  ability's entry-adjacency and end-of-turn triggers. Expect this to be the
  ticket's hard part — model it with existing DSL pieces (fighter + region
  predicate) before inventing anything; if a new primitive is truly needed,
  update the DSL spec + version in the same commit.
- Known flagged card: "Enhanced Awareness" (swap-defence mid-combat) is an
  approved `custom` op (DSL §12). "Chicken Legs" uses `passedThrough`
  targeting.
- Scenario test per card + a golden replay (Baba Yaga vs King Kong).

## Acceptance criteria
- Same bar as T-006: typecheck, per-card scenario tests, golden replay,
  `custom` ≤2 cards, readback committed.
- Hut behaviors covered by tests: entry adjacency, end-of-turn damage +
  in-zone placement, Hut as move target ("move Hut 4 through fighters").

## Out of scope
The Flash (T-012); UI.
