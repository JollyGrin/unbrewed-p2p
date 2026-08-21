# Map translation: plain-stroke boards and one-way arrows

The board→ProMapDef pipeline lives outside this repo, at
`~/git/unbrewed/map-translation-pipeline/` (unversioned; python via
`./.venv/bin/python`). It is driven by the user-global `translate-map` skill.
This note records the 2026-08-21 change that taught it a third art style and
its first directed primitive, and the result on MrBrownieDL's *The Bog* —
unbrewed-p2p#652. It is the follow-up to
[map-translation-dark-art.md](./map-translation-dark-art.md) (#648).

## The problem

The Bog is a 1v1 fan board: 32 spaces drawn over forest photography, with
plain dark-brown connectors and six orange one-way arrows. Both existing
styles fell over on it, and for different reasons:

| style | circles | edges accepted |
| --- | --- | --- |
| `dark` (auto-picked, 49% of the board is dark) | 32 ✓ | **1** |
| `legacy` | 25 | **2** |

The circles were never the problem — the dark style's radial rim detector got
all 32 on the first pass. The connectors were. `dark` looks for a black core
with a **bright halo on both sides**; The Bog's strokes have no halo at all, so
the mask came up empty. `legacy` treats "dark pixel" as "ink", and 49% of this
board is darker than the legacy ink threshold, so its mask came up as the whole
forest. Raising or lowering a threshold cannot bridge that: the signal simply
is not darkness.

## The fix: calibrate the ink off the rims

Every printed element on a plain board — rim, connector, start diamond — is
stroked in **one flat colour**. And the ring detector has *already located 32
rims drawn in it* before the connector mask is built. So the connector mask
does not need a hard-coded colour or a darkness threshold; it can ask the rims.

`--style plain` takes the darkest pixel across the rim band at each of 72
angles on every detected circle, reduces the 2 304 samples by median, and masks
every pixel within 11 counts of that colour in all three channels. On The Bog
that lands on RGB (35, 32, 25) with **93%** of the rim samples agreeing —
reported as `analysis.json .style.ink_rgb` / `.ink_rim_agreement` so the
number is auditable rather than a magic constant. A 3×3 opening drops the photo
speckle that happens to match; a real stroke is ~8px wide and survives intact.
Everything downstream (rim-to-rim edge scoring, stubs, start-slot glyphs) is
the dark path unchanged.

Two smaller things fell out of the flat-fill art:

- **Zone slices merge at Δ16, not Δ40.** Flat printed fills sit closer together
  than photo art does: The Bog's purple heather (56,45,76) and olive bog water
  (63,68,55) are 23 apart in the widest channel, and the photo-art tolerance
  silently fused them into one slice — three-zone spaces read as two.
- **A "1" is a legitimately thin glyph.** The start-numeral area floor of 50px
  rejected slot 1 (area 38) while passing slot 2. Lowered to 30; the dark-plate
  and rim-straddle tests were always the ones doing the vetting.

## One-way arrows

`ProMapSpace.oneWayTo` (directed, movement-only — the Mended Drum stairs are
the precedent) had no detector until now. The Bog prints six of them as orange
arrows, and they replace a connector rather than annotate one: there is no
printed stroke beside any of the six.

A printed arrow is a **flat, fully saturated accent the photography never
reaches** (S≥185, V≥170), found only **outside** the space discs — zone fills
do reach that saturation, board art does not. A candidate blob must then be
longer than it is wide, fill ≥0.60 of its convex hull, and have one end flared
≥1.8× the other. The flared end is the head, which is what gives the edge its
direction: head→destination, tail→source. Finally the tail must sit on the
source rim (≤0.15r) and the tip just short of the destination rim (≤0.40r).

Each detection becomes an `arrow` review item with a crop. `decisions.json`
answers with `one_way: ["c22-c17", …]` written in the direction the arrowhead
points (flip the detector's guess if it read it backwards) or
`one_way_rejected`; `build_draft.py` refuses to run while any is unresolved and
writes them to `spaces[].oneWayTo` — never into `adjacentTo`, so the symmetry
check still passes. It also warns if a one-way pair is *also* an undirected
edge.

Arrow detection runs on every style, and the Nostromo fixture pins it at
**zero**: that board's saturated red panel art and blood splatter produce
25 candidate blobs, and the convex-hull, flare, and rim-distance gates reject
every one.

## `auto` picks the style

`auto` still splits `legacy` from photo art on the dark-pixel fraction (>35%),
then splits `dark` from `plain` on how much of the board carries the
haloed-connector signature — Nostromo **3.1%**, The Bog **0.22%**, an order
apart. The halo mask was hoisted above circle detection so `auto` can probe it;
it costs 0.04s and is skipped entirely on legacy boards.

Internally the `DARK` flag was renamed `RADIAL` — it now means "photo art:
score signatures, not darkness" and covers `dark` and `plain` alike, with a
separate `PLAIN` flag selecting the connector mask. The legacy and dark paths
are otherwise untouched.

## Result on The Bog

| | `dark` (what #648's pipeline did) | `plain` (after) |
| --- | --- | --- |
| spaces found | 32 / 32 | **32 / 32** |
| printed edges accepted | 1 / 52 | **52 / 52** (0 in review) |
| false accepts | — | **0** |
| start slots located | 1 / 2 | **2 / 2** |
| one-way arrows | n/a | **6 / 6**, all pointing the right way |
| review items | — | **19** |

All 52 accepted edges were checked individually against a rectified strip of
the board between the two rims; every one has a printed stroke, and all 7
review edges have none (two of them — `c16-c22`, `c18-c28` — are the detector
catching an *arrow* where it looked for a connector: correctly rejected as
adjacency, correctly kept as `oneWayTo`). The 4 unexplained stubs are all
dismissible: forest speckle below `c29`, the arrows leaving `c30`, a connector
leaving `c3` at a shallow angle, and the pale rock formation above `c6`.

The draft is [`maps-drafts/the-bog.json`](./maps-drafts/the-bog.json) — 32
spaces, 52 edges, 6 one-way links, 7 zones (stone flats, heather, bog water,
sandbar, deadfall, mud, reeds), duel format on slots 1 and 2. Both engine
checks pass (`validateMap`, `validateMapSupportedFormats`), and the overlay
traces every printed line and draws all six arrows over the printed ones.
`meta.specialRules` stays `false`: one-way edges are a graph property the
engine already walks, not a scripted rule.

**Still open before it can be registered** (separate ticket, out of scope
here): the board image is not hosted — `meta.imageUrl` points at the path it
will get (`https://unbrewed.xyz/maps/community-the-bog.webp`) — and the
`meta.license` line is provisional until MrBrownieDL confirms the credit.

## Regression

`scripts/regress.py` now runs three fixtures and must pass before any new
board (~3 min):

| fixture | style | spaces | edges | one-way | slots | review items |
| --- | --- | --- | --- | --- | --- | --- |
| Pharaoh's Tomb | legacy | 32 | 48 | 0 | 4 | 26 |
| USCSS Nostromo | dark | 29 | 45 | 0 | 2 | 8 |
| The Bog | plain | 32 | 52 | 6 | 2 | 19 |

The harness now also asserts, per fixture, that every printed arrow is found
pointing the right way (a backwards read is reported as `BACKWARDS`), that no
arrow is invented, and that `build_draft.py` reproduces the ground truth's
`oneWayTo` exactly.
