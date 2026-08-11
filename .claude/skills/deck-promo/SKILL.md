---
name: deck-promo
description: Produce a 20–40s launch promo video for an Unbrewed deck — props file, Remotion render, Discord-sized copy. Use for "make a promo/announcement video for deck X", "promo clip for <hero>", or refreshing an existing deck promo.
---

# Deck announcement promo

Everything runs from `marketing/` and renders the `DeckAnnouncement`
composition. One props file per deck; the template reads the rest out of the
shipped deck JSON. **Never** hand-write deck facts (hp, ability text, palette)
into the props — if it's in the deck JSON, the video already has it.

## 0. Prerequisites

```bash
cd marketing
npm install                                   # its own package, not the app's
ls public/evergreen-decks/<slug>.json         # deck data (symlink to the app's public/)
ls public/evergreen-decks/art/<slug>/         # card art + cardback + token-*.webp
ffmpeg -version                               # needed only for the Discord copy
```

- `<slug>` is the **deck JSON file name**, which for older decks is an opaque
  id. Find it by hero name:
  ```bash
  cd public/evergreen-decks && for f in *.json; do
    python3 -c "import json;d=json.load(open('$f'));print('$f', d['deck_data']['hero']['name'])"; done
  ```
  (thrall → `pk1x`, cairne → `p82X`, malfurion → `malfurion-stormrage`.)
- If the symlink is missing: `ln -s ../../public/evergreen-decks public/evergreen-decks`.
- No deck JSON or no art dir → stop and say so. Do not fabricate a deck.

## 1. Write the props file

`marketing/props/<name>.json` — the file name is yours (use the hero's common
name); `deckSlug` is the JSON file name from step 0.

```json
{
  "deckSlug": "pk1x",
  "tagline": "Board-engine ramp that turns a field of totems into fuel",
  "featuredCards": [
    { "title": "Nature's Call", "caption": "…" }
  ]
}
```

- **tagline** — seed from the playstyle map, section 1 of
  `~/git/unbrewed/research/deck-design-space.md` (one identity line per shipped
  deck), rewritten as marketing copy. ≤ 140 chars; ~50–60 reads best.
- **featuredCards** — 3 or 4, `title` matching the deck JSON exactly (matching
  is case-insensitive, so the deck's own casing is fine). Order them as the
  deck's arc: setup → engine → payoff → cash-out.
- **captions** — ≤ 180 chars, one idea, says why the card matters rather than
  restating its rules text (the card face is on screen beside it).

Read the deck before picking:

```bash
python3 -c "
import json;d=json.load(open('public/evergreen-decks/<slug>.json'))['deck_data']
print(d['hero'])
for c in d['cards']: print(c['title'], c['type'], c.get('value'), c.get('boost'), 'x%s'%c['quantity'],
  ' | '.join(x for x in [c['basicText'],c['immediateText'],c['duringText'],c['afterText']] if x)[:150])"
```

**Always list the tagline + card picks and one-line reasons for Dean before
posting the video anywhere** — the editorial choice is his call, the render is
not.

## 2. Render

```bash
npm run promo -- <name>          # render + Discord copy, the usual path
npm run promo -- taranis         # → out/taranis.mp4 + out/taranis-discord.mp4
```

Pieces, if you need them separately:

```bash
npx remotion render DeckAnnouncement out/<name>.mp4 --props=props/<name>.json
node scripts/compress-discord.mjs <name>          # → out/<name>-discord.mp4, <8MB, 720p
npm run dev                                       # Remotion Studio, to iterate on timing
```

Outputs land in `marketing/out/`, which is **gitignored — commit the props
file, never the mp4s.** Hand the mp4s to the user with the file tool.

Duration is computed from the props: 3 cards → 1030f (34.3s), 4 cards → 1170f
(39s) at 30fps. Both are inside the 20–40s brief; don't add a 5th card.

## 3. Check the render

Pull one frame per beat and actually look at them:

```bash
for f in 100 300 620 1100; do ffmpeg -loglevel error -y -ss $(python3 -c "print($f/30)") \
  -i out/<name>.mp4 -frames:v 1 -vf scale=1000:-1 /tmp/<name>_$f.png; done
```

Beats: cold open (cardback → hero, name, quote) · tagline + ability panel ·
one featured card per 140f · CTA statline + cardback out.

## Quirks

- **No `hero.quote` in the deck JSON** (cairne): the cold open drops from 250f
  to 160f automatically so it doesn't hold a still frame. Nothing to do — but
  expect a shorter video and a name-only opener.
- **Light deck colours**: `borderColour` is a card-border colour, and some
  decks are fluorescent (thrall `#86d41a`, cairne `#60f10f`). `paletteFor()`
  mixes a light base down onto the brand's dark surface and lifts a too-dark
  accent. Don't "fix" a deck's palette in the props — there is no palette prop.
- **Failures are loud and specific**, before frame 0: a bad `deckSlug` is a 404
  with the path, a bad card title lists every real title, off-schema props are
  a ZodError. Read the message; do not go hunting.
- **Schemes**: some decks carry a `value` on scheme cards. The card face and
  the caption both hide it. Not a bug.
- **Card art** must resolve under `evergreen-decks/…`; absolute
  `https://unbrewed.xyz/...` urls are rewritten to local files. Art living
  anywhere else renders as an empty art window.
- **Fonts**: composition content must sit inside `<BrandFonts>` (see
  `src/fonts.tsx`). `loadFont()` alone does not hold the render, so text comes
  out in the fallback face.
- Animate with `useCurrentFrame()` + `interpolate`/`spring` only. CSS
  transitions and keyframes do not render in Remotion.

## Adding a new scene or changing timing

`src/DeckAnnouncement/index.tsx` owns the frame budget (`coldOpenFrames`,
`NICHE`, `PER_CARD`, `CTA`, `totalDuration`) — change it there, not in a scene,
so `calculateMetadata` and the Sequences stay in sync. Re-render **every** deck
in `props/` afterwards; palette and timing changes are template-wide.
