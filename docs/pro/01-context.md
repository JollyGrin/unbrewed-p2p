# Unbrewed Pro — Context & Master Plan

> **Status**: research phase (July 2026). This doc is the canonical context for the
> rules-enforced game mode ("Pro"). Read this first; the sibling docs go deep on
> each research track. Agents working on Pro should treat decisions recorded here
> as settled unless the user reopens them.

## What Pro is

Unbrewed today is a **free-form sandbox VTT** for Unmatched: no rules enforcement,
cooperative players move everything by hand. Pro is an **additional, optional mode**
with full rules enforcement — turn structure, legal-move validation, automated
combat resolution — for a curated set of supported decks and maps. The sandbox is
not being replaced, changed, or deprioritized; it remains the flexible default.

Why Pro exists (in priority order):

1. Strangers can play without trusting each other — enables matchmaking.
2. Deterministic, server-refereed games — a prerequisite for competitive play and
   any future monetization.
3. AI opponents become possible (an AI is just a server-side player).

## Architecture (decided)

Two repos, one narrow seam:

### `unbrewed` (this repo, public) — UI only

- `/pages/pro/index.tsx` — Pro lobby: create/join room, hero-select grid
  (Smash-Bros-style screen showing **only decks with authored rule support**).
- `/pages/pro/game.tsx` — renders the server's view, shows prompts, sends actions.
- `/components/Pro/` — turn tracker, combat prompt flow, zone highlights.
- `/lib/pro/protocol.ts` — copy of the protocol types (source of truth lives in
  the server repo; synced manually on change; version handshake at connect).
- `/lib/pro/useProSocket.ts` — thin WebSocket client.

Reuses the existing presentational layer: `CardFactory` (card faces), `BoardCanvas`
(+ a new zone/space overlay layer), HP/dice/hand components. Card *display* data
(text, images) stays public and is fetched exactly as the sandbox does today via
unbrewed-api. **The client contains zero rules logic.**

The sandbox and its Go relay are untouched. Next.js code-splits per page, so
sandbox users download none of Pro.

### `unbrewed-pro-server` (separate PRIVATE repo, Node + TypeScript, Railway)

The sauce. Holds:

- `/engine/` — pure reducer core: `(state, action) → newState | Illegal`.
  Zero framework deps, runs anywhere (enables future AI lookahead and testing).
- `/data/heroes/*.rules.ts` — authored card-effect definitions per deck, keyed by
  card id (the executable rules; card display text is NOT duplicated here).
- `/data/maps/*.zones.json` — scripted map graphs (spaces, adjacency, zones).
- `/server/` — WebSocket transport, room lifecycle, per-player view redaction,
  legal-action enumeration, server-side seeded RNG (dice are server-rolled).
- `/protocol/protocol.ts` — protocol source of truth.
- `/test/replays/` — golden scripted-game tests per supported deck.

### The load-bearing design choice: server-authoritative, client knows zero rules

The server sends each player:

- `view` — public state + *that player's* private state (own hand, own face-down
  commit). Redaction happens server-side; opponent hands never reach the client.
- `legalActions` — enumerated list of currently legal actions (the UI renders
  these as buttons / highlighted zones).
- `prompt?` — when the game is waiting on that player's decision.

Client → server is just `{ v, gameAction: { type, payload } }` plus room
join/create messages. This design is what keeps the engine private, handles
Unmatched's hidden information correctly, and makes AI/matchmaking pure
server-side additions with no client changes.

Consequence for the board UI: the Pro board is **not** the sandbox's free-drag
canvas. Tokens sit on discrete spaces; movement is click-a-highlighted-space;
combat is a prompt flow. Shares rendering components, not interaction model.

## Decisions log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Where Pro lives | `/pro` routes in this repo | shared components flow both ways in one commit; code-splitting = zero sandbox bloat |
| Engine location | separate private repo | keep the sauce private (monetization/competitive integrity) |
| Authority | server-authoritative from day one | hidden info, anti-cheat, AI/matchmaking readiness |
| v1 formats | **1v1 only** | design state shapes so 2v2/FFA aren't ruled out, implement none of it |
| Rules fidelity | **strict rules-as-written + auto-skip** | full enforcement; server silently skips prompts with no legal choice (MTG Arena style) |
| v1 content | 3–4 supported decks, 1 vanilla official map | template first, scale later |
| Analysis decks | 3 simple + 2 complex stress-tests from unmatched.cards top 30 | stress-test the DSL before freezing it; simple ones become launch decks |
| Launch decks (from research) | **King Kong, Baba Yaga, The Flash** (fallback swap: Voldemort) | simple, popular, archetype-diverse — see 04 |
| DSL stress-test decks | **Pinocchio** (token subsystem, mid-effect opponent prompts), **Schrödinger's Cat** (third combat outcome UNKNOWN) | maximize DSL + combat-core coverage before freezing — see 04 |
| v1 map | **Marmoreal** (fallback: Sarpedon) | vanilla rules, iconic, geometry seedable from the-unmatched.club — see 05 |
| Effect representation | **typed serializable TS data over ~a dozen effect primitives** + named-function escape hatch; no text DSL, no classes | unanimous prior-art conclusion — see 03 |
| Engine core | immutable state, pure reducer `(state, action) → {state, events}`, seeded RNG in state, authoritative `legalActions()` enumeration | replay/undo/determinism/AI-readiness fall out for free — see 03 |
| Accounts | none — jump right in | but reconnect tokens + room TTL from day one |
| Backend cost | hobby budget | Node + `ws`, in-memory rooms, no DB until accounts; Railway |
| Personal/custom decks in Pro | not yet | each deck needs hand-authored rules; sandbox remains the home for custom decks |
| Docs privacy | research public in `docs/pro/`; DSL spec + card-authoring docs migrate to the private repo once it exists | plans aren't the moat, execution is |
| RNG | server-rolled, seeded | determinism for replays/disputes |

