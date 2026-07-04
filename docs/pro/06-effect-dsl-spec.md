# Unbrewed Pro — Card-Effect DSL Specification (v0.1 draft)

> The founding spec of the `unbrewed-pro-server` engine. Merges the corpus-derived
> primitive vocabulary (04) with the official timing/cancellation model (02) under
> the effects-as-typed-data pattern (03). **This doc migrates to the private repo
> when it exists** (per the docs-privacy decision in 01).
>
> Status: v0.1 — frozen enough to start the engine; expect revisions while
> hand-authoring deck #1 (King Kong). Changes after deck #2 should be rare and
> deliberate (the corpus was surveyed precisely to avoid churn).

## 1. Design tenets (settled in 01/03)

1. **A card is data, not code.** Typed TypeScript object literals, compiled by
   `tsc` at authoring time, serializable for replays/logging/AI. No text DSL, no
   classes.
2. **Small verb library.** ~12 core ops cover the large majority of the 480-unit
   corpus; a bounded second tier covers the rest; one escape hatch
   (`{ op: 'custom', fn: '<registry-name>' }`) for the genuinely weird. Escape-hatch
   budget: ≤1–2 cards per deck; more means the DSL needs a primitive, not the card
   a hack.
3. **Everything the resolver needs is in the structure** — timing windows are the
   cancelable units, flags carry metadata (`UNCANCELLABLE`, value locks), prompts
   are serializable data, RNG lives in state.
4. **The DSL is an authoring interface, not a parse target.** Card text is flavor;
   humans/LLMs author these objects and review them via English readback (§12).

## 2. Card definition shape

```ts
type Window = 'IMMEDIATELY' | 'DURING' | 'AFTER' | 'SCHEME';
// SCHEME = the body of a scheme card (02 §11.1). Hero abilities use triggers (§9).

interface CardDef {
  id: CardId;                    // stable slug: 'king-kong/clobber'
  title: string;
  type: 'attack' | 'defense' | 'scheme' | 'versatile';  // API 'defence' → 'defense' at import
  value: number | null;          // printed value — a PROPERTY, immune to cancel (§7)
  boost: number | null;          // printed boost — same immunity
  usableBy: 'HERO' | 'SIDEKICK' | 'ANY';
  quantity: number;
  constraints?: Constraint[];    // static play restrictions — NOT effects (§3)
  blocks: EffectBlock[];         // the timed program (§4)
  linkedWith?: CardId;           // multi-part cards (Pinocchio's "Blood, Sweat…/…And Varnish")
}

interface EffectBlock {
  window: Window;
  flags?: ('UNCANCELLABLE')[];
  ops: Op[];                     // resolved strictly in order
}
```

Key structural decisions, each traceable to research:

- **Blocks per timing window, not one effect.** Each window is a *separate,
  individually cancelable effect* (02 §5.5 / [RR]). ~45% of corpus logic lives in
  `AFTER` (04 §3.2).
