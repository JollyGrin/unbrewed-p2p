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
2. `render.cjs` renders each model from the table camera's elevation
   (90° − `DEFAULT_TILT_DEG`, read from `lib/pro/tableProjection.ts` by
   `camera.cjs` — re-render both sets after retuning the tilt), once per
   seat colour, to `public/figures/<heroId>.<seat>.webp`, plus
   `public/figures/manifest.json`.
   Each manifest entry records the elevation it was rendered from
   (`elevDeg`); the app lays the front of the model's base on the board by
   it. `scripts/visual-probe/tableFigureBase.cjs` measures a rendered base
   against the board's own ellipse, live, at nine board points and two zooms.
   Each manifest entry records `bounds`: where the model's visible pixels are
   inside its 2:3 frame, measured off the render's alpha (`bounds.cjs`). The
   tabletop hangs a miniature's HP/reach badges off that silhouette (#928).
   To refresh them for renders already on disk, without re-rendering:
   `node scripts/figures/bounds.cjs public/figures-open`.
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
| `license` | an SPDX id the app links to a deed for (`LICENSE_DEEDS`: `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`) |

The credit links the licence to its deed and, for anything but CC0, adds
"Rendered and recoloured for Unbrewed." — CC BY / BY-SA 4.0 s3(a)(1) ask
for both.

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
| `baba-yaga` | Witch Minis (Witch 2) | mz4250 | CC BY-SA 4.0 (Thingiverse: "Creative Commons - Attribution - Share Alike", linked to creativecommons.org/licenses/by-sa/4.0/) | [thingiverse.com/thing:6694128](https://www.thingiverse.com/thing:6694128) | 2026-09-26 | `files/Witch_2.stl` (listed on the thing's Files tab) from its "Download all files" zip → `witch-minis-witch-2.stl`. ShareAlike: the renders are CC BY-SA too. The same model on Printables (model/941392) is labelled CC-BY; we follow the stricter Thingiverse licence. |
| `hollow-oak`, `hollow-oak-spice` | Autumn Treant (Meshy AI, Hollow Oak) | JollyGrin | CC0 1.0 — Dean's own generated model of his own original hero | https://unbrewed.xyz (no external page; self-generated, see [Hero minis — the standard](#hero-minis--the-standard) below) | 2026-09-27 | Generated via the local `mini-pipeline` tool (Meshy AI). Both heroIds share the one model — an alias's manifest entries point at the canonical `hollow-oak.*` files, nothing is duplicated. |
| `king-taranis`, `king-taranis-spice` | King Taranis (Meshy AI) | JollyGrin | CC0 1.0 — Dean's own generated model of an original reskin (not an official hero) | https://unbrewed.xyz (self-generated) | 2026-09-27 | Generated via `mini-pipeline` and placed with `add-hero-mini.cjs` (see below). Both heroIds share the one model and the one 3D mini `public/minis3d/king-taranis.play.glb` (#945/#965). |

## Hero minis — the standard

A hero mini (sprite renders for the **Minis** figure style, plus a 3D model
for **3D minis**) is generated by `mini-pipeline` (a sibling repo, outside
this one) and placed here by one command — nothing in this section is
hand-edited. The full standard, including `mini-pipeline`'s side, is
`~/git/unbrewed/.grove/hero-mini-standard/STANDARD.md`; this is the p2p half
of it.

**Terms.** The **canonical id** is the base hero's id and the mini-pipeline
slug (`king-taranis`). An **alias** is another heroId that stands as the same
mini (`king-taranis-spice`, declared only in `mini-pipeline`'s `heroes.yaml`
— nothing here is hand-edited to add one). **Aliases share the canonical
files**: an alias's manifest entries point at `<id>.pN.webp` / `<id>.play.glb`,
never their own copy.

**The bundle** is the one directory `mini-pipeline` hands off
(`mini.py bundle --only <slug>`, `out/<slug>/bundle/`): `bundle.json` +
`play.glb` (the 3D mini, Meshopt-compressed) + `sprite.glb` (a plain glTF —
no Draco, no Meshopt — for the sprite renderer, which has neither decoder).
`bundle.json` carries the id, its aliases, `baseDiameter`, the credit (always
`license: "CC0-1.0"`, `redistributable: true`, `officialHero: false`,
`creator: "JollyGrin"` for a self-generated model — never Dean's real name,
unbrewed-p2p-923), the two files' names and sha256s, and provenance. It
carries no timestamps: re-running `bundle` on unchanged inputs is
byte-identical.

**Placing it:**

```bash
PW_PATH=<a playwright install>/node_modules/playwright \
  node scripts/figures/add-hero-mini.cjs ~/git/unbrewed/mini-pipeline/out/<slug>/bundle
```

This validates `bundle.json` (version 1, both files' sha256 match, and the
gate fields pass the SAME clearance code the app and `render.cjs` use —
`clearance.cjs`'s `openRenderBlockers`). **If the gate would drop the entry,
it exits non-zero and writes nothing.** Otherwise it:

- upserts an entry per id and alias in `scripts/figures/figures-open.json`
  (`model: "<id>-meshy.glb"`, the renamed `sprite.glb`, so a full open-set
  re-render can reproduce it);
- renders the sprites from `sprite.glb` (staged as `<id>-meshy.glb`) via
  `render.cjs --only <id>` — which renders just that entry and merges it into
  `public/figures-open/manifest.json`, leaving every other entry
  byte-identical — then clones the manifest entry into every alias, seats and
  all, so an alias's sprites are the canonical `.webp` files, never a copy;
- copies `play.glb` to `public/minis3d/<id>.play.glb` byte for byte, and
  upserts `public/minis3d/manifest.json` for the id and every alias, all
  pointing `files.play` at that one file;
- upserts the `public/figures-open/CREDITS.md` row for the id, listing the
  alias renders.

It is **idempotent**: running it twice on the same bundle changes no bytes
(stable key order, no timestamps). `--verify` (Playwright, iPhone 14
landscape) puts the hero on the tabletop — the canonical id and one alias, in
each of **3D minis**, **Minis** and **Tokens** — and writes crops to a folder
it prints (`scripts/visual-probe/heroMiniVerify.cjs`).

Raw `.glb` files are never committed, either sprite set — only the rendered
`.webp`s and `manifest.json` are. The one exception is the 3D minis (#945):
play-tier GLBs of **self-generated, gated** models are committed under
`public/minis3d/` — one ~25–30K-triangle Meshopt play-tier file per mini
(`<id>.play.glb`, ≤ ~140 KB, normalised by the pipeline: base on y = 0,
footprint 1.0, centred), listed in `public/minis3d/manifest.json` behind the
same licence gate. Nothing else is: no source models, no other detail
levels, no Draco or sprite files.

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
`"elev"` (camera elevation above the ground, default 90° − the board's tilt = 50°), `"footprintMm"` (base width,
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

## Before cataloguing a model

Check the model's licence for redistribution rights **before** downloading
or converting it into this pipeline. A model that can't ship its renders
doesn't belong in the repo's tooling at all — not even as a row in a table
of "models we use" — gate or no gate (Dean, 2026-09-27; see LEARNINGS.md).
This repo previously listed 25 MakerWorld models here, every one ruled
`not redistributable` under MakerWorld's Standard Digital File License; they
were deleted rather than kept as a to-do list of things we cannot ship.

Only models that clear the licence rule above belong in either set:
`figures-open.json`/`public/figures-open/` (committed) if the licence
allows redistribution, or the owner's local, git-ignored `figures.json`
(see [Setup](#setup-private-set)) while a licence is still being confirmed.
