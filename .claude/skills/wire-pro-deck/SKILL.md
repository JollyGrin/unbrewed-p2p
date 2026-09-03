---
name: wire-pro-deck
description: Wire a newly rules-converted deck (from the private unbrewed-pro-server engine repo) into this client — run scripts/wire-deck.mjs, review its diff, drop art if any, verify against the deployed engine. Use when given "wire <hero-id> (<deckId>) into Pro" plus an engine-side conversion report/issue.
---

# Wire a converted deck into Unbrewed Pro

## Preconditions (stop if any fails)

- The engine PR is **merged and DEPLOYED** before this ticket starts — the
  orchestrator confirms the engine's `/healthz` lists the hero. All
  verification in this skill runs against the **deployed engine only**: do
  NOT clone, build, or run a local `unbrewed-pro-server` (that cost #737 ~50
  commands and produced a stray worktree).
- **hero-id** — server id (e.g. `king-kong`), and **deckId** — unmatched.cards
  id (e.g. `kdKM`) or an unbrewed-minted id for originals (e.g. `taranis`).
- **art status** — real card art yet, or template fallback (empty `imageUrl`)?
- **new-mechanics list** from the report's "new-mechanic scan" — any YES means
  the "New-mechanic UX" section below applies AND the orchestrator re-verifies
  this ticket; otherwise it does not.
- **verbatim-title quirks** — exact casing/typos in card titles to preserve
  (art resolves on them; see gotchas).

## The wiring checklist

**1. Data wiring — `node scripts/wire-deck.mjs <hero-id> <deckId> --name "…"
--hero "…" --author "…" --colour "#…" --cardback <url|path> --engine-commit
<sha>` — then review its diff.** Idempotent: re-running with the same args
changes nothing; re-running with changed flags updates only those fields
(`--name` touches ONLY `name` — many entries deliberately carry a hero that
differs from name; `--hero` touches only `hero`; `--engine-commit` updates
`rulesVerified.commit` on an existing manifest entry in place); `--dry-run`
previews the diff. The whole diff is computed — every anchor resolved, every
payload built — before a single byte is written: a mid-plan abort (missing
anchor, bad flag) leaves the tree untouched. Writes themselves are NOT rolled
back: if the step-5 verify fails, the data writes stay on disk (intended —
fix the cause and re-run, or `git checkout` the touched files to abandon).
For each step it prints what it does and aborts (naming the file and anchor)
if the target file's shape changed:

- Fetches the deck JSON from the deck API (the `DEFAULT_DECK_API` default in
  `lib/evergreenDecks.ts:28`, currently `https://engine.unbrewed.xyz/api/unmatched-deck/`)
  into `public/evergreen-decks/<deckId>.json` — **only if absent**. A present
  snapshot is NEVER overwritten: hand-edits are canonical (the script prints a
  one-line diff vs the API instead). If a lost snapshot had hand-edits,
  restore it from git history, not the API (the jw9q refetch in the #745
  acceptance test lost three printed-cards fixes and jest caught all of them).
