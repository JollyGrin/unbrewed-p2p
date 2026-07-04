# Deck Corpus Analysis — Toward a Rules-Engine DSL

**Corpus:** the 30 most-liked community decks on unmatched.cards.
**Source API:** `https://unbrewed-api.vercel.app/api/unmatched-deck/{id}` (all 30 returned HTTP 200; raw JSON saved to scratchpad, not the repo).
**Deck shape:** `deck_data.{ hero, sidekick, extraCharacters, cards[], appearance, ruleCards }`. Each card carries `title, type (attack|defence|scheme|versatile), value, boost, quantity, immediateText, duringText, afterText, basicText, imageUrl`. `ruleCards` was empty (`[]`) for every deck. Two decks use `extraCharacters` (Frankenstein, Predator, One Punch Man flagged it) but the meaningful data all lives in `cards` + `hero` + `sidekick`.

**Method:** 901 physical card copies across 30 decks were flattened; every non-empty effect-text field (plus hero special abilities) became one **effect-text unit** — 480 units total. Units were tagged against a regex-based primitive classifier, then hand-audited. Numbers below are unit-level unless stated.

---

## 1. Corpus Overview

`eff`/`van` = card copies (weighted by quantity) that carry effect text vs. those that are pure vanilla combat math. `v`/`b` = value / boost range. Every deck is exactly 30 cards except Sans (31).

| Deck | HP | Mv | Rngd | Sidekick (hp×q, rngd) | Special ability (short) | Uniq | Type mix (A/D/S/V) | Val | Boost | Eff/Van | Likes |
|---|---:|---:|:--:|---|---|---:|---|:--:|:--:|:--:|---:|
| The Mandalorian | 14 | 2 | Y | The Child (5×1) | +def per BESKAR ARMOR in discard | 15 | 11/2/4/13 | 1–6 | 0–4 | 30/0 | 144 |
| John Wick | 15 | 3 | Y | — | — | 18 | 8/4/5/13 | 1–4 | 1–3 | 30/0 | 137 |
| The Devil | 15 | 2 | n | — | — | 15 | 7/5/6/12 | 2–5 | 1–4 | 30/0 | 126 |
| Schrödinger's Cat | 13 | 2 | n | The Analytical Engine (rngd) | ties become **UNKNOWN** (no winner/loser) | 12 | 9/4/6/11 | 2–4 | 1–4 | 30/0 | 112 |
| Victor Frankenstein | 8 | 3 | n | the monster | — | 14 | 8/4/7/11 | 2–6 | 1–3 | 27/3 | 110 |
| Death (Puss in Boots) | 12 | 3 | n | — | — | 13 | 11/5/2/12 | 0–5 | 1–4 | 30/0 | 96 |
| Darth Vader (TAYTERTOTS) | 15 | 2 | n | Stormtroopers (×3) | — | 14 | 8/3/5/14 | 0–4 | 1–3 | 30/0 | 93 |
| Goldhorn | 9 | 3 | n | — | — | 12 | 7/4/5/14 | 0–4 | 1–3 | 30/0 | 81 |
| Gingerbread Man | 13 | 4 | n | Fox (8×1) | — | 13 | 12/2/3/13 | 2–5 | 1–4 | 30/0 | 75 |
| The Flash | 15 | 4 | n | Impulse | boost-a-maneuver → **SPEED FORCE** state | 11 | 7/0/5/18 | 2–4 | 1–4 | 30/0 | 69 |
| Jason Voorhees | 17 | 2 | n | — | — | 12 | 10/4/4/12 | 0–13 | 0–4 | 30/0 | 68 |
| The Batman | 15 | 2 | n | Robin | — | 13 | 5/2/4/19 | 1–4 | 1–3 | 30/0 | 64 |
| Deku | 15 | 3 | n | — | — | 12 | 9/3/4/14 | 1–6 | 1–3 | 30/0 | 63 |
| King Kong | 32 | 1 | n | — | large fighter; start-of-turn self-dmg → opp discards | 12 | 15/5/3/7 | 1–8 | 1–4 | 30/0 | 63 |
| The Predator | 14 | 3 | Y | — | — | 12 | 9/2/2/17 | 1–5 | 1–3 | 30/0 | 59 |
| King Solomon | 16 | 2 | n | — | — | 12 | 8/5/8/9 | 2–4 | 1–4 | 30/0 | 58 |
| Baba Yaga | 11 | 2 | n | The Hut (13×1) | Hut-board adjacency; EOT dmg to fighters in Hut | 13 | 6/6/4/14 | 0–4 | 1–3 | 30/0 | 56 |
| The Rocketeer | 16 | 2 | n | — | — | 14 | 7/4/5/14 | 1–5 | 1–3 | 28/2 | 55 |
| Voldemort | 4 | 2 | Y | Nagini (14×1) | — | 13 | 10/2/5/13 | 1–4 | 1–4 | 30/0 | 53 |
| The Terminator | 17 | 2 | Y | — | — | 13 | 8/5/4/13 | 1–4 | 0–4 | 30/0 | 53 |
| Pinocchio | 15 | 2 | n | Il Grillo (6×1) | switch attack post-reveal → gain **Lie token** | 12 | 9/2/3/16 | 1–6 | 1–4 | 30/0 | 51 |
| One Punch Man | 999 | 2 | n | Genos | — | 14 | 8/2/5/15 | 1–5 | 0–2 | 28/2 | 51 |
| Headless Horseman | 13 | 2 | n | The Horse (8×1) | — | 14 | 9/4/7/10 | 1–7 | 1–4 | 30/0 | 48 |
| Sans | 1 | 2 | Y | — | — | 15 | 9/8/7/7 | 0–5 | 0–3 | 31/0 | 46 |
| The Juggernaut | 20 | 2 | n | — | — | 11 | 10/6/5/9 | 0–4 | 0–4 | 30/0 | 45 |
| Hannibal Lecter | 15 | 3 | n | — | — | 14 | 7/6/7/10 | 1–5 | 1–3 | 30/0 | 44 |
| Doctor Who | 3 | 2 | n | Tardis (7×1) | — | 13 | 9/8/4/9 | 0–5 | 1–3 | 30/0 | 43 |
| Beowulf | 17 | 2 | n | Wigy (9×1) | custom **Swagger** resource | 12 | 11/3/7/9 | 1–4 | 1–3 | 30/0 | 43 |
| Ghostface | 10 | 2 | n | — | — | 16 | 11/3/5/11 | 0–5 | 0–3 | 30/0 | 42 |
| Darth Vader (JackNorth) | 18 | 2 | n | STORMTROOPERS (×3) | — | 12 | 15/2/4/9 | 1–8 | 0–3 | 30/0 | 41 |

