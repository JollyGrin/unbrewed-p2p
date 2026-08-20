# Map translation: dark-art fan boards

The board→ProMapDef pipeline lives outside this repo, at
`~/git/unbrewed/map-translation-pipeline/` (unversioned; python via
`./.venv/bin/python`). It is driven by the user-global `translate-map` skill.
This note records the 2026-08-21 change that taught it a second art style, and
the USCSS Nostromo result — unbrewed-p2p#648.

## The problem

The detector was tuned on Restoration-era boards: light parchment, thin black
strokes, ornaments drawn in the same ink. On those, "printed line art" and
"dark pixels" are the same set, so a ring can be scored by `p90(gray)` along
its rim and connectors are just the dark mask minus rims minus solid blobs.

Community fan boards break every one of those assumptions. On MrBrownieDL's
*USCSS Nostromo*, **58%** of the image is darker than the legacy ink threshold
(Pharaoh's Tomb: 15%), so the "ink" mask covers the whole board. The result was
**24 of 29 spaces and 6 of 45 edges** — not enough to draft anything.

Raising the thresholds does not fix it. At `gray<25` the strokes separate, but
the morphological opening that strips start-marker blobs also eats the ~9px
connectors, and the ring gate still rejects any circle whose rim crosses bright
art.

## The fix: score the signature, not the darkness

Fan boards draw their line art *on top of* the illustration, which gives every
printed element a signature the illustration never has. `analyze_board.py`
gained `--style auto|legacy|dark`; the dark path scores those signatures
instead of raw gray, which makes it background-independent.

| element | signature the dark path looks for |
| --- | --- |
| connector | black core (≤30) with a bright halo (≥120) on **both** sides — sampled at 8 orientations by AND-ing two opposed dilations of the bright mask. Dark art has no bright flanks, so it never fires; no blob-stripping needed. |
| space rim | a thin dark ring that is a **radial** edge: much darker than the band just inside or outside it, *and* with its image gradient pointing at the centre (alignment⁴). The alignment term is what rejects a circle traced through corridor panelling, whose edges run every which way. |
| start slot | a digit-sized white glyph set in a dark plate whose centroid **straddles** a rim. Requiring the numeral kills the 15 false candidates that paint splatter produced; requiring the rim straddle kills the board's own printed lettering (the title block scores higher on plate-darkness than a real marker does). |

Two smaller structural changes fell out of the art style:

- **Connectors are drawn rim-to-rim between points that are not diametrically
  opposite.** On a board with r≈93px spaces the stroke can sit 30px off the
  centre-to-centre chord — far enough that a fixed lateral tolerance either
  misses it or is so wide it swallows the neighbouring connector. Edge coverage
  is now scored on the best straight line between two rim points, scanning the
  lateral offset independently at each end. This alone took accepted edges
  from 14 to 44.
- **Borderline rings became a review question.** Circles whose ring cost lands
  in the uncertain band are emitted with `"confidence": "review"` and get a
  crop, exactly like a review edge. `decisions.json` answers with
  `circles_confirmed` / `circles_rejected`; `build_draft.py` refuses to run
  while any is unresolved, drops the rejected ones together with every edge
  touching them, and only then assigns s-ids. That is how board art that traces
  a plausible ring stays out of the map without a knife-edge threshold deciding
  it silently.

`--style auto` (the default) picks `dark` when more than 35% of the board is
darker than gray 70. The legacy path is byte-identical to before the split —
same `analysis.json` on Pharaoh's Tomb, field for field.

## Result on Nostromo

| | before | after |
| --- | --- | --- |
| spaces found | 24 / 29 | **29 / 29** |
| printed edges accepted | 6 / 45 | **44 / 45** (1 in review) |
| false accepts | — | **0** |
| start slots located | 0 (15 splatter false positives) | **2 / 2** |
| review items | (unusable) | **8** |

The 8 review items: 2 borderline circles (both board art — the cryo-pod housing
and a corridor panel — both rejected), 2 edges (1 confirmed, 1 rejected), 2
start markers (slots 1 and 2), 2 unexplained line stubs (both dismissed: one is
the accepted `c2–c3` connector leaving its rim at a shallow angle, one is a
vertical conduit painted on the hull).

The draft is `docs/pro/maps-drafts/uscss-nostromo.json` — 29 spaces, 45 edges,
7 zones (hypersleep bay, crew deck, bridge, engine walkway, the nest, medbay,
egg chamber), duel format on slots 1 and 2. Both engine checks pass
(`validateMap`, `validateMapSupportedFormats`), and the overlay traces every
printed line.

**Still open before it can be registered** (separate ticket, out of scope here):
the board image is not hosted — `meta.imageUrl` points at the path it will get
(`https://unbrewed.xyz/maps/community-uscss-nostromo.webp`), and the
`meta.license` line is provisional until MrBrownieDL confirms the credit.

## Regression

`scripts/regress.py` now runs both fixtures and must pass before any new board:

| fixture | style | spaces | edges | slots | review items |
| --- | --- | --- | --- | --- | --- |
| Pharaoh's Tomb | legacy | 32 | 48 | 4 | 26 |
| USCSS Nostromo | dark | 29 | 45 | 2 | 8 |

The Nostromo fixture also pins the false-positive behaviour: the two art rings
must be *floated for review*, never silently accepted as spaces.
