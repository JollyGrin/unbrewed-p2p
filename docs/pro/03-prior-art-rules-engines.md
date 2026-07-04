# Prior-Art Rules Engines: Pattern Catalog

> Research distilled from open-source and well-documented digital card/board-game rules
> engines, with concrete recommendations for our server-authoritative TypeScript engine for
> **Unmatched** (turn-based, 2 actions/turn, card-driven combat with IMMEDIATELY/DURING/AFTER
> timing windows, hidden hands, face-down simultaneous commits, board graph of spaces+zones,
> ~10–14 unique cards per deck, LLM-assisted card authoring + human review, golden replay tests).

## Projects surveyed

| Project | Game | Language | Effect representation | Why it matters to us |
|---|---|---|---|---|
| **Forge** | Magic | Java + text DSL | Compact `.txt` card scripts | Gold standard for effect-as-data; LLM-authorable |
| **Fireplace** | Hearthstone | Python | Declarative classes + event listeners | Trigger/event model; a cautionary tale on DSL complexity |
| **jinteki.net** | Netrunner | Clojure | Ability *maps* (data) | Best async-prompt / continuation model we found |
| **boardgame.io** | generic | TypeScript | Moves/phases/stages framework | Client-server + `playerView` redaction + seeded RNG, in *our* language |
| **XMage** | Magic | Java | Full effect *classes* | The verbose extreme — what to avoid at 15 cards/deck |
| **MTG Arena GRE** | Magic | C++ + CLIPS | Rules engine + parsed rules | Legal-action enumeration + auto-pass priority UX |
| **Argentum** (wingedsheep) | Magic | Kotlin/Java | Immutable state + ECS + DSL | Clean reference architecture for determinism/replay |
| **Legends of Runeterra** | LoR | C# + IronPython | Designer-authored scripts | Designer-owns-effects workflow; building-block API |
| **Unmatched: Digital Edition** | Unmatched | (closed, Acram) | — | The only shipped digital Unmatched; structural clues only |

