# Image-only decks — findings & approach

_Researched 2026-07-03. Question: how do we let people play decks made of whole-card **images** (e.g. The Unmatched Club decks with PAYMENT bars, status tracks, and layouts the unmatched.cards template can't render) alongside the existing generated decks?_

## TL;DR recommendation

Add one optional field to the card type — an image reference — and a thin
render branch: **a card with an image renders the image; a card without one
renders the existing SVG template**. Nothing else in the game changes: the
existing card system stays byte-for-byte intact, decks can freely mix
template cards and image cards, and everything (draw, commit, boost,
discard, opponent sync) keeps working because game logic never looks at how
a card renders.

Ship it in three phases:

1. **Phase 1 — render + hand-built decks (small):** optional
   `cardImage` on `DeckImportCardType`, `Card` wrapper component, a simple
   "Image deck" builder in the Bag (paste one image URL per line +
   quantity). This unblocks the users who are asking today.
2. **Phase 2 — TTS import (the real unlock, medium):** import Tabletop
   Simulator JSON. It's the de-facto interchange format both unmatched.cards
   **and** the-unmatched.club already export, and it carries sprite-sheet
   URLs + grid dimensions + card backs for the whole deck. One import button
   covers essentially every image deck in the wild.
3. **Phase 3 — quality of life (later):** hero/sidekick metadata editing,
   per-card boost/value metadata for mechanics, curated hosting guidance.

**Hard constraint discovered:** it must be image **URLs**, never uploaded /
base64 image data. Details below.

---

## 1. What image decks actually look like in the wild

(Community research, sources at bottom.)

- **The Unmatched Club** (the-unmatched.club) is a full creation studio
  (hero/map/villain/minion builders) producing exactly the rich layouts the
  unmatched.cards template can't express. Decks are delivered as **rendered
  card images** with two machine paths: print-and-play export and
  **Tabletop Simulator export**. There is no public JSON card-list API.
- **unmatched.cards** itself exports: single-image sheet of all cards, ZIP of
  one image per card, and **TTS JSON**.
- **Tabletop Simulator** is the reference implementation for user card
  images: a deck is a **sprite sheet** (one grid image the engine cuts up,
  columns × rows declared in JSON; last cell or a dedicated image is the
  card back), referenced **by URL**. The big Unmatched Workshop mod
  (250+ decks) uses this format.
- Comparable browser sims either own all card art and import only deck lists
  (Karabast, realms.cards) or accept **hosted image URLs** (TTS,
  playingcards.io — which requires *direct* image links). Nobody without a
  backend accepts raw uploads.

So the two real-world shapes we must handle are:
**(a) sprite sheet + grid** (TTS) and **(b) one image per card** (PnP zips,
hand-assembled decks).

## 2. Constraints from our architecture

These are the facts that shaped the design (verified in code this session):

- **Cards are data, rendering is a leaf.** `DeckImportCardType` objects move
  through every zone (`deck`/`hand`/`discard`/`commit` in
  `components/DeckPool/PoolFns.ts`) and the **whole pool is rebroadcast over
  the websocket on every action** (last-write-wins, no server logic). The
  renderer (`CardFactory`) is only consulted at draw time.
- Therefore **any field we put on a card object automatically reaches the
  opponent** — no server change, no protocol change.
- Therefore **base64 image data is a non-starter**: it would ride along in
  *every* state broadcast (a 60-card deck of 200KB images ≈ 12MB per
  message) and would blow the ~5MB localStorage budget the bag already
  tracks. **URLs only.** This is also exactly how maps already work
  (`MAP_LIST`, paste an image URL), so there's UX precedent.
- **Why not a deck-level image index** (deck stores `images[]`, cards store
  an index)? Once a card is in your hand/discard/commit it's a detached
  object, and the pool synced to opponents does **not** carry
  `deck_data`-level info (confirmed: `PoolType` has no `appearance`). An
  index would force threading a lookup table into the pool and into every
  render site on both clients. Per-card reference is self-contained; the
  only cost is a repeated URL string across duplicate copies (~60 bytes × 30
  — negligible).
- **Static site, no backend**: we cannot host uploads. We can only reference
  images others host (and bundle a few curated ones in `public/`, like the
  top-decks snapshot).

## 3. The design

### Data model (one field)

```ts
// deck-import.type.ts
export type CardImageRef = {
  url: string;        // direct image URL (sheet or single card)
  // sprite-sheet support (TTS): omit for single-card images
  cols?: number;      // sheet columns
  rows?: number;      // sheet rows
  index?: number;     // 0-based cell for THIS card
};

export type DeckImportCardType = {
  // ...existing fields unchanged...
  cardImage?: CardImageRef; // when set, the face IS this image
};
```

Existing `imageUrl` (top-panel art in the template) stays untouched.

### Rendering (one branch)

```tsx
// components/CardFactory/Card.tsx
export const Card = ({ card }) =>
  card.cardImage ? <ImageCard image={card.cardImage} title={card.title} />
                 : <CardFactory card={card} />;
```

- Single image: `<img>` with `object-fit: contain`, 63:88 aspect.
- Sprite sheet: a div with `background-image`, `background-size:
  {cols*100}% {rows*100}%`, `background-position` computed from `index` —
  pure CSS, no canvas, works in the memoized/CSS-hover world we just built.
- `onError` → fall back to `CardFactory` (template still renders title/type
  if present) so a dead link degrades instead of blanking the table.
- Swap `CardFactory` → `Card` at the five render sites (hand fan, deck/commit
  modal, discard modal, bag preview ×2).

### Import UX

- **Phase 1 — "Image deck" builder** in the Bag next to AddJson: deck name,
  hero hp/move, then one line per card: `imageUrl [, quantity] [, title]`.
  Live thumbnail preview. Saved as a normal `DeckImportType` (so backup,
  starring, popular-deck flows, and the websocket all just work). Fields the
  template needs (`type`, `value`, `boost`) default to neutral values —
  they're visible on the card art itself.
- **Phase 2 — "Import from Tabletop Simulator"**: accept a TTS save/object
  JSON, read `CustomDeck` entries (`FaceURL`, `BackURL`, `NumWidth`,
  `NumHeight`) and the contained card ids (which encode sheet + cell +
  duplicates), and generate the same `DeckImportType` with `cardImage`
  sheet refs. Card backs from `BackURL` can feed the face-down commit view
  later.

### Mechanics on image cards

`boost`/`value` drive real mechanics (boost buttons, HUD). For image cards
these are optional: default `boost: 0`, `value: null`, and players read the
printed card like they would at a physical table. The builder can offer
optional per-card overrides later (Phase 3) — don't block Phase 1 on it.

## 4. Risks / challenges (and answers)

- **Link rot** (already bit us: a dead imgur cardback in the top-decks
  snapshot; imgur killed anonymous uploads in 2023 and is actively
  regressing). Mitigation: recommend GitHub-repo-hosted images (optionally
  via jsDelivr) or catbox.moe in the builder's help text; never imgur. The
  `onError` template fallback keeps games playable when a link dies, and the
  Backup tab keeps the deck *structure* safe.
- **Opponent visibility**: opponents' browsers fetch the same URLs — hosts
  must be publicly reachable (no Google Drive "sharing page" links;
  playingcards.io has the same direct-link rule). Validate that the URL
  looks like a direct image (extension or `HEAD` content-type check) in the
  builder.
- **CORS**: not an issue — plain `<img>`/`background-image` rendering needs
  no CORS (we never read pixels). The existing map feature proves this.
- **Sheet size**: TTS sheets can be 4096px+; browsers handle them fine as
  background images, and one sheet per deck is *fewer* requests than 30
  per-card images.
- **Copyright**: same posture as maps and unmatched.cards decks today —
  user-supplied references, nothing hosted by us. No change.

## 5. Effort estimate

| Piece | Size |
|---|---|
| `cardImage` field + `Card` wrapper + 5 call sites + fallback | ~half a day |
| Bag image-deck builder (URL list + preview + save) | ~a day |
| TTS JSON import (parse `CustomDeck`, sheet math, tests) | ~1–2 days |
| Hosting guidance + validation polish | hours |

## Sources

- The Unmatched Club studio & TTS export: https://www.the-unmatched.club/c/studio
- unmatched.cards export options: https://unmatched.cards/posts/site-news
- TTS custom deck format (sprite sheets, backs): https://kb.tabletopsimulator.com/custom-content/custom-deck/
- Unmatched TTS mega-mod: https://steamcommunity.com/sharedfiles/filedetails/?id=2419265114
- playingcards.io direct-image-link requirement: https://playingcards.io/docs/custom-decks
- Imgur decline: https://lpic.cc/en/blog/imgur-alternatives
