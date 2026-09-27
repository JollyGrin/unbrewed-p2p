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
| `hollow-oak`, `hollow-oak-spice` | Autumn Treant (Meshy AI, Hollow Oak) | JollyGrin | CC0 1.0 — Dean's own generated model of his own original hero | https://unbrewed.xyz (no external page; self-generated, see [Adding a self-generated model](#adding-a-self-generated-meshy--mini-pipeline-model) below) | 2026-09-27 | Generated via the local `mini-pipeline` tool (Meshy AI) from `~/git/unbrewed/mini-pipeline/out/hollow-oak-painted/`, file `Meshy_AI_Autumn_Treant_0927103643_texture.glb` → `hollow-oak-meshy.glb`. Both heroIds share the one model, same as the private set's precedent. |
| `king-taranis`, `king-taranis-spice` | King Taranis (Meshy AI) | JollyGrin | CC0 1.0 — Dean's own generated model of an original reskin (not an official hero) | https://unbrewed.xyz (self-generated) | 2026-09-27 | `~/git/unbrewed/.grove/webgl-minis-inbox/king-taranis/web.glb` (Draco) decoded with `npx @gltf-transform/cli weld` → `king-taranis-meshy.glb` (render.html has no Draco loader). The same model ships as the 3D mini `public/minis3d/king-taranis.play.glb` (#945; the pipeline's Stage D `play.glb`, 24,996 triangles). |

## Adding a self-generated (Meshy / mini-pipeline) model

Hollow Oak is an Evergreen-original hero: Dean owns both the IP and the
generated model, so there is no licence to check — it goes straight into the
**open set** rather than the private one, and its render ships on every
checkout.

**Attribution convention:** a self-generated / owner-authored model is
credited as `"creator": "JollyGrin"` — Dean's public handle — never his real
name. Dean doesn't want his real name exposed publicly; this applies to
every future self-generated model, not just Hollow Oak (unbrewed-p2p-923).

1. Generate the model locally with `mini-pipeline` (outside this repo). The
   output lands at `~/git/unbrewed/mini-pipeline/out/<run>/*.glb`.
2. Add an entry per heroId to `scripts/figures/figures-open.json` (reuse one
   `model` filename across heroIds that share art, e.g. a hero and its
   `-spice` variant):
   ```json
   { "heroId": "hollow-oak", "model": "hollow-oak-meshy.glb",
     "license": "CC0-1.0", "redistributable": true, "officialHero": false,
     "modelName": "Autumn Treant (Meshy AI, Hollow Oak)", "creator": "JollyGrin",
     "sourceUrl": "https://unbrewed.xyz" }
   ```
   `officialHero` is `false` for any Evergreen original. There is no source
   page for a self-generated model, so `sourceUrl` is `https://unbrewed.xyz`
   unless Dean says otherwise on review. `creator` is `"JollyGrin"` per the
   convention above, never Dean's real name.
3. Copy (don't move) the `.glb` into a folder by itself — or alongside the
   other open models if re-rendering the whole set — under the filename the
   config references, then render just that hero:
   ```bash
   mkdir -p /tmp/open-models && cp ~/git/unbrewed/mini-pipeline/out/<run>/*.glb /tmp/open-models/hollow-oak-meshy.glb
   PW_PATH=<a playwright install>/node_modules/playwright \
     node scripts/figures/render.cjs --open /tmp/open-models
   ```
   `render.cjs` renders every entry in `figures-open.json`, so if the source
   folder doesn't hold every other open model too, either render into an
   isolated `figures-open.json` containing just the new entries (then merge
   the produced `manifest.json` — a plain object merge, keyed by `heroId` —
   into the committed one by hand) or gather all the open models into one
   folder first.
4. Add the row to [`CREDITS.md`](../../public/figures-open/CREDITS.md) and to
   the table above.
5. Raw `.glb` files are never committed, either set — only the rendered
   `.webp`s and `manifest.json` are. The one exception is the 3D minis
   (#945): play-tier GLBs of **self-generated, gated** models are committed
   under `public/minis3d/` — one ~25–30K-triangle Meshopt play-tier file per mini
   (`<miniId>.play.glb`, ≤ ~140 KB, normalised by the pipeline: base on y = 0, footprint 1.0, centred), listed in
   `public/minis3d/manifest.json` behind the same licence gate. Nothing else
   is: no source models, no other detail levels, no Draco files.

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