No open-source Unmatched *engine* exists. The community has built card tooling only:
[Unmatched Maker](https://jonathanguberman.github.io/unmatched_maker/) (a card generator) and the
[UMDB card database](https://unmatched.cards/umdb/cards). Unmatched is **not** on Board Game Arena
with rules enforcement. The only shipped digital rules-enforcing implementation is
[Unmatched: Digital Edition by Acram](https://unmatched.acram.eu/) (closed source; Steam early
access Sept 2022, [review](https://dudetakeyourturn.ca/2022/12/27/app-review-early-access-unmatched-battle-of-legends-by-acram-digital/)).
**We are building green field — there is no prior art to copy directly, only patterns to steal.**

---

## 1. Effect representation spectrum

The single most important architectural decision. The spectrum runs from pure data to full code:

### Pattern 1a — Text DSL (Forge)

**Stolen from:** Forge — [Card scripting API](https://github.com/Card-Forge/forge/wiki/Card-scripting-API),
[Creating a custom Card](https://github.com/Card-Forge/forge/wiki/Creating-a-custom-Card).

**How it works.** Each card is a `.txt` file of `Key:Value` lines. Abilities use single-letter
prefixes and pipe-delimited parameters:

```
Name:Shock
ManaCost:R
Types:Instant
A:SP$ DealDamage | Cost$ R | Tgt$ TgtCP | NumDmg$ 2 | SpellDescription$ CARDNAME deals 2 damage to any target.
```

Prefixes: `A:` ability (spell `SP` / activated `AB`), `T:` triggered ability, `S:` static
continuous effect, `R:` replacement effect; sub-abilities chain via `DB$` (drawback) and reusable
values via `SVar$`. Authors are explicitly taught to **"find another card that does the same thing
and copy the ability"** — i.e. effects are recombined from a fixed vocabulary of primitives.
An LLM front-end already exists ([ForgeScribe](https://slightlymagic.net/forum/viewtopic.php?f=52&t=22473)),
proving text scripts are LLM-authorable.

**Tradeoffs.** Extremely compact and diff-friendly; a fixed primitive vocabulary means a new card
is usually *zero* new code. **But** it is stringly-typed — you must write and maintain a parser,
typos fail at load/runtime not authoring time, and IDE/type support is nil.

### Pattern 1b — Declarative classes + listeners (Fireplace)

**Stolen from:** Fireplace — [The Fireplace Card API](https://github.com/jleclanche/fireplace/wiki/1:-The-Fireplace-Card-API).

**How it works.** Each card is a parentless Python class keyed by card ID. Behaviour is declared,
not coded: an `events` list of `EventListener`s built by calling `on()` / `after()` / `once()` on
`Action` objects, plus scripts like `play`, `deathrattle`, and selector-valued attributes:

```python
class EX1_001:  # Lightwarden
    events = Heal().on(Buff(SELF, "EX1_001e"))

class CS2_188:  # Abusive Sergeant
    play = Buff(TARGET, "CS2_188o")
    attack_targets = ENEMY_MINIONS
    atk = lambda self, i: i * 2
```

Static card data (cost, stats, text) is merged in from Hearthstone's own XML `CardDefs`, so scripts
only encode *behaviour*. **Cautionary note from the maintainers themselves:** the Python DSL is
["approaching its limits … its implementation is extremely complex and is due for a rewrite"](https://github.com/jleclanche/fireplace/wiki/Fireplace-2.0).
Embedding a DSL in a host language's class syntax gets you host-language power but pays for it in
metaprogramming complexity.

### Pattern 1c — Ability maps as data (jinteki.net)

**Stolen from:** jinteki.net / [mtgred/netrunner](https://github.com/mtgred/netrunner)
(`src/clj/game/cards/operations.clj`).

**How it works.** A card is a Clojure *map* of hooks to data-plus-closures. Simple cards are pure
data via shared helpers; complex ones drop into effect functions:

```clojure
;; Anonymous Tip
{:on-play (draw-abi 3)}

;; Beanstalk Royalties
{:on-play (gain-credits-ability 3)}

;; 24/7 News Cycle
{:on-play {:additional-cost [(->c :forfeit)]
           :async true
           :req (req (pos? (count (:scored corp))))
           :effect (effect (continue-ability ...))}}
```

Keys: `:req` (legality guard), `:msg` (log text), `:prompt`/`:choices` (player decision),
`:async`, `:effect`. This is the **best middle ground we found**: the common case is declarative
data, the rare complex case is a first-class function — no parser, host-language type support, and
the shared helper library (`draw-abi`, `gain-credits-ability`, …) *is* the primitive vocabulary.

### Pattern 1d — Full effect classes (XMage)

**Stolen from:** XMage — [DESOSA architecture writeup](https://delftswa.gitbooks.io/desosa2018/content/xmage/chapter.html),
[CGomesu comparison](https://cgomesu.com/blog/forge-xmage-mtg/).

**How it works.** Each effect is a Java class (`OneShotEffect`, `ContinuousEffect`, …); an ability
composes effects; a card composes abilities. This scales to
[20,000+ cards with full rules enforcement](https://cgomesu.com/blog/forge-xmage-mtg/) and is the
most powerful/precise, but every card is potentially 100+ lines. **This is the extreme to avoid for
15 cards/deck** — the ceremony-to-content ratio is wrong for a small, LLM-authored card pool.

### Pattern 1e — Designer scripts over an engine API (Legends of Runeterra)

**Stolen from:** Riot — [Engineering Tools for Designers with LoR](https://www.riotgames.com/en/news/engineering-tools-designers-legends-runeterra).

**How it works.** The C# engine exposes verbs — `moveCard`, `doDamage`, `attachScript` — and
designers write IronPython that *listens for game events and calls those verbs*, so they
["synthesize entirely new gameplay mechanics without requiring engineers to build anything new"](https://www.riotgames.com/en/news/engineering-tools-designers-legends-runeterra):

```python
## EventDoDamage
game.Draw()      # "when I deal damage, draw a card"
```

Two takeaways worth stealing wholesale: (1) **the engine's job is a small, sharp verb library**;
effects are compositions of verbs. (2) They ship a **VS Code plugin with autocomplete and generated
"fake Python" stubs** so authors discover verbs without reading engine source — directly relevant to
making LLM + human authoring pleasant.

### → Recommendation for us

**Author cards as typed TypeScript/JSON effect data (Pattern 1c-style ability maps), over a small
library of composable effect primitives (Pattern 1e verbs), never as classes (1d) or a bespoke text
DSL (1a).** Concretely, a card is a data object whose triggers map to arrays of effect primitives:

```ts
const NezhaRam: CardDef = {
  id: "nezha-ram",
  name: "Ram", type: "scheme",
  boost: 3,
  timing: "DURING_COMBAT",
  effect: [
    { op: "moveOpponent", spaces: 1, awayFromMe: true },
    { op: "dealCombatDamage", amount: 1 },
  ],
};
```

Why this exact point on the spectrum, given our constraints:

- **LLM-authored + human-reviewed, ~15 cards/deck.** The TypeScript compiler type-checks every
  effect object at authoring time — the #1 defense against LLM hallucinating a malformed effect. A
  reviewer reads a *data structure*, not control flow. A text DSL (1a) throws away the type checker;
  classes (1d) bury the 3 interesting lines in 100 lines of boilerplate the LLM will get subtly wrong.
- **Effects-as-data is serializable** → it drops straight into golden replay tests, network sync,
  and (topic 9) AI inspection. A `{op: ...}` object can be logged, hashed, diffed, and replayed; a
  closure cannot.
- **The escape hatch.** For the one weird card per deck, allow an effect primitive whose payload is
  a named function reference (`{op: "custom", fn: "hattori-feint-resolve"}`) resolved from a
  registry — jinteki's "data by default, function when you must" without giving up serializability
  (you serialize the *name*, not the closure).

Keep the primitive library small and Unmatched-shaped: `dealCombatDamage`, `boost`, `moveFigure`,
`drawCard`, `discard`, `forceDiscard`, `cancelCombat`, `modifyValue`, `heal`, `search`,
`chooseAndPlace`, plus timing/targeting modifiers. ~15 cards/deck means you can afford to build each
primitive properly.

---

## 2. Event / trigger systems

**Stolen from:** Fireplace `EventListener` (`on`/`after`/`once`); LoR `## EventDoDamage` listeners;
Hearthstone's published ordering rule
([Advanced rulebook](https://hearthstone.wiki.gg/wiki/Advanced_rulebook)); Forge `T:` triggers.

**How it works across projects.** All of them model triggers as *subscriptions to a game event
bus*. A card declares "on event X (matching predicate P), run effect E." The engine, while resolving
any action, emits events (`DAMAGE`, `CARD_PLAYED`, `COMBAT_RESOLVED`, `FIGURE_MOVED`, …); the trigger
system collects matching subscriptions and resolves them.

Two hard problems every mature engine had to solve:

- **Ordering of simultaneous triggers.** Hearthstone's rule is concrete and worth copying: when
  several triggers fire at once, they resolve **in the order the sources entered play**
  ([Advanced rulebook](https://hearthstone.wiki.gg/wiki/Advanced_rulebook)). Deterministic,
  explainable, no player decision needed in the common case.
- **Once-per-turn / once-per-X tracking.** Fireplace's `once()` builds a listener that self-limits;
  LoR keeps counters **as storage on the card object itself** ("everything in LoR is stored on
  cards … increments the count on its own storage"). Storing per-instance counters on the card
  instance (not in a side table) keeps them redaction- and replay-safe.

### → Recommendation for us

Build a small **synchronous event bus** with typed events. Unmatched's event surface is tiny
compared to Magic — enumerate it explicitly: `TURN_START`, `TURN_END`, `ACTION_TAKEN`,
`COMBAT_DECLARED`, `CARDS_REVEALED`, `COMBAT_VALUE_COMPUTED`, `DAMAGE_DEALT`, `COMBAT_RESOLVED`,
`FIGURE_MOVED`, `CARD_DRAWN`, `CARD_DISCARDED`, `BOOST_APPLIED`. A trigger is
`{ on: EventType, when?: predicate, effect: Effect[] }` living on a card def.

For ordering, adopt Hearthstone's "source-entered-play / turn-order" tie-break and, crucially,
resolve the **active player's triggers before the non-active player's** (Unmatched is a 2-player
duel, so this covers almost every real case and removes fiddly APNAP-style prompts). Track
once-per-turn counters as fields on the card/figure instance, cleared on `TURN_END`.

---

## 3. Priority / timing windows & prompts (the async problem)

This is the hardest part of Unmatched specifically: **IMMEDIATELY / DURING / AFTER combat** windows,
and the face-down **simultaneous card commit**. Two prior-art models matter here.

### Pattern 3a — Async continuations (jinteki.net)

**Stolen from:** jinteki.net async engine — `eid`, `wait-for`, `continue-ability`,
`effect-completed`, `resolve-ability`
([source](https://github.com/mtgred/netrunner/blob/master/src/clj/game/cards/operations.clj)).

**How it works.** Every ability that might pause for a player decision is marked `:async true` and
carries an **effect-ID (`eid`)**. When it needs input it issues a `:prompt`/`:choices` and
*suspends*; the continuation is expressed with `wait-for`, which resumes with the result bound, and
signals completion up the chain with `effect-completed`. This lets an arbitrarily deep chain of
"player A chooses, then player B may respond, then resolve" be written without blocking threads and
**without a giant explicit state machine** — the continuation *is* the code after `wait-for`.

```clojure
(wait-for (some-async-choice state side ...)   ; suspends for player input
          (continue-ability state side next-step ...))  ; resumes with async-result
```

### Pattern 3b — Whiteboard + auto-pass priority (MTG Arena GRE)

**Stolen from:** [On Whiteboards, Naps, and Living Breakthrough](https://magic.wizards.com/en/news/mtg-arena/on-whiteboards-naps-and-living-breakthrough).

**How it works.** The GRE, whenever a player *could* act, assembles the list of that player's legal
actions (see topic 8). The key UX insight: **if the list is empty — or contains only "pass" — the
engine auto-passes without bothering the player.** This is why Arena feels fast: it only stops for
you when you have a meaningful decision. Priority stops are opt-in, not opt-out.

### → Recommendation for us

**Model prompts as explicit, serializable engine states, not thread suspensions — but keep jinteki's
mental model.** Because our client is a dumb renderer receiving redacted views + enumerated
`legalActions`, the engine can't hold a live continuation across a network round-trip. So represent a
pending decision as data:

```ts
type PendingPrompt = {
  promptId: string;
  player: PlayerId;
  kind: "chooseCard" | "chooseSpace" | "yesNo" | "commitCombatCard";
  options: LegalOption[];
  continuation: ContinuationRef;   // named resume point + captured args
};
```

The engine runs effects until it hits a decision, emits a `PendingPrompt` in that player's view,
and returns. The player's response re-enters the engine at `continuation`. This is jinteki's
`wait-for`/`eid` pattern **reified as data** so it survives serialization and replay — the same move
we made for effects in topic 1.

Steal three concrete things:

- **Timing windows as an ordered checklist.** Model combat as a fixed pipeline of windows —
  `DECLARE → COMMIT (simultaneous) → REVEAL → DURING → COMPUTE_VALUES → DAMAGE → AFTER`. At each
  window the engine gathers eligible effects/decisions. IMMEDIATELY effects interrupt and resolve at
  the point they are triggered. This turns Unmatched's prose timing into an explicit state machine.
- **Simultaneous face-down commit = both players in a "commit" stage at once.** boardgame.io's
  *stages* let different players have different legal moves in the same turn; both attacker and
  defender are put in a `commitCombatCard` stage, each move `redact:true`, and the engine only
  advances to REVEAL once both have committed. (See topic 5 — the commits stay server-secret until
  reveal.)
- **Auto-pass.** After enumerating legal actions for a window, if a player's only option is "pass"
  / "no response," the engine resolves it automatically and never emits a prompt — Arena's speed
  trick, and it maps perfectly onto our `legalActions` model (empty/pass-only ⇒ auto-advance).

---

## 4. State management: immutable + reducer vs mutable + command

**Stolen from:** the [Argentum MTG engine](https://wingedsheep.com/building-argentum-a-magic-the-gathering-rules-engine/)
(cleanest statement of the pattern) and boardgame.io's `(G, ctx) → G` moves.

**How it works.** Argentum uses **immutable state with a pure reducer**:

> "The state is immutable. Every game action creates a fresh snapshot, which makes replay, undo,
> and network sync trivial." — the core signature is
> `(GameState, GameAction) → ExecutionResult(GameState, List<GameEvent>)`, and
> "two identical inputs always produce identical outputs."

boardgame.io is the same shape: a move is `({G, ctx, ...}) => newG`. The payoff is enormous and
directly serves our requirements: **replay = re-fold actions from the initial state; network sync =
ship the action, not the state; undo = keep the previous snapshot; determinism = free.**

Argentum adds two refinements worth noting:
- **Base state vs projected state.** It stores only "the permanent as it exists without
  modifications," and a **state projector** computes "what players actually see" by applying
  continuous effects on read. This cleanly separates stored facts from derived facts.
- Actions return `(newState, events)` — the emitted event list is what feeds the trigger system
  (topic 2) and the replay log.

### → Recommendation for us

**Immutable state + pure reducer, no question.** `reduce(state, action) → { state, events }`. Every
action (player move *and* internal step) is an explicit serializable value; the game *is* the fold of
its action log over the initial seed. This is the backbone that makes topics 6 (RNG), 7 (golden
replay), and 9 (AI) nearly free. Use a structural-sharing library (Immer or Mori-style persistent
maps) so snapshots are cheap. Keep derived values (current combat value after boosts/modifiers) in a
projector, not in stored state, so you never have stale cached numbers.

---

## 5. Hidden information & redacted per-player views

**Stolen from:** boardgame.io `playerView` and `redact`
([Game.md](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/api/Game.md)).

**How it works.** The authoritative server holds full state; a **`playerView({G, ctx, playerID})`**
function returns a *filtered copy* per player before it goes over the wire, stripping secrets
(opponent's hand, face-down commits, deck order). Separately, a move can set **`redact: true`** so
its arguments don't leak into the shared game log (so "commit *this* card face-down" logs as "player
committed a card," not which one). Secrets never leave the server.

### → Recommendation for us

This is table stakes and boardgame.io has already solved it — copy it directly. Implement a single
**`redactFor(fullState, viewerId) → PlayerView`** on the server that:

- replaces the opponent's hand with a count;
- hides deck contents (reveal only top-card boost if a card is being boosted);
- **hides face-down combat commits until the REVEAL window** — the commit is stored server-side,
  and both players' views show "opponent has committed" until reveal flips both simultaneously;
- logs redacted actions ("committed a card") in the shared log.

Because our client is already specified as a dumb renderer, `redactFor` is *the* security boundary:
the client literally cannot cheat because it never receives the secret. Pair every `PlayerView` with
the enumerated `legalActions` for that player (topic 8) so the renderer needs zero rules knowledge.

---

## 6. RNG handling

**Stolen from:** boardgame.io's `seed` + injected `random` plugin
([Game.md](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/api/Game.md));
Argentum's determinism guarantee.

**How it works.** boardgame.io games never call `Math.random()`. A **seed** is fixed at game
creation and a `random` API is *injected* into moves; all randomness flows through it, so a game is a
pure function of `(seed, action log)` — which is exactly what makes replay and server authority sound.

### → Recommendation for us

Server-side **seeded PRNG stored in state**, advanced only through engine calls (never `Math.random`
in effect code). Unmatched's randomness is limited (shuffling the deck; some characters have
random-ish effects), so this is easy to keep clean. Store the seed and the current PRNG counter *in
the game state* so a snapshot fully determines the next draw. Because RNG lives in state and all
randomness is server-side, replays are bit-exact and clients can never predict or manipulate draws.

---

## 7. Testing: golden / replay tests, scripted games, fuzzing

**Stolen from:** Argentum's deterministic tests
([source](https://wingedsheep.com/building-argentum-a-magic-the-gathering-rules-engine/));
jinteki.net's per-card test suite; the general reducer property.

**How it works.**
- **Deterministic unit tests:** "Feed it a state and an action, verify the output. No mocking, no
  flakiness." Because the reducer is pure, tests are `expect(reduce(state, action)).toEqual(golden)`.
- **Scenario / scripted games:** jinteki.net has an extensive test suite that scripts a game
  (`play-from-hand`, `run-on`, …) card by card and asserts the resulting state — the model for
  per-card correctness tests.
- **Golden replay:** since the game is `(seed, actionLog) → finalState`, you record real/curated
  games and assert the final state (or a hash of the full event stream) never changes — a
  regression net that catches unintended rule changes.

### → Recommendation for us

Three layers, all enabled by the pure reducer:

1. **Per-card scenario tests.** For each of the ~15 cards in a deck, script a minimal game that
   exercises the card's effect and timing window, and assert the resulting state. This is the human
   half of "LLM authors, human reviews" — the reviewer's confidence comes from a passing scenario.
2. **Golden replay tests.** Store `{seed, actionLog, expectedStateHash}` fixtures from
   representative full games; CI re-folds and compares the hash. Any accidental rule/ordering change
   breaks the golden and is caught in review.
3. **Random-playout fuzzing.** A driver that, from any state, picks a *random legal action* (free
   once you have topic 8's enumerator) and plays thousands of games looking for crashes, illegal
   states, or infinite loops. This is the cheapest way to find the timing-window edge cases that
   IMMEDIATELY/DURING/AFTER interactions will inevitably create, and it doubles as the smoke test for
   LLM-authored cards.

LLM-in-the-loop bonus: when the LLM converts card text → effect data, auto-generate a scenario test
from the same card text and require it to pass before a human ever sees the card.

---

## 8. Legal-action enumeration vs validate-only

**Stolen from:** MTG Arena GRE — the engine "is constantly … assembling a list of available actions
for a player who has priority"
([WotC](https://magic.wizards.com/en/news/mtg-arena/on-whiteboards-naps-and-living-breakthrough));
boardgame.io stages restrict which moves are legal.

**How it works.** Two philosophies:
- **Validate-only** (most naive engines, and largely Forge/XMage internally): the client proposes a
  move, the engine says yes/no. Simple, but the client needs rules knowledge to know what to offer,
  and you get nothing for free for AI or UI.
- **Enumerate** (MTG Arena): the engine *produces* the full set of legal actions. Arena's whole
  "whiteboard" model is an enumerator — it builds the candidate action list, then CLIPS rules
  add/remove entries ("Yawgmoth's Will adds 'cast from graveyard'; Meddling Mage erases 'cast
  Lightning Bolt'"). The auto-pass UX (topic 3) *falls out* of enumeration: empty list ⇒ pass.

### → Recommendation for us

**Enumerate — it's in our stated architecture ("client receives enumerated `legalActions`") and it's
the right call.** The reducer already knows the rules; expose `legalActions(state, playerId) →
Action[]`. This single function pays for:

- **The dumb renderer.** The client renders buttons/targets straight from `legalActions`; it holds
  zero rules logic and literally cannot offer an illegal move.
- **Auto-pass** (topic 3) and **prompt options** (topic 3a) — both are just `legalActions` at a
  window.
- **AI for free** (topic 9) — a legal-move generator *is* the action space for any search/greedy AI.
- **Fuzzing for free** (topic 7) — random legal playouts.

Cost: you must keep `legalActions` and the reducer's own validation in sync. Mitigate by having the
reducer **assert** that any submitted action is in `legalActions(state, player)` — one source of
truth, enumeration is authoritative, validation is a cheap membership check. Unmatched's branching
factor is small (2 actions/turn, a handful of maneuver/scheme/attack choices, a bounded board graph),
so full enumeration is cheap — unlike Magic, we pay almost nothing for it.

---

## 9. AI-readiness

**Stolen from:** the convergent properties of Argentum (pure reducer), MTG Arena (enumerator), and
boardgame.io (seeded, serializable state — it ships bot/MCTS support precisely because of these).

**What makes bolting on an AI easy.** An AI (even greedy, or MCTS) needs exactly four things, and
every one of them is a *reused* piece from topics above:

1. **A legal-action generator** — `legalActions()` (topic 8) *is* the action space.
2. **A pure `apply(state, action) → state`** — the reducer (topic 4); MCTS/minimax rollouts need to
   apply-and-undo cheaply, which immutable snapshots give for free.
3. **Determinism + seeded RNG** — (topic 6) so rollouts are reproducible; for hidden info, the AI
   samples opponent hands consistent with the redacted view.
4. **A state evaluation hook** — a `score(state, player)` function (life totals, board position,
   cards in hand). Just leave a seam for it.

### → Recommendation for us

You get 3 of the 4 automatically if you follow topics 4, 6, and 8 — so **do not design AI now, just
don't foreclose it.** Concretely: keep the reducer pure and side-effect-free, keep `legalActions`
authoritative, keep RNG in state, and add a trivial `evaluate(view) → number` seam. A greedy bot
("play the legal action with the best immediate `evaluate`") becomes a ~50-line file, and MCTS is a
standard wrapper over `legalActions` + `apply` + `evaluate` whenever you want it.

---

## 10. What the shipped digital Unmatched tells us

Acram's [Unmatched: Digital Edition](https://unmatched.acram.eu/) is closed-source, so there is no
architecture to read — but the shipped product and its
[reviews](https://dudetakeyourturn.ca/2022/12/27/app-review-early-access-unmatched-battle-of-legends-by-acram-digital/)
confirm the shape of the problem we must model:

- **Simultaneous face-down combat commit is the central interaction** and the main thing a digital
  version must get right (both players select a card secretly, then reveal) — validating our
  emphasis on the boardgame.io *stages* + server-secret commit (topics 3, 5).
- **Timing windows (before/during/after combat, and IMMEDIATELY effects)** are exactly where per-card
  complexity concentrates — validating the fixed combat pipeline (topic 3) and the fuzzing focus on
  window interactions (topic 7).
- Reviews emphasize that correctness needed **months of post-launch fixes** even for a professional
  studio — a strong argument for our golden-replay + per-card scenario test strategy (topic 7) and
  for keeping the card pool small and the primitive library well-tested before scaling decks.

There is otherwise **no open-source Unmatched engine and no BGA implementation** to borrow from — the
patterns above are the transferable prior art.

---

## Recommended architecture for us (opinionated synthesis)

A single, coherent stack, each choice justified by the prior art above:

1. **State: immutable + pure reducer.** `reduce(state, action) → { state, events }`, structural
   sharing (Immer). The game is the fold of its action log over `(seed, initialState)`.
   *(Argentum, boardgame.io.)* This one decision hands us replay, undo, network sync, and
   determinism.

2. **Effects: typed TS/JSON effect data over a small primitive verb library**, with a named-function
   escape hatch for the odd card (`{op:"custom", fn:"..."}`). Cards are *data*, type-checked at
   authoring, serializable for replay/AI, reviewable as structures. *(jinteki ability maps + LoR
   verb API; explicitly **not** Forge text DSL, **not** XMage classes.)* This is the sweet spot for
   ~15 LLM-authored, human-reviewed cards/deck.

3. **Events/triggers: a small synchronous typed event bus.** Triggers are
   `{on, when?, effect[]}` on card defs. Simultaneous-trigger order = active player first, then
   entered-play order (Hearthstone's rule). Once-per-turn counters stored on the card/figure
   instance. *(Fireplace, LoR, Hearthstone rulebook.)*

4. **Combat & timing: an explicit window pipeline.**
   `DECLARE → COMMIT(simultaneous) → REVEAL → DURING → COMPUTE_VALUES → DAMAGE → AFTER`, with
   IMMEDIATELY effects interrupting at their trigger point. Turns Unmatched's prose timing into a
   state machine. *(MTG Arena windows; Acram's shipped model.)*

5. **Prompts: pending decisions reified as serializable data**, not thread continuations.
   `PendingPrompt{ promptId, player, kind, options, continuation }`; the player's response re-enters
   the reducer at the continuation. jinteki's `wait-for`/`eid` model, but as data so it survives the
   network boundary and replays. *(jinteki.)*

6. **Simultaneous commit + hidden info: boardgame.io stages + server-side `redactFor`.** Both players
   sit in a `commitCombatCard` stage; commits are `redact:true` and stay server-secret until REVEAL
   flips both at once. `redactFor(fullState, viewerId) → PlayerView` is the security boundary; the
   client is a dumb renderer of `PlayerView` + `legalActions`. *(boardgame.io `playerView`/`redact`.)*

7. **Legal actions: enumerate, authoritatively.** `legalActions(state, player) → Action[]` drives the
   renderer, prompt options, auto-pass (empty/pass-only ⇒ auto-advance, Arena-style), fuzzing, and
   future AI. The reducer asserts submitted actions ∈ `legalActions`. Cheap because Unmatched's
   branching factor is tiny. *(MTG Arena GRE.)*

8. **RNG: seeded PRNG stored in state**, advanced only via engine calls. `(seed, actionLog)` fully
   determines the game. *(boardgame.io.)*

9. **Testing: three layers, all free from the pure reducer** — per-card scenario tests (the human
   review artifact), golden replay tests (`{seed, actionLog, stateHash}` in CI), and random-legal
   playout fuzzing (crash/edge-case finder). Auto-generate a scenario test alongside each LLM card
   conversion. *(Argentum, jinteki test suite.)*

10. **AI-readiness: don't build it, don't foreclose it.** Pure reducer + authoritative
    `legalActions` + in-state RNG give you 3 of the 4 AI prerequisites for free; just leave an
    `evaluate(view) → number` seam. *(Convergent property of all the above.)*

### The single most important recommendation

**Represent card effects as typed, serializable data over a small library of Unmatched-specific
effect primitives — never as a bespoke text DSL and never as classes.** Everything else in this
document (golden replay, redacted views, legal-action enumeration, AI-readiness, LLM authoring with
compiler-checked human review) is *enabled* by effects being inspectable data folded through a pure
reducer. Get this one representation choice right and the rest of the architecture falls out of it;
get it wrong and you will fight it on every card.

---

### Sources

- Forge — [Card scripting API](https://github.com/Card-Forge/forge/wiki/Card-scripting-API) · [Creating a custom Card](https://github.com/Card-Forge/forge/wiki/Creating-a-custom-Card) · [ForgeScribe (AI scripting)](https://slightlymagic.net/forum/viewtopic.php?f=52&t=22473) · [Forge vs XMage](https://cgomesu.com/blog/forge-xmage-mtg/)
- Fireplace — [The Fireplace Card API](https://github.com/jleclanche/fireplace/wiki/1:-The-Fireplace-Card-API) · [Fireplace 2.0 (DSL retrospective)](https://github.com/jleclanche/fireplace/wiki/Fireplace-2.0) · [repo](https://github.com/jleclanche/fireplace)
- jinteki.net — [mtgred/netrunner repo](https://github.com/mtgred/netrunner) · [operations.clj (ability maps / async)](https://github.com/mtgred/netrunner/blob/master/src/clj/game/cards/operations.clj)
- boardgame.io — [Game.md (moves/playerView/seed)](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/api/Game.md) · [phases](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/phases.md) · [stages](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/stages.md)
- XMage — [DESOSA 2018 architecture](https://delftswa.gitbooks.io/desosa2018/content/xmage/chapter.html) · [Forge vs XMage](https://cgomesu.com/blog/forge-xmage-mtg/)
- MTG Arena GRE — [On Whiteboards, Naps, and Living Breakthrough (WotC)](https://magic.wizards.com/en/news/mtg-arena/on-whiteboards-naps-and-living-breakthrough)
- Argentum — [Building a Magic: The Gathering rules engine (wingedsheep)](https://wingedsheep.com/building-argentum-a-magic-the-gathering-rules-engine/)
- Legends of Runeterra — [Engineering Tools for Designers (Riot)](https://www.riotgames.com/en/news/engineering-tools-designers-legends-runeterra)
- Hearthstone — [Advanced rulebook (trigger ordering)](https://hearthstone.wiki.gg/wiki/Advanced_rulebook)
- Unmatched digital/tooling — [Acram: Unmatched Digital Edition](https://unmatched.acram.eu/) · [Acram early-access review](https://dudetakeyourturn.ca/2022/12/27/app-review-early-access-unmatched-battle-of-legends-by-acram-digital/) · [Unmatched Maker (card generator)](https://jonathanguberman.github.io/unmatched_maker/) · [UMDB card database](https://unmatched.cards/umdb/cards)
