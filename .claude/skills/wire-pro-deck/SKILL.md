---
name: wire-pro-deck
description: Wire a newly rules-converted deck (from the private unbrewed-pro-server engine repo) into this client — deck snapshot + rules lock, hero/deck id maps, roster fallbacks, cardback, verification. Use when given "wire <hero-id> (<deckId>) into Pro" plus an engine-side conversion report/issue.
---

# Wire a converted deck into Unbrewed Pro

Every hero the engine repo adds `data/heroes/<hero-id>.rules.ts` for needs the
same handful of client edits before it's playable here. This is the exact,
current-main checklist — no archaeology needed.

## Inputs (from the engine conversion report / issue)

- **hero-id** — server id (e.g. `king-kong`), and **deckId** — unmatched.cards
  id (e.g. `kdKM`) or an unbrewed-minted id for originals (e.g. `taranis`).
- **evergreen vs community**: does the hero have rules on the server? (Every
  hero wired via this skill is evergreen — see gotcha below on what that
  means for the snapshot.)
- **art status** — real card art yet, or template fallback (empty `imageUrl`)?
- **new-mechanics list** from the report's "new-mechanic scan" — any YES
  means the "New-mechanic UX" section below applies.
- **verbatim-title quirks** — exact casing/typos in card titles to preserve.

## The wiring checklist

**1. Deck snapshot JSON — `public/evergreen-decks/<deckId>.json` + a
`manifest.json` entry.**

Since commit `2003a0e` (unbrewed-p2p-93) this is the ONE canonical location —
there is no more `public/pro/decks/`, no duplicate copy in
`public/top-decks/`, and no more `scripts/snapshot-pro-decks.mjs` /
`npm run pro:decks:snapshot` (all removed same commit). **Nothing fetches
over the network anymore** — you commit the file yourself:

- *Community deck with an unmatched.cards page*: fetch it once and save it,
  e.g. `curl https://unbrewed-api.vercel.app/api/unmatched-deck/<deckId> >
  public/evergreen-decks/<deckId>.json` (that URL is
  `lib/evergreenDecks.ts`'s `DEFAULT_DECK_API` — `useProCardArt` used to fall
  back to it live; it no longer does).