## Constraints

- **Hobby project.** Prefer boring tech, WebSockets, in-memory state. No k8s, no
  DB, no auth provider until a real need appears.
- **Sandbox untouched.** Any PR that changes sandbox behavior to serve Pro is
  wrong by default.
- **Content scaling is the real cost.** Engine is built once; every deck is an
  authoring + review + golden-test effort forever. The DSL and tooling must
  optimize for cheap deck addition (LLM converts card text → DSL, human reviews,
  replay test gates it).
- **DSL is derived from a corpus, not deck #1.** The effect vocabulary is frozen
  only after surveying all analysis decks (see 04).
- **IP posture**: same as the sandbox — we display community-hosted card/map
  imagery, we don't bundle official assets. A fully enforced digital Unmatched is
  closer to the official digital product than a sandbox VTT is; keep this
  hobby-scale and non-commercial unless that calculus is revisited.

## Research docs in this folder

| Doc | Question it answers |
| --- | --- |
| `02-unmatched-rules.md` | What exactly are the rules, as a state machine an engine can implement? |
| `03-prior-art-rules-engines.md` | How did MTG/Hearthstone/Netrunner/boardgame.io solve scripted rules? What do we steal? |
| `04-deck-analysis.md` | What does the top-30 deck corpus look like statistically; which effect primitives cover it; which 5 decks do we build against? |
| `05-scripted-maps.md` | How do we encode spaces/adjacency/zones; how do we author map files; which map is v1? |

## Research outcomes (synthesis, 2026-07-04)

All four research tracks completed. Headline findings and how they interlock:

- **Green field confirmed** (03): no open-source Unmatched engine exists; the game
  is not on Board Game Arena; the only rules-enforced implementation is Acram's
  closed-source Digital Edition.
- **The corpus validates the "small primitive library" bet** (04): across 480
  effect-text units in the top-30 decks, ~8 primitives + three predicate families
  (combat outcome, zone/distance, count) cover the large majority. 53% of effect
  units are conditionals; ~45% of all card logic hangs off the after-combat
  window — so the combat pipeline in 02 §5 is where correctness effort pays most.
- **Stress tests were well chosen** (04 × 02): Schrödinger's Cat requires the
  combat resolver to support a *third outcome* (tie → UNKNOWN, "do both"
  branches) — the combat state machine must treat outcome as an extensible enum,
  not a boolean, from day one. Pinocchio requires mid-effect opponent prompts —
  which the serializable PendingPrompt pattern from 03 §6 already covers.
- **02's open questions route to 04's corpus**: the unresolved "cancel" scoping
  questions (single-window vs whole-card, printed-value immunity) get answered
  during DSL spec by reviewing the actual cancel-wording cards in the corpus;
  simultaneous-hero-death tiebreak (active player wins) is a community ruling we
  adopt explicitly.
- **Maps are seedable, not greenfield** (05): the-unmatched.club's data blob has
  space coordinates + zone membership for ~28 maps (no adjacency, no starts).
  Authoring = extraction script seeds a dev-only in-browser annotation page
  (`/dev/map-editor` here); human draws adjacency edges and marks starts, exports
  validated JSON. Note: `public/maps` in this worktree is empty and
  defaultMaps.json is community maps — the Marmoreal image must be sourced.
- **Supported decks are community decks** from unmatched.cards (same source the
  sandbox imports from), fetched by the same deck ids the client already uses —
  display data stays on the existing public pipeline.

## Roadmap after research

1. **Effect-DSL spec** (private repo's first doc) — primitives from 04, timing
   model from 02, representation pattern from 03.
2. **Engine, headless** — types → map/movement → turn state machine → combat
   timeline → effect interpreter. Golden replay tests throughout. No server, no UI.
3. **Deck data** for the 3 launch decks (LLM-assisted conversion, human-reviewed,
   replay-tested). Stress-test decks only need to *typecheck against the DSL*,
   not ship.
4. **Room server** — ws transport, rooms, redaction, legalActions, reconnect
   tokens, room TTL, protocol version handshake. Deploy to Railway.
5. **`/pro` UI** in this repo — lobby + game page against the live server.
6. Later, in rough order: more decks, matchmaking queue, AI opponent, accounts.

Each step gates the next; nothing in 1–3 requires touching this repo at all.