- ORIGINALS/RESKINS (no unmatched.cards page): the fetch 404s — hand-author
  the snapshot first, per the taranis/thetis/piper/hollow-oak convention
  (precedent: PR #89): engine-matching titles/values/boosts/quantities,
  paraphrased card text (NEVER official Unmatched wording), empty `imageUrl`,
  `version_id: "evergreen-1"`. Then re-run the script.
- Adds the stub entry to `public/evergreen-decks/manifest.json` and runs
  `node scripts/deck-manifest.mjs bump-rules <deckId>` — reused, not
  re-derived; this is the ONLY way the rules lock moves
  (`scripts/deck-manifest.mjs:22`).
- Inserts `"<hero-id>": "<deckId>"` into `HERO_DECK_IDS`
  (`lib/pro/useProCardArt.ts:37`) — the ONE hero↔deck map;
  `EVERGREEN_DECK_IDS` in `lib/evergreenDecks.ts:21` is derived from it, so
  never hand-edit `evergreenDecks.ts`. `lib/pro/evergreenManifest.test.ts:21`
  asserts every deckId here has a manifest entry.
- Inserts the `POPULAR_DECKS` entry (`lib/constants/top-decks.ts:45`, shape in
  `PopularDeckMeta` at `top-decks.ts:4`) with `lab: true, tier: "lab"` — every
  new deck starts in lab. `original: true` (suppresses the
  `unmatched.cards/decks/<id>` deep-link for reskins) is NOT scriptable — add
  it by hand for originals.
- Runs `npm run pro:decks:verify` and the jest lock test, printing their tails.

Then finish what the script can't: replace its `TODO` provenance comments with
the real story (issue ↔ engine PR, one line per entry — see the neighbours),
and if the printed cards disagree with the API payload, hand-edit the snapshot
to the printed cards and re-run `bump-rules` (Appa #738 had three such fixes).

**2. Art (when it exists)** — self-host under
`public/evergreen-decks/art/<deck>/`: `cardback.webp`, card faces, and board
token portraits (`token-*.webp`; Appa #738/#740 is the exemplar). Point
`POPULAR_DECKS.cardbackUrl` at the repo-relative path; wire token art by
setting `hero.tokenImageUrl` / `sidekick.tokenImageUrl` in the snapshot JSON
(`components/DeckPool/deck-import.type.ts:164`) — a presentation field, so no
`bump-rules` needed.

**3. No step for `HeroPreviewModal`** (`components/Pro/HeroPreviewModal.tsx`):
`lib/pro/useDeckPreview.ts` reads the same `HERO_DECK_IDS` map and snapshot,
so it lights up automatically — just check it in Verification.

## New-mechanic UX (conditional — only if the report's scan had a YES)

- `lib/pro/protocol.ts` is the byte-identical copy of the engine's protocol —
  sync procedure at `protocol.ts:9`. If the engine PR bumped
  `PROTOCOL_VERSION` (now `34`, `protocol.ts:867` — v34 added
  `COMBAT_DEFENDER_CHANGED`, the defender-substitution event), copy the file
  VERBATIM and note the paired merge in both commit bodies ("PAIRED with …" —
  an old client against a new server is hard-rejected, neither lands alone).
- Flag-driven public state (e.g. Thetis tide) = ONE entry in the
  `HERO_STATE_FLAGS` / `HERO_STATE_COUNTERS` registries in
  `lib/pro/heroStateFlags.ts:101` / `:358` (plus `BOUNTY_PILES` at `:347` for
  bounty decks). One entry drives the nameplate pill, the board-token badge,
  and state-swapped token art — ZERO component changes. This replaced the old
  `FLAG_HUD_CHIPS` in `useProCardArt.ts` (LEARNINGS 2026-07-23).
- Precedents: prompted additional defense (Specter Knight, #419), defender
  substitution on both sides of the table (Ripley #735, Appa #737), two-space
  large fighters (PR #91).

## Gotchas (hard-won, keep them)

- Card art matches by **lowercased + trimmed verbatim title** (`norm()`,
  defined in `lib/pro/cardAppearance.ts:40` and re-exported by
  `useProCardArt.ts:317`) — never "fix" casing or typos carried over from the
  engine rules file (e.g. `reCKLESS LUNGE`, `destoryed`).
- Community-deck JSON spells the card type `"defence"`; the server/protocol
  spells it `"defense"` — `normalizeType` (`scripts/lib/deckManifest.js`)
  handles it; don't "fix" the JSON's spelling.
- Never put official Unmatched card text in hand-authored reskin snapshots.
- The rules lock covers only *rules-relevant* fields (card titles/types/
  values/boosts/quantities, hero hp/move/isRanged, sidekick) — editing those
  without `bump-rules` trips `npm run pro:decks:verify` and
  `evergreenManifest.test.ts`. Presentation edits (art, note, appearance,
  cardback, tokenImageUrl) never trip it.
- Occupied-space `CHOOSE_SPACE` prompts: a click on a fighter token is
  forwarded to its space when the space is highlighted (`ProBoard.tsx`; issue
  #185, PR #186). When wiring a deck that targets occupied spaces, click-test
  one such prompt on the token itself, not just the bare rim.

## Verification (the whole definition of done)

- One full browser-driven game against the **deployed** server — drive it with
  the existing `verify` skill (puppeteer, screenshots to `screenshots/`; PR
  #89's verification section is the exemplar). Run it on `/pro/game`, Duel
  format + default board (the multiplayer formats don't change this list):
  - `/pro` landing lists the deck as ready — the live `LIST_HEROES` reply IS
    the roster (`components/Pro/ProLanding.tsx:106`; server-first since #462,
    there is NO `FALLBACK_READY` roster constant anymore).
  - The picker shows the hero; originals carry no unmatched.cards link; lab
    decks carry the caution badge.
  - A seat renders the full hand as card faces (template fallback OK); art
    resolves by title where art exists.
  - The hero tile's info icon opens `HeroPreviewModal` with HP/move/reach,
    sidekick, special ability, and full card list, on `/pro` and `/pro/game`.
  - Sandbox `/bag` → Popular decks: the tile fetches and saves the snapshot.
- `npm run pro:decks:verify`, `npm run lint`, `npm run build`, `npm test` all
  clean. (`Pool.spec.ts` failed historically; it does not fail on current
  main — if it fails now, treat it as a real regression and chase it.)
- That is the whole verification. The orchestrator does not re-verify unless
  the conversion report's new-mechanic scan had a YES.