- *Original/reskin (no API page)*: hand-author per the taranis/thetis/
  piper/hollow-oak convention (precedent: PR #89) — engine-matching titles/
  values/boosts/quantities, paraphrased card text using the reskin names
  (NEVER official Unmatched wording), empty `imageUrl` so faces render from
  the generated template until art lands, `version_id: "evergreen-1"`.
- Either way, add a stub entry to `public/evergreen-decks/manifest.json`:
  `heroId`, `deckId`, `version_id`, `rulesVerified: {repo:
  "unbrewed-pro-server", file: "data/heroes/<hero-id>.rules.ts", commit:
  "<engine commit the report verified against>"}` — `digest`/`frozenAt` can
  be placeholders, then run:
  `node scripts/deck-manifest.mjs bump-rules <deckId>` (or
  `npm run pro:decks:bump-rules -- <deckId>`) — this computes the real
  sha256 digest over the rules-relevant projection and stamps today's
  `frozenAt`. This is the ONLY way the lock moves; there is no re-fetch path.
- Confirm with `npm run pro:decks:verify` — every deck including yours
  prints `✓ ... locked`.

**2. `HERO_DECK_IDS` in `lib/pro/useProCardArt.ts`** — add
`"<hero-id>": "<deckId>"`. This is the ONE hero↔deck map; it lights up art
resolution AND (since `2003a0e`) drives `EVERGREEN_DECK_IDS` in
`lib/evergreenDecks.ts` automatically (`Object.values(HERO_DECK_IDS)`) — do
**not** hand-edit `evergreenDecks.ts`, there's no separate list anymore.
`lib/pro/evergreenManifest.test.ts` asserts every `HERO_DECK_IDS` deckId has
a manifest entry — skip step 1's manifest edit and this jest test fails.

**3. `POPULAR_DECKS` in `lib/constants/top-decks.ts`** — add
`{id, name, hero, author, likes, highlightColour, cardbackUrl?, original?}`.
`original: true` for unbrewed originals (suppresses the
`unmatched.cards/decks/<id>` deep-link in the lobby HeroTile — those pages
don't exist for reskins).

**4. `FALLBACK_READY` in `components/Pro/ProLanding.tsx`** — add
`deckId: "Display Name"`. The real "ready" roster comes live over
`LIST_HEROES` (`useProLiveRoster`); this is only the gap before that first
reply lands or if the socket never connects — keep it matching the deployed
server's roster so the landing never regresses to "not ready" on a slow
connect.

**5. Cardback** — self-hosted at `public/cardbacks/<hero-id>.webp`
(precedent: Thrall, commit `82f30c3`) or a community imgur URL in
`POPULAR_DECKS.cardbackUrl`.

No step needed for the hero-preview modal (`components/Pro/HeroPreviewModal.tsx`,
added PR #92/unbrewed-p2p-84): `lib/pro/useDeckPreview.ts` reads the same
`HERO_DECK_IDS`/`DECK_HERO_IDS` map and the same `/evergreen-decks/<deckId>.json`
snapshot as steps 1–2, so it lights up automatically once those are done —
just check it in Verification below.

## New-mechanic UX (conditional)

If the conversion report's mechanic scan has any YES, this ticket includes
bespoke rendering work, not just data wiring:

- Check whether `lib/pro/protocol.ts` needs a VERBATIM re-sync from the
  engine repo first (see the sync-procedure comment at the top of that
  file — any server-side protocol change bumps `PROTOCOL_VERSION` and must
  be copied byte-identical here). As of the multi-lobby merge (p2p #182 ↔
  engine #91) it sits at `PROTOCOL_VERSION = 14`; that sync widened the shape
  for the duel/multiplayer split — `PlayerView.opponent` is now nullable
  (`ViewOpponent | null`, the first non-self seat in runtime order or null),
  a `players: ViewPlayer[]` per-seat array was added alongside the retained
  duel `self`/`opponent` aliases, and `PlayerId` was widened to a 16-slot
  `RuntimePlayerId` (`p1`…`p16`) with a `DuelPlayerId` (`p1` | `p2`) alias
  kept for the duel-only actions `BOOST_MOVE` and `FORFEIT`.
- If it does, use the paired-merge convention in the commit/PR — precedent
  commit `94d2a45`: *"PAIRED with JollyGrin/unbrewed-engine#17 — merge
  together, neither lands without the other"* — because an old client
  talking a stale protocol version gets hard-rejected by a server that's
  already deployed the new one (and vice versa). This byte-identical-sync +
  paired-merge dance has since been exercised twice more (v13, and the v14
  multi-lobby sync) and held both times.
- Precedents: totem rendering (`f0992b0`, `7d0ad9d`), two-space large
  fighters (PR #91 ↔ engine #17).
- Engine flag-driven public state (e.g. Thetis tide) surfaces as an always-visible player-card pill via the `FLAG_HUD_CHIPS` registry in `lib/pro/useProCardArt.ts` — a new flag-driven deck adds one entry there, no component changes (issue #233 ↔ engine #132).

## Gotchas (hard-won, keep them)

- Card art matches by **lowercased + trimmed verbatim title**
  (`norm()` in `useProCardArt.ts`) — never "fix" casing or typos carried
  over from the engine rules file (e.g. `reCKLESS LUNGE`, `destoryed`).
- Community-deck JSON spells the card type `"defence"`; the server/protocol
  spell it `"defense"` — the rules-lock digest normalizes this
  (`normalizeType` in `scripts/lib/deckManifest.js`) so it's not a real
  mismatch; don't "fix" the JSON's spelling.
- Never put official Unmatched card text in hand-authored reskin snapshots.
- The rules lock only covers *rules-relevant* fields (card titles/types/
  values/boosts/quantities, hero hp/move/isRanged, sidekick) — editing those
  without `bump-rules` trips `npm run pro:decks:verify` and the
  `evergreenManifest.test.ts` jest test. Presentation edits (art, note,
  appearance, cardback) never trip it — no bump-rules needed for art drops.
- `npm test` has one pre-existing unrelated failure in `Pool.spec.ts` that
  reproduces on a clean `main` checkout — don't chase it.
- Occupied-space `CHOOSE_SPACE` prompts: a fighter token renders *above* the
  space hit-circle (token `zIndex 4` vs highlight `zIndex 3` in
  `ProBoard.tsx`), so a click on the token used to be swallowed — only the
  ~9% rim of the space stayed clickable (issue #185; fixed in PR #186 by
  forwarding the token's click to `onSpaceClick` when its own space is
  highlighted and the token isn't itself a fighter-click target). When
  wiring a deck whose effects target occupied spaces (place- or
  move-onto-fighter effects), click-test one such prompt directly on a token
  during the browser verification, not just on the bare rim.

## Verification (definition of done for a wiring PR)

- `/pro` landing lists the deck as ready (live-roster driven, plus
  `FALLBACK_READY`).
- `/pro/game` picker shows the hero; originals carry no unmatched.cards link.
  The picker now also offers a format selector (Duel / 3P FFA / 2v2) and a
  board picker — run deck-wiring verification on the **Duel** format (the
  default) and its default board; the multiplayer formats leave this
  checklist unchanged.
- A seat renders the full hand as card faces (template fallback OK if art
  pending); art resolves by title where art exists.
- The info icon on the hero tile opens `HeroPreviewModal` with the new
  hero's HP/move/reach, sidekick, special ability, and full card list, on
  both `/pro` and `/pro/game`.
- Sandbox `/bag` → Popular decks: the tile fetches and saves the snapshot
  (served from `/evergreen-decks/<deckId>.json`, per `lib/evergreenDecks.ts`).
- `npm run pro:decks:verify`, `npm run lint`, `npm run build`, `npm test` all
  clean (modulo the pre-existing `Pool.spec.ts` failure above).
- One full browser-driven game against the deployed server — drive it with
  the existing `verify` skill (puppeteer, screenshots to `screenshots/`);
  PR #89's verification section is the exemplar.