Notes: "Sidekick" with `hp=None, q=0` means the JSON carries a placeholder, not a real board sidekick — 8/30 decks have a true sidekick with HP; the two Vaders field 3× Stormtrooper swarms. HP outliers are deliberate gimmicks: One Punch Man (999, "can't lose"), Sans (1, dodge-everything), Doctor Who (3, regenerates), Voldemort (4, glass cannon), King Kong (32, tank). Jason's value "13" is a single monster card; his 0-value cards are schemes.

---

## 2. The "Average Deck" Profile

The statistical center the engine must comfortably represent:

- **Deck size:** 30 cards, ~13 unique titles (so ~2.3 copies each). Type mix, pooled across all 901 copies:
  **versatile 40.8% · attack 30.3% · scheme 16.1% · defence 12.8%.** Versatile is the single largest class — the engine's default card is a value+boost card playable as either attack or defence.
- **Hero HP:** mean 13.7, **median 15**, typical band 10–18 (excluding the five gimmick heroes). 15 is by far the modal value.
- **Hero move:** mean 2.33, **median 2** (20/30 decks), a few 3s, two 4s (Flash, Gingerbread), one 1 (Kong). Move is a small integer 1–4.
- **Ranged heroes:** 6/30 (20%). Ranged is the exception; melee/adjacency is the default.
- **Sidekick:** ~1/3 of decks (8/30 real, plus 2 swarm decks). When present, HP 5–14, usually quantity 1.
- **Value curve** (901 copies): centered on **3** (median 3, mean 2.79). Distribution: 0→28, 1→77, 2→194, **3→270**, 4→141, 5→27, 6→11, 7→2, 8→5, 13→1. ~90% of cards sit in value 1–4.
- **Boost curve:** centered on **2** (median 2, mean 1.93). Distribution: 0→20, 1→260, **2→410**, 3→184, 4→27. Boost is essentially always 1–3.
- **Effect density:** effects-per-deck mean **29.8 / 30** — pure-vanilla cards are vanishingly rare in *community* decks (only 7 vanilla copies in the entire 901-card corpus). This differs sharply from official Unmatched, where blank cards are common. **But most of that text is trivial:** 129 of 480 units (27%) are single-primitive one-liners ("Draw 1 card", "Recover 2 health", "Move up to 3 spaces"). The right mental model is *"almost every card has text, but a quarter of it is one atomic effect and most of the rest is two atoms glued by a combat-outcome conditional."*

**Baseline the engine must nail first:** a 30-card deck of value≈3 / boost≈2 versatile-and-attack cards, one 15-HP move-2 melee hero, an optional single sidekick, where the dominant card does simple combat math plus one small after-combat effect gated on whether you won.

---

## 3. Effect Vocabulary (the core)

### 3.1 Primitive frequency table

