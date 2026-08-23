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
- **musicTrack** — optional, `"level-1"` (default) · `"level-2"` · `"level-3"`,
  the committed Juhani Junkala chiptunes. Leave it out unless a deck wants a
  different vibe; `level-1` is the driving character-select one.
- **particleStyle** — optional, `"motes"` (default) · `"embers"` · `"aura"` ·
  `"ash"`: which ambient field drifts behind the video (see *Particle flourish*
  below). Tinted from the deck's own `highlightColour`, so it is a texture
  choice, not a colour one. Shipped picks: taranis + cairne `embers`,
  malfurion `aura`, doppelganger `ash`, thrall the default. Omit it unless a
  deck clearly wants one — `motes` is the conservative answer.

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

**Then archive them — every promo lives in `~/git/unbrewed/deck-promos/`:**

```bash
cp out/<name>.mp4 out/<name>-discord.mp4 ~/git/unbrewed/deck-promos/
```

`marketing/out/` is scratch and dies with a worktree; `deck-promos/` is the
one folder Dean looks in for all deck videos. Do this before any worktree
teardown, and not only on the final render — re-copy after every re-render.

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

Listen to it too — the render carries a full audio layer:

| Beat | Sound |
| --- | --- |
| Cold open | riser under the cardback turn → slam on the deck name (+ a soft blip on the quote) |
| Tagline / ability | one blip per reveal — the headline, then the ability panel |
| Featured cards | swish in, thock on landing, coin accent on the value/boost line |
| CTA | statline ticks, a confirm on the url, then the closing hit + 8-bit sting |

A chiptune bed runs under all of it, ducking under each hit and fading out
before the sting. Cue frames live in `src/DeckAnnouncement/audio.tsx` and are
built from `promoTimeline()`, so retiming a scene retimes its sound.

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
- **The app's `@/…` alias** is wired for webpack in `remotion.config.ts` (and
  for `tsc` in `tsconfig.json`). The card renderer imports through it, so a
  render fails at bundle time if that alias is dropped.
- Animate with `useCurrentFrame()` + `interpolate`/`spring` only. CSS
  transitions and keyframes do not render in Remotion.

## Adding a new scene or changing timing

Anything generic — palette maths, the deck loader, `CardFace`, the particle
maths, `SceneFade`/`Eyebrow`/`Wordmark`, the audio primitives — lives in
`src/shared/` and is used by `CosmeticsAnnouncement` too, so changing it
changes that video as well.

`src/DeckAnnouncement/timeline.ts` owns the frame budget (`coldOpenFrames`,
`NICHE`, `PER_CARD`, `CTA`, `totalDuration`, `promoTimeline`) — change it there,
not in a scene, so `calculateMetadata`, the Sequences and the audio cues stay in
sync. Re-render **every** deck in `props/` afterwards; palette, timing and audio
changes are template-wide.

If you move a beat *inside* a scene (the name rise, a card's landing, the CTA
outro), move its cue frame in the `CUE` table in `src/DeckAnnouncement/timeline.ts`
to match — those are that scene's own animation frames, and both the audio cues
(`audio.tsx`) and the particle bursts (`Flourish.tsx`) are built from them, so
one edit retimes the sound and its burst together.

## Particle flourish

An ambient particle layer runs behind every scene. The maths is generic and
lives in `src/shared/particles.ts` (no React); the divs are in
`src/shared/Flourish.tsx`; and WHICH frames burst plus how far the field dims
beat by beat is this composition's own, in `src/DeckAnnouncement/particles.ts`
(`burstsFor`, `ambientDim`). Three parts, all tinted from the deck's
`highlightColour`:

| Layer | What it does |
| --- | --- |
| Ambient field | ~48 particles in 3 depth layers (back small/slow, front large/fast) drifting the whole video |
| Cue bursts | a spark burst on the deck-name slam, a dust puff under each card as it lands, a shimmer sweep on the closing sting |
| Hero aura | a slow breathing glow behind the hero art on the cold open, under its ken-burns push |

Two rules are not negotiable, and `npm run check:flourish` enforces both:

- **Determinism.** Remotion renders frames independently and in parallel, so a
  particle may only depend on (its seed, the frame). Every roll goes through
  Remotion's seeded `random()` keyed on the particle's index — **`Math.random()`
  is forbidden anywhere in the composition**; it re-rolls per frame and the
  field strobes.
- **Subtlety.** The flourish mounts between the backdrop and the scenes, so it
  is always behind text and card faces, no particle passes ~0.2 opacity, and
  `ambientDim()` pulls the field down to ~0.3 under the beats the viewer is
  reading (the quote, the tagline + ability panel, every caption). Seasoning,
  not a screensaver — when in doubt, less.

Bursts are windows, not triggers: `burstProgress()` is exactly 0 outside
`[cue, cue + duration)`, which is what makes "no stray flickers" checkable.
`check:flourish` walks every frame of every deck shape — and of the fixed
`CosmeticsAnnouncement` storyboard — and fails if a burst draws anything
off-cue, if the field breaks its opacity budget, or if it does not back off
under a reading beat. Run it after touching either file.

Animate the flourish the same way as everything else: `useCurrentFrame()` +
`interpolate()`, plain divs, no CSS animation, no per-frame `blur()` (soft dots
are radial gradients — blur is the one cheap-looking effect that is genuinely
expensive).

## Audio assets are CC0 only — no exceptions

Everything under `marketing/public/audio/` is CC0 (Kenney SFX packs, Juhani
Junkala's 5 Chiptunes) and listed in `marketing/public/audio/LICENSES.md`.
These videos are posted publicly and stay up forever, so:

- Add nothing that needs a credit line — no CC-BY, no "free for personal use",
  no "royalty-free with attribution", and not the remotion.media stock SFX
  (wrong vibe, and not CC0 across the board).
- Commit only the files a cue actually uses, and add a row to `LICENSES.md`
  with the original file name, its pack, the source URL and the CC0 statement.
- SFX are WAV, music is MP3, both transcoded from the source download —
  say so in `LICENSES.md` if you transcode something new.
