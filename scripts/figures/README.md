# Hero miniatures for the tabletop view

The tabletop view can stand a painted-looking 3D miniature on a hero's space
instead of the deck's round token. It is entirely optional: without the
rendered images, every hero lies on its space as its deck's own token, and
nothing else changes.

**No model files or renders are in this repository.** The models below are
published on MakerWorld under their designers' licences (mostly MakerWorld's
Standard Digital File License), which allow downloading and using them but
not redistributing the files.

## The licence rule

**No figure for any official hero, and no model whose licence forbids
redistribution.** (Dean, 2026-09-26, unbrewed-p2p-879.)

The code enforces the declarations; it does not make them. Every entry in
`figures.json` must state all three of:

| Field | Required value |
|---|---|
| `license` | the model's licence: an SPDX id (`CC-BY-4.0`) or a named licence |
| `redistributable` | `true` — the licence allows redistributing renders of the model |
| `officialHero` | `false` — the hero is not an official character |

It fails closed at every step:

- `render.cjs` skips an entry that is missing a field or declares otherwise,
  deletes that hero's old renders, and leaves it out of `manifest.json`
  (`clearance.cjs`).
- The app drops the same entries when it reads the manifest
  (`isCleared` in `lib/pro/figures.ts`), so a hand-edited or stale manifest
  cannot bring one back. That hero keeps its token.
- `public/figures/` is in `.vercelignore` as well as `.gitignore`, so a local
  render does not ship with `vercel` / `vercel --prod`.

Which heroes count as official, and which licences allow redistribution, is
decided by Dean row by row in the table below. The app has no list of hero
ids; `officialHero` in the manifest is the only input.

## How it works

1. `3mf-to-stl.cjs` turns a MakerWorld / Bambu Studio `.3mf` into one binary
   STL. It follows the production-extension object files three.js's
   3MFLoader cannot read, applies the plate transforms, and simplifies dense
   models (millions of triangles crash the headless renderer).
2. `render.cjs` renders each model from the table camera's angle, once per
   seat colour, to `public/figures/<heroId>.<seat>.webp`, plus
   `public/figures/manifest.json`.
3. `public/figures/` is git-ignored and vercel-ignored: neither a git
   checkout nor a `vercel` upload carries it. The app reads the manifest at
   runtime (`lib/pro/useFigureManifest.ts`) and falls back to tokens when it
   is missing, and for every entry that is not cleared.

## Setup

```bash
FIG=~/Developer/unbrewed-figures        # anywhere outside the repo
mkdir -p $FIG/models/raw
# download each model's .3mf from the links below into $FIG/models/raw/, then:
node scripts/figures/3mf-to-stl.cjs $FIG/models/raw/boba-fett.3mf $FIG/models/boba-fett.stl
```

`$FIG/figures.json` maps heroes to models:

```json
{ "figures": [
  { "heroId": "hollow-oak-spice", "model": "models/hollow-oak.stl",
    "license": "CC-BY-4.0", "redistributable": true, "officialHero": false }
] }
```

(This only illustrates the shape. It is not a ruling on that model.)

Optional per figure: `"az"` (turn the camera around the model, degrees),
`"elev"` (camera elevation, default 40°), `"footprintMm"` (base width,
default measured).

```bash
PW_PATH=<a playwright install>/node_modules/playwright \
  node scripts/figures/render.cjs $FIG
```

## Serving figures on a deploy (explicit opt-in)

Nothing ships figures by default. To serve cleared figures on a Vercel
deploy, the deployer renders with only cleared entries in `figures.json`,
then deliberately removes the `/public/figures` line from `.vercelignore`
for that one deploy and puts it back afterwards. Never commit that removal.

`.vercelignore` governs the source upload only. `vercel build` followed by
`vercel deploy --prebuilt` copies `public/` into `.vercel/output/` locally
and does not read `.vercelignore`, so delete `public/figures/` before a
prebuilt deploy. The production site (GitHub Pages, built from a git
checkout) never has the folder.

## The models we use

Licence and Status are **unreviewed** for every row: none of these models is
cleared, so today every hero stays a token. Each row needs a ruling on the
model's actual licence and on whether the hero is official before its
`figures.json` entry may declare `redistributable: true` and
`officialHero: false`.