480 effect-text units. A unit can hit multiple primitives (it's a bag of atoms), so percentages sum past 100. Percent = share of all 480 units mentioning that primitive family.

| Primitive family | Units | % of units | Notes |
|---|---:|---:|---|
| **conditional** (if / when / for-each / unless) | 256 | **53.3%** | The connective tissue. See §3.3 for what they test. |
| **move-fighter** (move / place / push / teleport N, self or opponent) | 108 | 22.5% | Self-move, opponent-move, and "place in any space" all live here. |
| **draw** (draw N, often "draw more if you won") | 82 | 17.1% | |
| **deal-damage** (direct/AoE/zone damage outside normal combat) | 82 | 17.1% | Includes "deal N to all in zone" and self-damage costs. |
| **modify-value** (set/±N to a card's value, incl. dynamic) | 78 | 16.2% | Often "value is 6 instead if…"; frequently dynamic (=opp hand size, =zones, =MOVE). |
| **zone/range-test** (adjacent / inside / spaces-away) | 69 | 14.4% | Predominantly a *condition*, occasionally a targeting constraint. |
| **opponent-discard** (opp discards N, sometimes random) | 65 | 13.5% | |
| **boost / facedown play** (BOOST, BLIND BOOST, play face-up) | 57 | 11.9% | Boosting = playing a card face-down to add its boost value; several decks manipulate this. |
| **heal** (recover/gain N health) | 55 | 11.5% | Almost always small, fixed 1–3. |
| **timing/duration** (this turn / next turn / until end / start-of-turn) | 48 | 10.0% | Delayed and lingering effects. |
| **cancel / ignore effects** | 42 | 8.8% | "Cancel all effects on your opponent's card" is a recurring exact phrase. |
| **action-economy** (gain/lose N actions) | 34 | 7.1% | |
| **random selection** (discard/select at random) | 30 | 6.2% | |
| **defeat-instant / remove-from-board** | 28 | 5.8% | Includes benign "remove self, redeploy" (Vanish) and lethal effects (Sans). |
| **spend-card cost** (discard from hand as a cost) | 20 | 4.2% | |
| **reveal** (reveal hand / a card) | 19 | 4.0% | |
| **shuffle** (deck / card back into deck) | 15 | 3.1% | |
| **return-to-hand** (retrieve a card to hand) | 14 | 2.9% | |
| **choose-1-of-N effect** (modal cards) | 13 | 2.7% | |
| **token / counter** (Lie, Swagger, Momentum, charges) | 13 | 2.7% | Concentrated in 3–4 decks; see one-offs. |
| **prevent / reduce damage** (prevent all, halve) | 12 | 2.5% | |
| **retrieve-from-discard** | 9 | 1.9% | |
| **search-deck** (tutor / look at top N) | 7 | 1.5% | |
| **card-count test** (hand size gates an effect) | 7 | 1.5% | |
| **self-discard** | 5 | 1.0% | |
| **skip / lose turn** | 2 | 0.4% | |

### 3.2 Timing-label distribution

Of the 450 card-level units (excluding 30 hero abilities):

- **afterText 44.7%** (201) — resolves *after* combat is decided; overwhelmingly the home of "if you won, do X".
- **basicText 22.7%** (102) — scheme-card bodies and *play restrictions* ("may only attack an adjacent fighter", "play face up"). Note `basicText` mixes two distinct roles: the whole effect of a scheme, and a static constraint on a combat card.
- **duringText 22.0%** (99) — modifies the combat itself: value changes, "cancel all effects", boost interactions. Resolves *before* the winner is known.
- **immediateText 10.7%** (48) — fires on reveal, before values are compared (cancels, value-set, "ignore defense").

**Implication for the DSL:** a card is a small ordered program with up to four timing slots — `on-reveal (immediate) → during-combat (modify) → resolve (winner determined) → after-combat`, plus a static `constraints/basic` layer. ~45% of all logic hangs off the after-combat hook, and the branch it tests is almost always the combat outcome.

### 3.3 What the 256 conditionals actually test

| Condition tests… | Count | % of conditionals |
|---|---:|---:|
| **combat outcome** (won / lost / tie / UNKNOWN) | 81 | 31.6% |
| **zone / range / position** (adjacent, inside, spaces away) | 61 | 23.8% |
| **movement / spaces traveled this turn** (unique spaces, MOVE value) | 37 | 14.5% |
| **card / hand count** (cards in hand, "for each card") | 26 | 10.2% |
| **token / hero-state** (Lie tokens, SPEED FORCE, TRUTHFUL) | 20 | 7.8% |
| **BOOST-value match** (your boost vs opponent's boost) | 14 | 5.5% |
| **HP threshold** (≤N health, "not defeated") | 7 | 2.7% |
| **ability-triggered** ("if this card was switched in") | 3 | 1.2% |

Over half of all branching reduces to **combat-outcome** or **zone/range**. If the DSL expresses just two predicates well — `won_combat() / lost_combat() / is_unknown()` and `distance/zone(a, b)` — it covers the majority of conditional logic in the corpus.

### 3.4 One-off / hard-to-categorize effects (verbatim)

These resist the primitive set and are the reason the two stress decks exist. Quoted with deck / card:

- **Dynamic value = a game-state count:**
  - Darth Vader (TAYTERTOTS) / *Form 5*: "This card's value is equal to the amount of card's in your opponent's hand."
  - The Juggernaut / *UNSTOPPABLE FORCE*: "This card's value is equal to Juggernaut's Momentum value." (custom resource)
  - King Kong / *Jaw of the Beast*: "For each zone the opposing fighter is in, increase the value of this card by +1."
  - The Flash / *Infinite Mass Punch*: "+1 to this card for every unique space Flash was in this turn." (requires per-turn movement history)
- **Player-tunable value (choice, not a fixed delta):**
  - Schrödinger's Cat / *Broken Reality* & Death / *Laughing in the face of death*: "You may increase or decrease the value of this card by 1."
  - Doctor Who / *Something else up my sleeve*: "You may increase the value of the opponent's card by 1." (buffing the *opponent* — unusual direction)
- **Fractional math:**
  - Gingerbread Man / *Cookie cutter*: "Decrease your opponent's card value in half rounded down."
  - Headless Horseman / *Veteran's Intuition*: "The damage that the fighter would have taken is halved (rounded up)."
  - Goldhorn / *unmoving like a mountain*: "Goldhorn cannot take more than 1 combat damage this combat." (damage cap)
- **Custom player resource — Beowulf's "Swagger" (a whole parallel economy in slang):**
  - *Cool Story, Bro*: "Gain 1 Swagger."
  - *Cool Sword, Bro*: "You can dump 2 Swagger to make this card's value 5 instead. You can dump 1 Swagger to PUMP this card."
  - *Throwing Hands*: "…dump 2 Swagger to scrape up that other bro so they drop as much clout as the printed value of their card." (spend resource to force opponent damage = their own card value)
  - *Juked*: "Shut down all the strats on your opponent's card." (= cancel all effects, in slang)
  - *I'm Heated, Bro*: "Wigy can go ahead and swap spaces with Beowulf." (position swap)
- **Value floors that can't be modified:**
  - The Predator / *Impossible to See*: "The value of your opponent's attack or defense is 0 and cannot be changed by card effects. (Other card effects still happen.)"
- **Uncancellable / meta effects:**
  - Pinocchio / *No Strings Attached*, *Heartwood*: "This effect cannot be cancelled." (a flag on other primitives)
- **Novel combat state:** Schrödinger's UNKNOWN result (see §5); Sans's dodge/instant-defeat (see complexity notes).

---

## 4. Complexity Scoring (1 = trivial combat math, 5 = needs new engine subsystems)

| Deck | Score | Justification |
|---|:--:|---|
| King Kong | **2** | Brawler; self-damage costs + BLIND BOOST + simple zone AoE. One mild board-state need (boosted-card retrieval). |
| Baba Yaga | **2** | Very regular: one recurring "if inside The Hut" zone conditional scales fixed effects; needs a custom sub-board but the *logic* is clean. |
| The Batman | **2** | Movement + opponent-discard + zone control; no tokens, no exotic state. |
| Voldemort | **2** | Glass cannon; damage/draw/move with stacked conditionals but zero exotic primitives. |
| Deku | **2** | Mobility + value mods; conventional. |
| Gingerbread Man | **2** | Mostly vanilla-ish aggro; one fractional-value card. |
| The Devil | **3** | Modal "choose an effect" contracts between players; interactive but bounded. |
| John Wick | **3** | Discard-heavy tempo, many modal/branching cards, but all from standard primitives. |
| The Mandalorian | **3** | Hero ability reads discard pile; "if The Child is alive" checks; modal search. |
| Goldhorn / Death / Predator / Terminator / Rocketeer / Solomon / Hannibal / Ghostface / Headless / Juggernaut / Kong-tier | **3** | Standard primitive mixes with a distinctive twist each (damage cap, reveal/tutor, value floor, etc.). |
| Darth Vader (both) | **3** | Stormtrooper swarm = multi-body sidekick management; otherwise standard. |
| The Flash | **3** | Clean primitives BUT introduces the **SPEED FORCE** hero-state boolean gating a `⚡` mode on nearly every card, plus per-turn movement tracking and "cancel all effects". |
| Jason Voorhees | **3** | Recursion/relentless-attacker patterns; a couple of unusual cards. |
| One Punch Man | **4** | 999-HP "cannot lose" premise bends the win condition; needs alternate loss/serious-mode modeling. |
| Doctor Who | **4** | Highest multi-primitive density (11 units chain 3+ atoms); regeneration, Tardis sub-board, 3-HP survival economy. |
| Sans | **4** | 1-HP hero whose whole design is dodge/prevent + **instant-defeat** KARMA effects; inverts normal damage math. |
| Beowulf | **5** | Custom **Swagger** resource economy with spend-to-modify choices, value-set, position swap, opponent-damage = card value; plus prose written in slang the parser can't lean on. |
| Schrödinger's Cat | **5** | Adds a **third combat outcome (UNKNOWN)** that ~half the deck branches on ("do both"), board remove-and-redeploy, boost-value matching, discard-to-deck recursion — stresses the *core* resolution model, not just effects. |
| Pinocchio | **5** | **Lie-token** subsystem with a max cap, opponent-interactive token *removal* as an on-going negotiation, ability-triggered "if switched in" conditionals, delayed cross-turn buffs, and "cannot be cancelled" meta-flags. |

---

## 5. Recommendation: the 5 decks

### Three launch decks (low complexity, representative, popular)

**1. King Kong** *(likes 63, complexity 2).* Iconic IP; the canonical heavy brawler (32 HP, move 1). Its cards are the corpus's clearest expression of the core loop — big attacks, self-damage costs, zone AoE, boost tricks — with essentially no exotic state. Great "does the combat engine feel right" deck.

**2. Baba Yaga** *(likes 56, complexity 2).* The cleanest *conditional* deck: nearly every card is `fixed effect, upgraded if Baba Yaga is inside The Hut`. It exercises zone tests, forced opponent movement, and a custom sub-board while keeping the logic dead-regular — an ideal readability test for the zone/position layer.

**3. The Flash** *(likes 69, complexity 3\*).* The most-liked of the low-complexity tier and a third distinct archetype (mobility/tempo). It introduces exactly one piece of hero state — the **SPEED FORCE** boolean that unlocks `⚡` card modes — which is a valuable, *bounded* test of hero-state without tokens. *If the team wants to minimize launch risk further, swap Flash → **Voldemort** (likes 53, complexity 2): same-tier simplicity, huge IP, glass-cannon flavor, zero exotic state.*

Together these three cover brawler / zone-control-summoner / mobility-tempo, span melee and the SPEED-FORCE state pattern, and need no tokens or changes to the combat-resolution core.

### Two stress-test decks (maximize DSL coverage of the hard stuff)

**4. Pinocchio** *(likes 51, complexity 5).* The token stress test. **Lie tokens** are a persistent, capped, hero-level resource generated by the *ability* (post-reveal attack switch), spent *interactively by the opponent* mid-effect, counted for scaling, and cleared for delayed cross-turn buffs — plus "this effect cannot be cancelled" meta-flags. It pressures persistent state, reaction windows, and effect metadata all at once.

**5. Schrödinger's Cat** *(likes 112, complexity 5).* The core-model stress test, and by far the most popular of the complex decks. Its ability makes ties resolve as a **third outcome, UNKNOWN**, and ~half the deck branches `if you won… / if you lost… / if UNKNOWN, do both`. It also does board remove-and-redeploy (Vanish), boost-value matching, and discard-pile→deck recursion. Where Pinocchio stresses *effect state*, Schrödinger stresses the *combat-resolution state machine* itself — a complementary pair. (Runners-up, if a different axis is wanted: **Beowulf** for a fully custom player-resource economy, **Sans** for instant-defeat/dodge inverting damage math.)

### Per-card breakdown of the 5

Notation: `deal_damage(n, target)`, `draw(n)`, `move(who, n, {through_fighters})`, `place(who, region)`, `opp_discard(n, {random})`, `modify_value(card, expr)`, `heal(n)`, `gain_actions(n)`, `boost(card, {blind})`, `cancel_effects(target)`, `if(pred){…}`. Predicates: `won()/lost()/unknown()`, `in_zone(x)/adjacent()`, `at_hut()`, `speed_force()`. **NEEDS NEW PRIMITIVE** flags gaps.

#### King Kong — hero ability: `at_start_of_turn: optional deal_damage(1,self) → then opp_choose(adjacent).opp_discard(1)`
| Card | Effect | Decomposition |
|---|---|---|
| eighth wonder of the world (A8) | AFT deal 3 to Kong, end turn; BAS only if not maneuvered this turn | `deal_damage(3,self); end_turn()` · constraint `not_maneuvered_this_turn()` |
| Irresistible force (A2) | DUR opp may boost, then you may boost | `opt_boost(opp_card); opt_boost(self_card)` |
| Smash and grab (A4) | AFT if won, place opp adjacent to Kong, set their move 0 next turn | `if(won()){ place(opp, adjacent_to(Kong)); set_move(opp,0,next_turn) }` — **NEEDS NEW PRIMITIVE: set_move-override(duration)** |
| A king, nay - a god (A1) | DUR blind-boost twice; AFT return one boosted card to hand | `boost(self,blind)×2; return_boost_card_to_hand()` — **NEEDS: retrieve-a-committed-boost-card** |
| reCKLESS LUNGE (A3) | AFT deal 3 to opp, then take 3 | `deal_damage(3,opp); deal_damage(3,self)` |
| clobber (V3) | AFT if won, deal 1 to each opp in Kong's zone | `if(won()){ deal_damage(1, each(opp in zone(Kong))) }` |
| Jaw of the Beast (V2) | DUR +1 per zone the opp occupies | `modify_value(self, +count_zones(opp))` — dynamic value |
| Regroup (V1) | AFT draw 1, draw 2 instead if won | `draw(1); if(won()){ draw(+1) }` |
| pounce (D2) | AFT move Kong up to damage received | `move(Kong, up_to=damage_received_this_combat())` — dynamic amount |
| Immovable object (D2) | AFT draw 3 | `draw(3)` |
| The King is coming! (Sch) | deal 3 to Kong, gain 2 actions; or discard random for 3 actions | `deal_damage(3,self); gain_actions(2)`; modal `opp_discard? no — self_discard(random)→gain_actions(3)` |
| Crash through the Trees (Sch) | move Kong up to 5 through fighters | `move(Kong,5,{through_fighters})` |

#### The Flash — hero ability: `on boost_maneuver: enter(SPEED_FORCE); while speed_force(): resolve ⚡; at_end_of_turn: exit(SPEED_FORCE)`
| Card | Effect | Decomposition |
|---|---|---|
| Born to run (V3) | IMM ⚡ value=5; AFT if moved this turn, place in vacant start space | `if(speed_force()){ set_value(5) }; if(moved_this_turn()){ place(Flash, vacant_start_space()) }` |
| Blink of an eye (V3) | DUR ⚡ reduce opp printed value by their MOVE; AFT move 3 | `if(speed_force()){ modify_value(opp, -move_of(opp)) }; move(Flash,3)` |
| Unforgiving Minute (V4) | AFT move both fighters 3; ⚡ may end turn | `move(both,3); if(speed_force()){ opt_end_turn() }` |
| Chain Lightning (V2) | AFT draw 2; ⚡ if attack, gain action | `draw(2); if(speed_force() and played_as_attack()){ gain_actions(1) }` |
| Terminal Velocity (V3) | AFT take 1, deal 2; ⚡ instead deal 1 to all adjacent | `if(speed_force()){ deal_damage(1,each(adjacent_opp())) } else { deal_damage(1,self); deal_damage(2,opp) }` |
| Into the multiverse (Sch) | name a value; gain health = opp cards of that value, else they reveal hand | `heal(count_in_opp_hand(named_value)); if(==0){ opp_reveal_hand() }` — **NEEDS: name-a-value input + count-hand-by-value** |
| Speed Formula (Sch) | place Flash in zone, gain action; ⚡ gain 2 | `place(Flash, in_zone()); gain_actions(speed_force()?2:1)` |
| speed Blitz (V2) | IMM cancel all opp effects; ⚡ reduce printed value to 0; BAS play from MOVE spaces away | `cancel_effects(opp); if(speed_force()){ set_value(opp,0) }` · constraint `play_range = move_of(Flash)` |
| The Fastest man alive (A3) | DUR + opp MOVE to value; AFT ⚡ stay in SPEED FORCE until next turn | `modify_value(self, +move_of(opp)); if(speed_force()){ persist(SPEED_FORCE, until=next_turn_start) }` |
| Swift Strike (A3) | AFT move 4 | `move(Flash,4)` |
| Infinite Mass Punch (A3) | DUR +1 per unique space this turn; AFT ⚡ can't enter SPEED FORCE next turn | `modify_value(self, +unique_spaces_this_turn()); if(speed_force()){ deny(SPEED_FORCE, next_turn) }` — **NEEDS: per-turn movement-history tracking** |

#### Baba Yaga — hero ability: `hut_entry_adjacency(); at_end_of_turn: for each opp inside Hut { deal_damage(1); place(opp, in_zone(Hut)) }`
| Card | Effect | Decomposition |
|---|---|---|
| Iron Teeth (A3) | AFT heal 1; heal 2 if at Hut | `heal(at_hut()?2:1)` |
| Boney Leg (V2) | AFT opp discard 1; random if at Hut | `opp_discard(1, {random: at_hut()})` |
| The Devil's Grandmother (A4) | DUR value 6 if at Hut | `if(at_hut()){ set_value(6) }` |
| Behave! (D3) | AFT deal 1; deal 2 if at Hut | `deal_damage(at_hut()?2:1, opp)` |
| Turn your back to the forest (V2) | AFT move opp 3 through fighters; draw 1 | `move(opp,3,{through_fighters}); draw(1)` |
| Pestle and Mortar (V3) | AFT move Baba 3 through fighters; draw 1 | `move(Baba,3,{through_fighters}); draw(1)` |
| Enhanced Awareness (D1) | IMM discard this to play a different defence | `discard(self)→play_from_hand(type=defence)` — **NEEDS: swap-defence mid-combat** |
| Bewilderment (D0) | IMM prevent all damage; AFT place Baba anywhere | `prevent_all_damage(); place(Baba, anywhere)` |
| Magical Compulsion (Sch) | move 2 opps 3 each; if end inside Hut, discard 1 | `move(2×opp,3); if(ended_in(Hut)){ opp_discard(1) }` |
| Abduction (A4) | AFT place opp inside Hut + Baba adjacent; if won gain action | `place(opp, in(Hut)); place(Baba, adjacent); if(won()){ gain_actions(1) }` |
| Skirmish (V4) | AFT if won, move a combatant 2 | `if(won()){ move(choose(combatants),2) }` |
| Chicken Legs (V3) | AFT move Hut 4 through fighters; deal 1 to each it passed | `move(Hut,4,{through_fighters}); deal_damage(1, each(passed_through()))` — **NEEDS: path-of-movement targeting** |
| Spinning Rampage (Sch) | deal 2 to each opp in Hut, 1 to each adjacent to Hut | `deal_damage(2, each(opp in Hut)); deal_damage(1, each(opp adjacent Hut))` |

#### Pinocchio — hero ability: `once_per_turn if opp_defended: swap_declared_attack(from_hand) → gain_token(Lie); blocked if tokens==MAX`
| Card | Effect | Decomposition |
|---|---|---|
| No Strings Attached (A5) | DUR opp may remove any Lie tokens, −1 value each; BAS uncancellable | `opp_may_remove(Lie, k); modify_value(self, -k)` · flag `uncancellable` — **NEEDS: opponent-drains-your-token-as-tradeoff + uncancellable flag** |
| cri-cri-cri (V1) | DUR remove all Lie, +2 value each; AFT if none removed, opp discard random | `k=remove_all(Lie); modify_value(self,+2k); if(k==0){ opp_discard(1,random) }` |
| a bit on the nose (V4) | AFT if switched-in, deal 2 | `if(was_switched_in()){ deal_damage(2,opp) }` — **NEEDS: ability-provenance predicate** |
| Blood, Sweat…/…And Varnish (A2) | AFT if switched-in, heal 1 (two-part linked card) | `if(was_switched_in()){ heal(1) }` — **NEEDS: multi-part/linked card** |
| Heartwood (D6) | DUR opp may remove Lie, −2 value each; uncancellable | `opp_may_remove(Lie,k); modify_value(self,-2k)` · `uncancellable` |
| Never learns (V3) | AFT draw = Lie in play; opp may remove Lie → put that many drawn on deck bottom | `draw(count(Lie)); opp_may_remove(Lie,k)→bottom_deck(k)` |
| Just a Marionette and a Bug (V3) | IMM cancel opp effects; DUR value −1 per Lie | `cancel_effects(opp); modify_value(self, -count(Lie))` |
| I'm a Real Boy! (Sch) | remove all Lie; next turn attacks +1 each removed; ends turn if not last action | `k=remove_all(Lie); grant(next_turn: attacks +k); if(not_last_action){ end_turn() }` — **NEEDS: delayed cross-turn buff w/ reminder token** |
| The Real Mr. Pointy (V3) | DUR value 5 if switched-in | `if(was_switched_in()){ set_value(5) }` |
| Lies can easily be recognized (A2) | DUR opp discard random, +its boost to value; if opp removes a Lie, you also discard random +its boost to their card | `opp_discard(1,random); modify_value(self, +boost_of(discarded)); if(opp_removed_Lie){ self_discard(random); modify_value(opp, +boost_of(that)) }` |
| High Strung (V4) | AFT move hero 4; opp may remove a Lie to cancel this card | `move(Pinocchio,4); opp_may_remove(Lie,1)→cancel_effects(self)` — **NEEDS: opponent-cancels-by-spending-your-token** |
| Make Amends Pinocchio! (Sch) | remove 1 Lie; if then TRUTHFUL heal 3, else heal 1 | `remove(Lie,1); heal(is_truthful()?3:1)` — `is_truthful()` = tokens==0 state predicate |

#### Schrödinger's Cat — hero ability: `on_combat_tie: result = UNKNOWN (no winner/loser)`
| Card | Effect | Decomposition |
|---|---|---|
| chance of life or death (A3) | IMM if boost matches opp's boost, ignore defense | `if(boost_of(self)==boost_of(opp)){ ignore_defense() }` — **NEEDS: boost-match predicate + ignore-defense** |
| Feral Strike (A4) | AFT won→draw 2; lost→take 1; UNKNOWN→both | `on(won){draw(2)} on(lost){deal_damage(1,self)} on(unknown){both}` — **NEEDS: 3-way outcome incl. unknown()** |
| Killed by curiosity (Sch) | reveal a card; opp discards equal-boost card, else a fighter takes that boost as damage | `reveal(self_card); opp_discard(match_boost) else deal_damage(boost_val, choose(fighter))` |
| A state of Flux (V3) | won→opp discard; lost→heal 2; UNKNOWN→both | `on(won){opp_discard(1)} on(lost){heal(2)} on(unknown){both}` |
| Both alive and dead (Sch) | heal 1; discard top of deck, heal = its boost | `heal(1); mill_self(1); heal(+boost_of(milled))` |
| Broken Reality (V3) | DUR ±1 value (choice); AFT won→deal 2, lost→place self in zone, UNKNOWN→both | `opt_modify_value(±1); on(won){deal_damage(2)} on(lost){place(self,in_zone)} on(unknown){both}` |
| Feint (V2) | IMM cancel opp effects | `cancel_effects(opp)` |
| Receiving Life or Death (D4) | AFT opp draws = damage they dealt; UNKNOWN→Cat heals 1 | `opp_draw(damage_dealt_by_opp()); if(unknown()){ heal(1) }` |
| All is Unknown inside the Box (D3) | AFT shuffle a discard card into deck per damage taken; UNKNOWN→deal 1 to all adjacent | `shuffle_from_discard(count=damage_taken()); if(unknown()){ deal_damage(1, each(adjacent())) }` |
| Vanish (Sch) | heal 1; remove Cat from board; next turn place anywhere; end turn if first action | `heal(1); remove_from_board(Cat); at_next_turn_start{ place(Cat, anywhere) }; if(first_action){ end_turn() }` — **NEEDS: remove-and-redeploy across turns** |
| Infinite Possibilities (A4) | won→draw 2 then shuffle 2 from hand; lost→gain action; UNKNOWN→both | `on(won){draw(2); shuffle_from_hand(2)} on(lost){gain_actions(1)} on(unknown){both}` |
| A Cat's Paw (V3) | DUR if both printed values UNKNOWN, value 5 | `if(both_values_unknown()){ set_value(5) }` — edge predicate on comparison |

---

## 6. Implications for the DSL

1. **A card is a 4-slot timed program, not one expression.** Model `on_reveal (immediate) → during_combat (value math) → resolve (winner decided) → after_combat`, plus a static `constraints/basic` layer. ~45% of all logic lives in the after-combat slot; only ~11% in immediate.
2. **`basicText` is overloaded — split it.** It carries both whole scheme-card bodies *and* static play constraints ("may only attack adjacent", "play face up", "cannot be cancelled"). The DSL needs a separate `constraints{}` block distinct from `effect{}`.
3. **Combat outcome is the dominant branch — and it's ternary here.** 31.6% of conditionals test won/lost/tie. Because of Schrödinger, design the outcome as `{win, lose, tie/UNKNOWN}` from day one; "if UNKNOWN, do both" is a first-class pattern, not a hack.
4. **Ship the combat core + ~8 primitives and you cover most of the corpus.** `deal_damage, draw, move/place, opp_discard, heal, gain_actions, modify_value, cancel_effects` plus the won/lost conditional account for the large majority of the 480 units. 27% of units are a single one of these atoms.
5. **Conditionals almost always test range/zone, movement, card-count, or outcome — rarely HP.** Build strong `distance/zone/adjacency` and `won/lost` predicates first; HP-threshold tests are <3%.
6. **`modify_value` must accept dynamic expressions, not just constants.** "value = opponent's hand size / zones occupied / your MOVE / a resource counter / unique spaces moved" recur. Value is a computed expression over game state, and sometimes a *player choice* ("you may ±1").
7. **Movement is the second-biggest primitive (22.5%) and needs rich parameters:** target (self / opponent / both / sidekick / a summoned sub-board like The Hut), distance (fixed or dynamic), and flags (`through_fighters`, `to any space`, `to a specific region`). Add "path-of-movement" targeting for cards that damage everything moved through.
8. **Boosting is a mechanic, not just a number.** ~12% of units interact with the face-down boost: blind/forced boosting, retrieving a committed boost card, matching boost values, adding a discarded card's boost to a value. The engine must represent the boost as a manipulable object.
9. **Persistent state is required but rare and localized.** Tokens/counters (Lie, Swagger, Momentum, SPEED FORCE) appear in only ~4–5 decks but are load-bearing there. Design a generic `counter(owner, name, max?)` + hero-state flags rather than per-deck special-casing; most decks will use none.
10. **Effects need metadata flags.** "This effect cannot be cancelled", "cannot be changed by card effects", and provenance ("if this card was switched in by the ability") mean effects and value-modifications carry attributes the resolver must respect. Plan a flags layer on every effect.
11. **Opponent-interactive effects are real and need a reaction protocol.** Several cards let the *opponent* choose to spend/remove *your* tokens mid-resolution (Pinocchio) or both players pick from a modal menu (The Devil). The DSL needs `opp_choose` / `opp_may(cost → effect)` primitives and a resolution pause.
12. **Delayed and cross-turn effects need a scheduler.** "next turn", "until the start of your next turn", "set this card aside as a reminder", remove-now-redeploy-next-turn. Provide `schedule(at, effect)` and lingering `persist(state, until)`; ~10% of units reference a non-immediate time.
13. **Fractional/rounding and caps appear — bake rounding into the math layer.** "half rounded down/up", "cannot take more than 1 damage". Arithmetic ops need explicit rounding mode; damage application needs a cap/floor hook.
14. **Win-condition and instant-defeat are edge but must be expressible.** One Punch Man (can't lose), Sans (instant-defeat / dodge), Vanish (benign board-removal) all touch the defeat/removal path. Model `remove_from_board` and `defeat` as distinct, and keep the loss condition overridable.
15. **Natural-language prose is not a reliable parse target — the DSL is authored, not scraped.** Beowulf proves effect text can be pure slang ("dump 2 Swagger to make this card's value 5"). The vocabulary above should be the *authoring* interface; card text is flavor. Aim for a small, composable primitive set (~25 families) plus a flags/metadata layer, and accept that a handful of one-offs will always need an `NEEDS NEW PRIMITIVE`/escape-hatch expression.
