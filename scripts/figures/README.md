# Hero miniatures for the tabletop view

The tabletop view can stand a painted-looking 3D miniature on a hero's space
instead of the deck's round token. It is entirely optional: without the
rendered images, every hero lies on its space as its deck's own token, and
nothing else changes.

There are two sets:

- **The open set** (`public/figures-open/`, committed and deployed): renders
  of open-licence models (CC0 / CC-BY / CC-BY-SA), so every checkout and
  deploy has them. See [The open set](#the-open-set) below.
- **The private set** (`public/figures/`, git-ignored and vercel-ignored):
  the owner's local renders of MakerWorld models. **No model files or
  renders of it are in this repository.** Those models are published under
  MakerWorld's Standard Digital File License, which allows downloading and
  using them but not redistributing the files.

In Tabletop view the player picks which set the heroes stand as, or plain
tokens (the "Heroes" chip beside the board chip; on a phone, Game menu →
"Heroes — …"). Only the choices that change something on that board are
offered, and none at all when every hero there would be a token. The choice
is stored per device (`pro-figure-style` in localStorage).

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

## The open set

Committed under `public/figures-open/`: the per-seat renders
(`<heroId>.<seat>.webp`, 4 seats) and `manifest.json`, plus
[`CREDITS.md`](../../public/figures-open/CREDITS.md). The model files are
**not** committed (they are 14–47 MB each); the table below says where each
one comes from.

Its config is `scripts/figures/figures-open.json` (committed). Every entry
declares the same three clearance fields as the private set **plus the
attribution** the app shows in the hero's info (CC-BY requires it):

| Field | Required value |
|---|---|
| `modelName` | the model's title as published |
| `creator` | who made it, as credited on the source page |
| `sourceUrl` | the source page, `https://` |

An open entry missing any of them is not rendered (`openRenderBlockers` in
`clearance.cjs`) and is dropped by the app (`parseFigureManifest(…, "open")`
in `lib/pro/figures.ts`), so that hero stays a token.

To re-render, download the models into one folder under the file names in
`figures-open.json`, then:

```bash
PW_PATH=<a playwright install>/node_modules/playwright \
  node scripts/figures/render.cjs --open <that folder>
```

`render.cjs` reads STL, 3MF and glTF (`.glb`); per entry, `rx` / `rz`
stand up a model published lying down, and `mesh` picks one mesh out of a
multi-model glTF pack.

Officialness: none of these heroes is official — Unbrewed has no Restoration
Games decks (Dean, 2026-09-26) — so every entry declares
`officialHero: false`.

| Hero (`heroId`) | Model | Creator | Licence (as seen on the source page) | Source | Checked | Model file |
|---|---|---|---|---|---|---|
| `triceratops` | Triceratops Horridus Marsh | Smithsonian Institution | CC0 Public Domain | [sketchfab.com](https://sketchfab.com/3d-models/triceratops-horridus-marsh-e9c507f179ed4455aac3b208c9e6c973) | 2026-09-26 | the same 150k-triangle scan, downloaded without an account from the Smithsonian's 3D API: `https://3d-api.si.edu/content/document/3d_package:d8c623be-4ebc-11ea-b77f-2e728ce88125/resources/Triceratops_horridus_Marsh_1889-150k-4096.glb` → `triceratops-horridus-marsh-150k.glb`. The fossil is mounted lying on its side, as found; `rz: 90` sets it on the ground. |
| `baba-yaga` | Witch Minis (Witch 2) | mz4250 | CC BY-SA (Thingiverse: "Creative Commons - Attribution - Share Alike"; no version stated) | [thingiverse.com/thing:6694128](https://www.thingiverse.com/thing:6694128) | 2026-09-26 | `files/Witch_2.stl` from the thing's "Download all files" zip → `witch-minis-witch-2.stl`. ShareAlike: the renders are CC BY-SA too. The same model on Printables (model/941392) is labelled CC-BY; we follow the stricter Thingiverse licence. |

## Setup (private set)

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

These rows are **ruled**, not unreviewed (Dean, 2026-09-26): every model
here is published under MakerWorld's Standard Digital File License, which
does not allow redistribution, and we respect it. These models and their
renders are never committed, never shipped, and never cleared by the gate —
their `figures.json` entries stay without `redistributable: true`, so
`render.cjs` skips them and the app drops them. They are for the owner's
local renders only.

| Hero (`heroId`) | Model | Designer | Licence | Status | Notes |
|---|---|---|---|---|---|
| `appa` | [Appa Figure](https://makerworld.com/en/models/637934) | printasauruslv | MakerWorld Standard Digital File License | not redistributable | the plate holds three copies: `--item=1` |
| `baba-yaga` | [Baba Yaga Slavic Witch Figure](https://makerworld.com/en/models/3214806) | Marcin | MakerWorld Standard Digital File License | not redistributable | |
| `batman` | [The Dark Knight – Ultra Detailed Solid Edition](https://makerworld.com/en/models/2559226) | Clean Studio | MakerWorld Standard Digital File License | not redistributable | |
| `boba-fett` | [Ultimate Boba Fett – High-Detail](https://makerworld.com/en/models/1941849) | TheMiniSmith3D | MakerWorld Standard Digital File License | not redistributable | |
| `cairne-bloodhoof` | [Baine Bloodhoof – High Chieftain of the Tauren](https://makerworld.com/en/models/2564821) | Cadel | MakerWorld Standard Digital File License | not redistributable | Cairne's son; no full Cairne figure found |
| `clone-troopers` | [Clone Trooper 2](https://makerworld.com/en/models/1509372) | ArMania3d | MakerWorld Standard Digital File License | not redistributable | |
| `darth-maul` | [Darth Maul – High-Detail](https://makerworld.com/en/models/1941931) | TheMiniSmith3D | MakerWorld Standard Digital File License | not redistributable | |
| `darth-vader` | [Darth Vader Miniature](https://makerworld.com/en/models/2142163) | Stache | MakerWorld Standard Digital File License | not redistributable | |
| `doppelganger` | [Doppelganger – Monster Manual 2024](https://makerworld.com/en/models/3029744) | PixelPrint | MakerWorld Standard Digital File License | not redistributable | thematic stand-in |
| `ellen-ripley` | [Miniature Alien Ripley](https://makerworld.com/en/models/1727592) | lagalerylab | MakerWorld Standard Digital File License | not redistributable | |
| `general-grievous` | [General Grievous Inspired Figurine](https://makerworld.com/en/models/1498306) | ArMania3d | MakerWorld Standard Digital File License | not redistributable | first plate is the whole figure: `--item=0` |
| `gerry-the-isopod` | [Articulated Isopod – Porcellio laevis](https://makerworld.com/en/models/1150591) | Insectium3D | MakerWorld Standard Digital File License | not redistributable | |
| `gingerbread-man` | [Gingerbread Man with sword](https://makerworld.com/en/models/2026043) | RandoTheMagical | MakerWorld Standard Digital File License | not redistributable | |
| `hollow-oak`, `hollow-oak-spice` | [Treant Warrior](https://makerworld.com/en/models/2283286) | GBilhalva | MakerWorld Standard Digital File License | not redistributable | thematic stand-in |
| `jason-voorhees` | [New Jason Voorhees from Friday the 13th](https://makerworld.com/en/models/1429201) | Print3DPro.pl | MakerWorld Standard Digital File License | not redistributable | one piece (the "No AMS" versions are kits) |
| `kenshiro` | [Kenshiro – Fist of the North Star](https://makerworld.com/en/models/2650091) | .LordPrintalot. | MakerWorld Standard Digital File License | not redistributable | |
| `king-kong` | [King Kong Statue](https://makerworld.com/en/models/2687689) | neexus | MakerWorld Standard Digital File License | not redistributable | LARGE: drawn ×1.5 between its two spaces |
| `leon-s-kennedy` | [Leon S. Kennedy Resin Figurine](https://makerworld.com/en/models/2641986) | Hex Studio | MakerWorld Standard Digital File License | not redistributable | |
| `luke-skywalker` | [Luke Skywalker / Star Wars-inspired Miniature](https://makerworld.com/en/models/2259478) | Cadel | MakerWorld Standard Digital File License | not redistributable | |
| `malfurion-stormrage` | [Malfurion Stormrage](https://makerworld.com/en/models/2903065) | Cadel | MakerWorld Standard Digital File License | not redistributable | |
| `r2-d2` | [R2-D2 Miniature Statue](https://makerworld.com/en/models/2134928) | Stache | MakerWorld Standard Digital File License | not redistributable | |
| `skull-kid` | [Skull Kid – Majora's Mask](https://makerworld.com/en/models/2686328) | Vinexsoto96 | MakerWorld Standard Digital File License | not redistributable | leaps off a branch by design |
| `the-mandalorian` | [Mandalorian Figurine – no supports](https://makerworld.com/en/models/110973) | Encrust3d | MakerWorld Standard Digital File License | not redistributable | without Grogu, who is his sidekick |
| `thrall` | [Thrall Figure – World of Warcraft](https://makerworld.com/en/models/2568449) | Betyna99 | MakerWorld Standard Digital File License | not redistributable | |
| `triceratops` | [Sweet cute Cartoon triceratops Dinosaur](https://makerworld.com/en/models/2268092) | Nopse | MakerWorld Standard Digital File License | not redistributable | |

No suitable model was found for Buster Keaton, Cecil Palmer, King Taranis,
Nancy Drew, The Narrator, The Piper of the Underroads, Specter Knight and
Thetis; they stay tokens.

Avoid print kits whose parts lie scattered on the plate: the file does not
say how they fit together (Bambu's assembly view was tried and leaves parts
behind).