| Hero (`heroId`) | Model | Designer | Licence | Status | Notes |
|---|---|---|---|---|---|
| `appa` | [Appa Figure](https://makerworld.com/en/models/637934) | printasauruslv | unreviewed | unreviewed | the plate holds three copies: `--item=1` |
| `baba-yaga` | [Baba Yaga Slavic Witch Figure](https://makerworld.com/en/models/3214806) | Marcin | unreviewed | unreviewed | |
| `batman` | [The Dark Knight – Ultra Detailed Solid Edition](https://makerworld.com/en/models/2559226) | Clean Studio | unreviewed | unreviewed | |
| `boba-fett` | [Ultimate Boba Fett – High-Detail](https://makerworld.com/en/models/1941849) | TheMiniSmith3D | unreviewed | unreviewed | |
| `cairne-bloodhoof` | [Baine Bloodhoof – High Chieftain of the Tauren](https://makerworld.com/en/models/2564821) | Cadel | unreviewed | unreviewed | Cairne's son; no full Cairne figure found |
| `clone-troopers` | [Clone Trooper 2](https://makerworld.com/en/models/1509372) | ArMania3d | unreviewed | unreviewed | |
| `darth-maul` | [Darth Maul – High-Detail](https://makerworld.com/en/models/1941931) | TheMiniSmith3D | unreviewed | unreviewed | |
| `darth-vader` | [Darth Vader Miniature](https://makerworld.com/en/models/2142163) | Stache | unreviewed | unreviewed | |
| `doppelganger` | [Doppelganger – Monster Manual 2024](https://makerworld.com/en/models/3029744) | PixelPrint | unreviewed | unreviewed | thematic stand-in |
| `ellen-ripley` | [Miniature Alien Ripley](https://makerworld.com/en/models/1727592) | lagalerylab | unreviewed | unreviewed | |
| `general-grievous` | [General Grievous Inspired Figurine](https://makerworld.com/en/models/1498306) | ArMania3d | unreviewed | unreviewed | first plate is the whole figure: `--item=0` |
| `gerry-the-isopod` | [Articulated Isopod – Porcellio laevis](https://makerworld.com/en/models/1150591) | Insectium3D | unreviewed | unreviewed | |
| `gingerbread-man` | [Gingerbread Man with sword](https://makerworld.com/en/models/2026043) | RandoTheMagical | unreviewed | unreviewed | |
| `hollow-oak`, `hollow-oak-spice` | [Treant Warrior](https://makerworld.com/en/models/2283286) | GBilhalva | unreviewed | unreviewed | thematic stand-in |
| `jason-voorhees` | [New Jason Voorhees from Friday the 13th](https://makerworld.com/en/models/1429201) | Print3DPro.pl | unreviewed | unreviewed | one piece (the "No AMS" versions are kits) |
| `kenshiro` | [Kenshiro – Fist of the North Star](https://makerworld.com/en/models/2650091) | .LordPrintalot. | unreviewed | unreviewed | |
| `king-kong` | [King Kong Statue](https://makerworld.com/en/models/2687689) | neexus | unreviewed | unreviewed | LARGE: drawn ×1.5 between its two spaces |
| `leon-s-kennedy` | [Leon S. Kennedy Resin Figurine](https://makerworld.com/en/models/2641986) | Hex Studio | unreviewed | unreviewed | |
| `luke-skywalker` | [Luke Skywalker / Star Wars-inspired Miniature](https://makerworld.com/en/models/2259478) | Cadel | unreviewed | unreviewed | |
| `malfurion-stormrage` | [Malfurion Stormrage](https://makerworld.com/en/models/2903065) | Cadel | unreviewed | unreviewed | |
| `r2-d2` | [R2-D2 Miniature Statue](https://makerworld.com/en/models/2134928) | Stache | unreviewed | unreviewed | |
| `skull-kid` | [Skull Kid – Majora's Mask](https://makerworld.com/en/models/2686328) | Vinexsoto96 | unreviewed | unreviewed | leaps off a branch by design |
| `the-mandalorian` | [Mandalorian Figurine – no supports](https://makerworld.com/en/models/110973) | Encrust3d | unreviewed | unreviewed | without Grogu, who is his sidekick |
| `thrall` | [Thrall Figure – World of Warcraft](https://makerworld.com/en/models/2568449) | Betyna99 | unreviewed | unreviewed | |
| `triceratops` | [Sweet cute Cartoon triceratops Dinosaur](https://makerworld.com/en/models/2268092) | Nopse | unreviewed | unreviewed | |

No suitable model was found for Buster Keaton, Cecil Palmer, King Taranis,
Nancy Drew, The Narrator, The Piper of the Underroads, Specter Knight and
Thetis; they stay tokens.

Avoid print kits whose parts lie scattered on the plate: the file does not
say how they fit together (Bambu's assembly view was tried and leaves parts
behind).