- **`constraints` is split from effects** because the API's `basicText` overloads
  scheme bodies and play restrictions (04 implication #2).
- **`value`/`boost` sit outside `blocks`** — printed values are not effects and
  cannot be canceled (02 §5.5); ops that *change* values are effects and can be.

## 3. Constraints (static play-legality layer)

Checked by `legalActions()` before the card can be committed; never "resolve".

```ts
type Constraint =
  | { kind: 'adjacentTargetOnly' }                  // "may only attack an adjacent fighter"
  | { kind: 'playRange'; distance: Amount }         // Flash "Speed Blitz": play from MOVE spaces away
  | { kind: 'playFaceUp' }
  | { kind: 'requires'; when: Predicate };          // Kong "eighth wonder": not-maneuvered-this-turn
```

## 4. Ops — the primitive verb library

### 4.1 Tier 1 (core — covers the bulk of the corpus, 04 §3.1)

```ts
type Op =
  // resource & combat math
  | { op: 'dealDamage'; target: FighterSel; amount: Amount }   // effect damage ≠ attack damage (02 §5.3)
  | { op: 'draw'; who: PlayerSel; amount: Amount }             // exhaustion applies (02 §8.3)
  | { op: 'discard'; who: PlayerSel; amount: Amount; random?: boolean; from?: 'hand' | 'deckTop' }
  | { op: 'heal'; target: FighterSel; amount: Amount }         // capped at dial max (02 §7)
  | { op: 'gainActions'; amount: Amount }
  | { op: 'modifyValue'; card: CombatCardSel; delta: Amount }  // ±N, dynamic exprs welcome
  | { op: 'setValue'; card: CombatCardSel; to: Amount; locked?: boolean } // locked = "cannot be changed" (Predator)
  // board
  | { op: 'move';  who: FighterSel; upTo: Amount; throughFighters?: boolean } // path rules (02 §3.2)
  | { op: 'place'; who: FighterSel; where: SpaceSel }          // teleport; move ≠ place (02 §3.3)
  // combat meta
  | { op: 'cancel'; scope: CancelScope }                       // §7
  | { op: 'ignoreDefense' }                                    // treat defense value as 0 this combat
  // control flow
  | { op: 'if'; when: Predicate; then: Op[]; else?: Op[] }
  | { op: 'onOutcome'; won?: Op[]; lost?: Op[]; unknown?: Op[] | 'BOTH' }  // §8
  | { op: 'optional'; label: string; then: Op[] }              // "you may …" → yes/no prompt
  | { op: 'chooseOne'; options: { label: string; then: Op[] }[] }  // modal cards
  // escape hatch
  | { op: 'custom'; fn: string; args?: Json };                 // registry-resolved, name is serialized
```

### 4.2 Tier 2 (bounded extensions — each earns its place in the corpus)

```ts
  // reaction protocol (Pinocchio; The Devil's contracts) — 04 implication #11
  | { op: 'oppMay'; cost: Cost; then: Op[]; upTo?: Amount }    // opponent may pay cost → effect, repeatable upTo
  // counters & hero state — generic, no per-deck special cases (04 implication #9)
  | { op: 'counter'; action: 'gain' | 'remove' | 'removeAll'; name: string; amount?: Amount }
  | { op: 'setFlag'; flag: string; until: Timing }             // SPEED_FORCE-style states
  | { op: 'denyFlag'; flag: string; during: Timing }           // "can't enter SPEED FORCE next turn"
  // scheduler — delayed & cross-turn effects (04 implication #12)
  | { op: 'schedule'; at: Timing; ops: Op[] }                  // 'NEXT_TURN_START' | 'TURN_END' | …
  // deck & discard manipulation
  | { op: 'reveal'; what: 'HAND' | 'CARD'; who: PlayerSel }
  | { op: 'shuffleIntoDeck'; from: 'HAND' | 'DISCARD'; amount: Amount }
  | { op: 'returnToHand'; what: CardZoneSel }
  | { op: 'mill'; who: PlayerSel; amount: Amount }             // discard deck-top: NOT a draw, no exhaustion dmg
  // damage modification (04 implication #13)
  | { op: 'preventDamage'; scope: 'ALL' | Amount; rounding?: 'UP' | 'DOWN' }
  | { op: 'capDamage'; max: Amount }                           // Goldhorn
  // board lifecycle
  | { op: 'removeFromBoard'; who: FighterSel }                 // benign removal (Vanish) — distinct from defeat
  | { op: 'defeat'; who: FighterSel }                          // Sans; keeps loss condition explicit
  | { op: 'setStat'; who: FighterSel; stat: 'MOVE'; to: Amount; until: Timing } // Kong "Smash and grab"
  // boost as a manipulable object (04 implication #8)
  | { op: 'boost'; card: CombatCardSel; blind?: boolean }      // discard from hand, add its boost value
  | { op: 'retrieveBoostCard' }                                // Kong "A king, nay — a god"
  | { op: 'grantBoost'; card: CombatCardSel }                  // ability-granted boost window (02 §5.4)
  | { op: 'bonusAttack' }                                      // nested combat sub-pipeline (02 §5.6)
  | { op: 'endTurn' };
```

**Engine-level state (not ops):** per-turn movement history (`uniqueSpacesThisTurn`,
Flash), `damageReceivedThisCombat` (Kong "pounce"), and per-combat provenance flags
(`WAS_SWITCHED_IN`, Pinocchio) are tracked by the reducer and exposed only through
`Amount`/`Predicate` expressions — cards read them, never write them.

## 5. Amounts (dynamic value expressions — 04 implication #6)

```ts
type Amount =
  | number
  | { expr: 'COUNT'; of: Countable }        // opp hand size, zones of target, counter N, boost of card X…
  | { expr: 'STAT'; stat: 'MOVE'; of: FighterSel }
  | { expr: 'UNIQUE_SPACES_THIS_TURN'; of: FighterSel }
  | { expr: 'DAMAGE_RECEIVED_THIS_COMBAT'; of: FighterSel }
  | { expr: 'PLAYER_CHOICE'; range: [number, number] }         // "you may ±1" (Broken Reality)
  | { expr: 'HALF'; of: Amount; rounding: 'UP' | 'DOWN' }      // fractional math, explicit rounding
  | { expr: 'SUM'; of: Amount[] };
```

## 6. Predicates & selectors

```ts
type Predicate =
  | { is: 'WON' } | { is: 'LOST' } | { is: 'UNKNOWN' }         // combat outcome, §8 — 31.6% of conditionals
  | { is: 'ADJACENT'; a: FighterSel; b: FighterSel }           // spatial — 23.8% of conditionals
  | { is: 'SHARES_ZONE'; a: FighterSel; b: FighterSel }
  | { is: 'IN_REGION'; who: FighterSel; region: RegionSel }    // "inside The Hut"
  | { is: 'DISTANCE'; a: FighterSel; b: FighterSel; cmp: Cmp; n: number }
  | { is: 'MOVED_THIS_TURN'; who: FighterSel }
  | { is: 'COUNT'; of: Countable; cmp: Cmp; n: Amount }        // hand size, counters, HP thresholds
  | { is: 'FLAG'; flag: string }                               // SPEED_FORCE; TRUTHFUL = counter Lie == 0
  | { is: 'BOOST_EQUALS'; a: CombatCardSel; b: CombatCardSel } // Schrödinger boost-match
  | { is: 'PROVENANCE'; flag: 'WAS_SWITCHED_IN' }
  | { is: 'PLAYED_AS'; role: 'ATTACK' | 'DEFENSE' }
  | { not: Predicate } | { all: Predicate[] } | { any: Predicate[] };

type FighterSel = 'SELF' | 'OWN_HERO' | 'OWN_SIDEKICK' | 'OPPOSING_FIGHTER'  // combat opponent
  | { each: 'OPPOSING' | 'ALL'; where?: Predicate }            // AoE: "each opp in Kong's zone"
  | { choose: 'OWN' | 'OPPOSING' | 'ANY' | 'COMBATANT'; where?: Predicate; chooser?: PlayerSel }
  | { passedThrough: true };                                   // path-of-movement (Chicken Legs)

type SpaceSel = 'ANYWHERE' | { adjacentTo: FighterSel } | { inZoneOf: FighterSel | RegionSel }
  | { vacantStartSpace: true } | { withinOwnZone: true };
```

Selector resolution that requires a player pick emits a prompt (§10); `each` never
prompts. `SELF`/`WON`/`LOST` are relative to the card's controller.

## 7. Cancellation semantics (resolves 02 §10 [OPEN] 1–3)

```ts
type CancelScope =
  | { kind: 'WINDOW'; card: 'OPPONENTS_COMBAT_CARD'; window: Window }
  | { kind: 'WHOLE_CARD'; card: CombatCardSel }     // all blocks on that card
  | { kind: 'THIS_CARD' };                          // self-cancel (High Strung's own escape clause)
```

Adopted rulings (encode as engine law + golden tests):

1. **Cancels affect only blocks not yet resolved.** Windows resolve in order with
   defender-first tiebreak (02 §5.2); an attacker's IMMEDIATELY cancel therefore
   cannot retroactively undo a defender's already-resolved IMMEDIATELY effect. Cards
   whose official wording contradicts this get a per-card `custom` exception.
2. **Scope is authored per card, not inferred** from text ("cancel the effect" vs
   "all effects") — the conversion step maps each card's exact wording to a
   `CancelScope` (02 [OPEN] 2 is a content task, handled at authoring time).
3. **Printed `value`/`boost` are immune** to any cancel. `setValue`/`modifyValue`
   ops are effects inside blocks → cancelable like anything else. `setValue(...,
   locked: true)` additionally rejects later modification attempts (Predator).
4. Blocks flagged `UNCANCELLABLE` are skipped by cancel resolution (Pinocchio).

## 8. Combat outcome (resolves the ternary-outcome requirement)

```ts
type CombatOutcome = 'ATTACKER_WON' | 'DEFENDER_WON' | 'UNKNOWN';
```

- Computed **once**, at damage calculation: `attackDamage = max(0,
  effectiveAttack − effectiveDefense)`; `ATTACKER_WON` iff `attackDamage ≥ 1`, else
  `DEFENDER_WON` (ties go to the defender — RAW, 02 §5.3). Effect damage never
  counts. The stored outcome is immutable; AFTER effects read it, never change it.
- **`UNKNOWN` exists only via an outcome-resolver hook** a hero ability can
  install (Schrödinger's Cat: value tie → `UNKNOWN`, no winner or loser). The enum
  is ternary from day one so the resolver, `onOutcome`, and every "if you won"
  card share one model (04 implication #3).
- `onOutcome.unknown: 'BOTH'` runs `won` ops then `lost` ops, in that order.

## 9. Hero definitions, abilities, counters

```ts
interface HeroDef {
  id: string; name: string;
  hp: number; move: number; reach: 'MELEE' | 'RANGED';
  sidekick?: { name: string; hp: number; quantity: number; reach: 'MELEE' | 'RANGED' };
  counters?: { name: string; max?: number }[];      // Lie(max 3), Swagger, …
  outcomeResolver?: string;                          // registry fn (Schrödinger)
  triggers: TriggerDef[];                            // the special ability, as data
}

interface TriggerDef {
  on: 'TURN_START' | 'TURN_END' | 'CARDS_REVEALED' | 'COMBAT_RESOLVED' | 'DAMAGE_DEALT'
    | 'FIGURE_MOVED' | 'BOOST_APPLIED' | 'CARD_DRAWN';
  when?: Predicate;
  oncePer?: 'TURN' | 'GAME';                         // counter on the instance, cleared at TURN_END
  ops: Op[];                                         // may open prompts like any effect
}
```

Hero abilities are "cards without a card" (02 [OPEN] 10): same windows, same ops,
same prompt machinery. Trigger ordering: active player's triggers first, then
entered-play order (Hearthstone rule, 03 §2). Deck-specific *states* are just
counters/flags — `TRUTHFUL` is `counter('Lie') == 0`, `SPEED_FORCE` is a flag with
a `TURN_END` expiry — no per-deck engine code.

## 10. Prompts & the reaction protocol

Every player decision (targets, `optional`, `chooseOne`, `oppMay`, boost offers,
combat commits) reifies as serializable data (03 §3):

```ts
interface PendingPrompt {
  promptId: string;
  player: PlayerId;
  kind: 'CHOOSE_TARGET' | 'CHOOSE_SPACE' | 'YES_NO' | 'CHOOSE_OPTION' | 'COMMIT_COMBAT_CARD' | 'PAY_COST';
  options: LegalOption[];        // never empty — empty ⇒ auto-skip, no prompt emitted
  continuation: { ref: string; args: Json };  // named resume point in the reducer
}
```

**Auto-skip law (strict-RAW + auto-skip decision):** the engine computes the legal
option set for every window/prompt; empty or pass-only ⇒ resolve silently. The 23
decision points in 02 §9 (with their `[AUTO-SKIP]` markers) are the checklist —
each becomes either a prompt kind or an automatic step.

`oppMay` is the one place the *non-acting* player gets a mid-effect prompt: it
emits a `PAY_COST` prompt to the opponent with the cost/effect described; decline
is always an option; `upTo` re-prompts until decline or cap.

## 11. Worked examples (real cards from the five decks)

```ts
// Baba Yaga — "Iron Teeth" (A3): AFTER: heal 1; heal 2 if at the Hut.
{ id: 'baba-yaga/iron-teeth', title: 'Iron Teeth', type: 'attack', value: 3, boost: 2,
  usableBy: 'HERO', quantity: 3,
  blocks: [{ window: 'AFTER', ops: [
    { op: 'if', when: { is: 'IN_REGION', who: 'SELF', region: 'HUT' },
      then: [{ op: 'heal', target: 'SELF', amount: 2 }],
      else: [{ op: 'heal', target: 'SELF', amount: 1 }] } ] }] }

// King Kong — "Clobber" (V3): AFTER: if you won, deal 1 to each opposing fighter in Kong's zone.
{ id: 'king-kong/clobber', title: 'Clobber', type: 'versatile', value: 3, boost: 2,
  usableBy: 'HERO', quantity: 3,
  blocks: [{ window: 'AFTER', ops: [
    { op: 'onOutcome', won: [
      { op: 'dealDamage', amount: 1,
        target: { each: 'OPPOSING', where: { is: 'SHARES_ZONE', a: 'SELF', b: 'OPPOSING_FIGHTER' } } } ] } ] }] }

// The Flash — "Speed Blitz" (V2): BASIC: may be played from MOVE spaces away.
// IMMEDIATELY: cancel all effects on opponent's card; ⚡: reduce its printed value to 0.
{ id: 'the-flash/speed-blitz', title: 'Speed Blitz', type: 'versatile', value: 2, boost: 2,
  usableBy: 'HERO', quantity: 2,
  constraints: [{ kind: 'playRange', distance: { expr: 'STAT', stat: 'MOVE', of: 'SELF' } }],
  blocks: [{ window: 'IMMEDIATELY', ops: [
    { op: 'cancel', scope: { kind: 'WHOLE_CARD', card: 'OPPONENTS_COMBAT_CARD' } },
    { op: 'if', when: { is: 'FLAG', flag: 'SPEED_FORCE' },
      then: [{ op: 'setValue', card: 'OPPONENTS_COMBAT_CARD', to: 0 }] } ] }] }

// Pinocchio — "High Strung" (V4): AFTER: move Pinocchio up to 4.
// Opponent may remove 1 of your Lie tokens to cancel this card.
{ id: 'pinocchio/high-strung', title: 'High Strung', type: 'versatile', value: 4, boost: 3,
  usableBy: 'HERO', quantity: 2,
  blocks: [{ window: 'AFTER', ops: [
    { op: 'oppMay', cost: { removeCounter: { name: 'Lie', amount: 1, from: 'OPPONENT_OF_CHOOSER' } },
      then: [{ op: 'cancel', scope: { kind: 'THIS_CARD' } }] },
    { op: 'move', who: 'SELF', upTo: 4 } ] }] }

// Schrödinger's Cat — "Feral Strike" (A4): AFTER: won → draw 2; lost → take 1; UNKNOWN → both.
{ id: 'schrodingers-cat/feral-strike', title: 'Feral Strike', type: 'attack', value: 4, boost: 2,
  usableBy: 'HERO', quantity: 2,
  blocks: [{ window: 'AFTER', ops: [
    { op: 'onOutcome',
      won:  [{ op: 'draw', who: 'SELF', amount: 2 }],
      lost: [{ op: 'dealDamage', target: 'SELF', amount: 1 }],
      unknown: 'BOTH' } ] }] }

// King Kong — hero ability (trigger): at the start of your turn, you may deal 1
// damage to Kong; if you do, an adjacent opposing fighter's player discards 1.
{ triggers: [{ on: 'TURN_START', ops: [
    { op: 'optional', label: 'Terrifying Presence', then: [
      { op: 'dealDamage', target: 'OWN_HERO', amount: 1 },
      { op: 'discard', who: 'OPPONENT', amount: 1 } ] } ] }] }
```

## 12. Coverage & the flagged gaps from 04

Every `NEEDS NEW PRIMITIVE` flag from the five-deck breakdown, resolved:

| Flag (04 §5) | Resolution |
|---|---|
| set-move-override with duration (Kong) | `setStat` |
| retrieve committed boost card (Kong) | `retrieveBoostCard` |
| swap-defence mid-combat (Baba Yaga) | `custom` (rare; revisit if it recurs) |
| path-of-movement targeting (Chicken Legs) | `FighterSel { passedThrough }` |
| name-a-value + count-hand-by-value (Flash) | `PLAYER_CHOICE` amount + `COUNT` countable; likely `custom` glue |
| per-turn movement history (Flash) | engine-level state + `UNIQUE_SPACES_THIS_TURN` expr |
| opponent-drains-token trade-off + uncancellable (Pinocchio) | `oppMay` + `UNCANCELLABLE` flag |
| ability-provenance predicate (Pinocchio) | `PROVENANCE: WAS_SWITCHED_IN` |
| linked multi-part card (Pinocchio) | `CardDef.linkedWith` |
| delayed cross-turn buff (Pinocchio) | `schedule` + flags |
| opponent-cancels-by-spending-your-token (Pinocchio) | `oppMay` → `cancel THIS_CARD` |
| 3-way outcome incl. unknown (Schrödinger) | `onOutcome` + `outcomeResolver` hook |
| boost-match + ignore-defense (Schrödinger) | `BOOST_EQUALS` + `ignoreDefense` |
| remove-and-redeploy across turns (Vanish) | `removeFromBoard` + `schedule(place)` |
| both-values-unknown edge predicate (Schrödinger) | `custom` |

Expected `custom` usage across the five decks: ~3 cards — within budget.

## 13. Authoring conventions (seed for the future conversion skill)

- One file per deck: `data/heroes/<hero-id>.rules.ts`, exporting
  `{ hero: HeroDef, cards: Record<CardId, CardDef> }`. Card ids `<hero-id>/<card-slug>`.
- Every card ships with: (a) a per-card scenario test, (b) a passing English
  readback — `renderOps(cardDef)` must round-trip to text a reviewer can diff
  against the printed card. Both are generated during conversion; the deck merges
  only when its golden replay passes.
- Cards that don't decompose cleanly are flagged `NEEDS-PRIMITIVE` in review —
  never force-fit. New primitives require: appears ≥2× in the corpus, or blocks a
  launch deck.
- The reducer must reject any op the engine version doesn't know
  (forward-compatibility: deck data is versioned with `dslVersion`).

## 14. Decisions adopted & still open

Adopted here (from 02 §10): cancels hit unresolved blocks only (#1); cancel scope
authored per card (#2); printed-value immunity vs cancelable value-effects (#3);
simultaneous hero death → active player wins (#4, community ruling, flagged in
rules doc); `attackerWon` computed once at damage calc (#5); move-vs-place
normalized per card at authoring (#9); hero abilities as trigger data (#10).

Still open (fine to defer past engine start):
1. `bonusAttack` nesting details — second defense card, swap-in retargeting
   (02 [OPEN] 8) — needs test-first implementation when the first deck using it lands.
2. Exact `PAY_COST` UX pacing for `oppMay` chains (Pinocchio negotiation loops) —
   resolve during Pinocchio authoring.
3. Whether `SCHEME` bodies ever need sub-windows (none in the five decks).
