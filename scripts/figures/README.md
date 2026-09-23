# Hero miniatures for the tabletop view

The tabletop view can stand a painted-looking 3D miniature on a hero's space
instead of the deck's round token. It is entirely optional: without the
rendered images, every hero lies on its space as its deck's own token, and
nothing else changes.

**No model files or renders are in this repository.** The models below are
published on MakerWorld under their designers' licences (mostly MakerWorld's
Standard Digital File License), which allow downloading and using them but
not redistributing the files. Each deploy downloads and renders its own.

## How it works

1. `3mf-to-stl.cjs` turns a MakerWorld / Bambu Studio `.3mf` into one binary
   STL. It follows the production-extension object files three.js's
   3MFLoader cannot read, applies the plate transforms, and simplifies dense
   models (millions of triangles crash the headless renderer).
2. `render.cjs` renders each model from the table camera's angle, once per
   seat colour, to `public/figures/<heroId>.<seat>.webp`, plus
   `public/figures/manifest.json`.
3. `public/figures/` is git-ignored. `vercel --prod` uploads the working
   tree, so a deploy made from a machine that has the renders ships them; a
   git checkout never does. The app reads the manifest at runtime
   (`lib/pro/useFigureManifest.ts`) and falls back to tokens when it is
   missing.

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
  { "heroId": "boba-fett", "model": "models/boba-fett.stl" },
  { "heroId": "hollow-oak-spice", "model": "models/hollow-oak.stl" }
] }
```

Optional per figure: `"az"` (turn the camera around the model, degrees),
`"elev"` (camera elevation, default 40°), `"footprintMm"` (base width,
default measured).

```bash
PW_PATH=<a playwright install>/node_modules/playwright \
  node scripts/figures/render.cjs $FIG
```

## The models we use

| Hero (`heroId`) | Model | Designer | Notes |
|---|---|---|---|
| `appa` | [Appa Figure](https://makerworld.com/en/models/637934) | printasauruslv | the plate holds three copies: `--item=1` |
| `baba-yaga` | [Baba Yaga Slavic Witch Figure](https://makerworld.com/en/models/3214806) | Marcin | |
| `batman` | [The Dark Knight – Ultra Detailed Solid Edition](https://makerworld.com/en/models/2559226) | Clean Studio | |
| `boba-fett` | [Ultimate Boba Fett – High-Detail](https://makerworld.com/en/models/1941849) | TheMiniSmith3D | |
| `cairne-bloodhoof` | [Baine Bloodhoof – High Chieftain of the Tauren](https://makerworld.com/en/models/2564821) | Cadel | Cairne's son; no full Cairne figure found |
| `clone-troopers` | [Clone Trooper 2](https://makerworld.com/en/models/1509372) | ArMania3d | |
| `darth-maul` | [Darth Maul – High-Detail](https://makerworld.com/en/models/1941931) | TheMiniSmith3D | |
| `darth-vader` | [Darth Vader Miniature](https://makerworld.com/en/models/2142163) | Stache | |
| `doppelganger` | [Doppelganger – Monster Manual 2024](https://makerworld.com/en/models/3029744) | PixelPrint | thematic stand-in |
| `ellen-ripley` | [Miniature Alien Ripley](https://makerworld.com/en/models/1727592) | lagalerylab | |
| `general-grievous` | [General Grievous Inspired Figurine](https://makerworld.com/en/models/1498306) | ArMania3d | first plate is the whole figure: `--item=0` |
| `gerry-the-isopod` | [Articulated Isopod – Porcellio laevis](https://makerworld.com/en/models/1150591) | Insectium3D | |
| `gingerbread-man` | [Gingerbread Man with sword](https://makerworld.com/en/models/2026043) | RandoTheMagical | |
| `hollow-oak`, `hollow-oak-spice` | [Treant Warrior](https://makerworld.com/en/models/2283286) | GBilhalva | thematic stand-in |
| `jason-voorhees` | [New Jason Voorhees from Friday the 13th](https://makerworld.com/en/models/1429201) | Print3DPro.pl | one piece (the "No AMS" versions are kits) |
| `kenshiro` | [Kenshiro – Fist of the North Star](https://makerworld.com/en/models/2650091) | .LordPrintalot. | |
| `king-kong` | [King Kong Statue](https://makerworld.com/en/models/2687689) | neexus | LARGE: drawn ×1.5 between its two spaces |
| `leon-s-kennedy` | [Leon S. Kennedy Resin Figurine](https://makerworld.com/en/models/2641986) | Hex Studio | |
| `luke-skywalker` | [Luke Skywalker / Star Wars-inspired Miniature](https://makerworld.com/en/models/2259478) | Cadel | |
| `malfurion-stormrage` | [Malfurion Stormrage](https://makerworld.com/en/models/2903065) | Cadel | |
| `r2-d2` | [R2-D2 Miniature Statue](https://makerworld.com/en/models/2134928) | Stache | |
| `skull-kid` | [Skull Kid – Majora's Mask](https://makerworld.com/en/models/2686328) | Vinexsoto96 | leaps off a branch by design |
| `the-mandalorian` | [Mandalorian Figurine – no supports](https://makerworld.com/en/models/110973) | Encrust3d | without Grogu, who is his sidekick |
| `thrall` | [Thrall Figure – World of Warcraft](https://makerworld.com/en/models/2568449) | Betyna99 | |
| `triceratops` | [Sweet cute Cartoon triceratops Dinosaur](https://makerworld.com/en/models/2268092) | Nopse | |

No suitable model was found for Buster Keaton, Cecil Palmer, King Taranis,
Nancy Drew, The Narrator, The Piper of the Underroads, Specter Knight and
Thetis; they stay tokens.

Avoid print kits whose parts lie scattered on the plate: the file does not
say how they fit together (Bambu's assembly view was tried and leaves parts
behind).
