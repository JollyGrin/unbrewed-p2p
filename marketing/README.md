# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## DeckAnnouncement — one promo per deck launch

`DeckAnnouncement` is a parameterized 1920×1080 composition: a new deck gets a
20–40s launch video from **one props file plus one render command**. Nothing is
hard-coded per deck — palette, hero statline, quote, special ability, card
faces and card art all come out of the shipped deck JSON.

```console
npm run render:deck -- out/taranis.mp4 --props=props/taranis.json
# or, verbatim:
npx remotion render DeckAnnouncement out/doppelganger.mp4 --props=props/doppelganger.json
```

### Adding a deck

1. Copy an existing file in `props/` and fill it in:

   ```jsonc
   {
     "deckSlug": "taranis",            // public/evergreen-decks/taranis.json
     "tagline": "…",                   // what the deck is FOR, one line
     "featuredCards": [                // 3–4, `title` must match the deck JSON
       { "title": "Gromnir", "caption": "…" }
     ]
   }
   ```

   The props file name is yours to pick; `deckSlug` is the deck JSON's file
   name, which for older decks is an opaque id (`props/thrall.json` renders
   `"deckSlug": "pk1x"`).

2. Render it. That's the whole workflow — 3 featured cards is a 34s video, 4 is
   39s (`calculateMetadata` sets the duration).

Bad input fails the render before frame 0 rather than producing a blank video:
an unknown `deckSlug` (404 on the deck JSON), a card `title` that isn't in the
deck (the error lists the ones that are), or props that miss the schema.

### Scene beats

| Frames (30fps) | Beat |
| --- | --- |
| 250 | cardback turns over into the hero portrait, deck name, hero quote |
| 180 | the `tagline`, backed by the hero's special ability panel |
| 140 per card | featured cards fan in one at a time with their captions |
| 180 | hp / move / melee-or-ranged strip, "Play free at unbrewed.xyz", cardback out |

The cold open is sized around the hero quote — 25–35 words that have to be
readable before the cut. Decks that ship no quote (cairne) would hold a still
frame for five seconds, so they get a 160-frame cold open instead.

### How it reaches the app

- `public/evergreen-decks` is a **symlink** to the app's `public/evergreen-decks`,
  so deck JSON and the 1600×1195 card art are read in place — never copied or
  committed twice. A `git clone` on a platform without symlink support needs
  it recreated (`ln -s ../../public/evergreen-decks public/evergreen-decks`).
- Card faces are the app's real renderer (`components/CardFactory/Card.tsx`),
  imported directly — the promo shows exactly what players see at the table.
  Remotion's webpack config aliases `react` to a single copy, so importing
  across the package boundary is safe; `tsconfig.json` maps the app's `@/*`
  paths so `tsc` can follow it.
- `src/fonts.tsx` exports `<BrandFonts>`, which holds the render open until the
  brand fonts are really on the page. `loadFont()` alone does not: it registers
  its `delayRender` while the bundle is evaluating, before any composition
  mounts, so frames come out in the fallback face. `UnbrewedTrailer` and
  `UnbrewedDemo` still have that bug and can adopt the same wrapper.

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
