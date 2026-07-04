# T-010 — Maps: authored Mended Drum map file (v1)

- **Status:** in progress — authored + validated; promotion/tests running in pro-server

## Result so far (2026-07-04)
- User authored the full map in /dev/map-editor → `docs/pro/maps-drafts/mended_drum.json`
  (commit 1f44b96). **29 spaces** (not ~33 — author's read of the board), 6 zones,
  starts s28=1 / s20=2, one one-way edge **s12→s13** (the stairs), spaceDiameter 0.09.
- Validator green (this repo, scripted check): symmetric adjacency, no dupes, all
  spaces zoned, no isolated/unreachable spaces, one-way edge has no reverse.
- Backend session converted it to engine MapDef format (`start: {slot}`, meta
  min/maxPlayers) at `unbrewed-pro-server/data/maps/mended-drum.json` — the
  5 spot-check tests + T-006 replay re-point remain on that side.
- Client fixture copy: `lib/pro/fixtures/mended-drum.map.json` (renders in
  /pro/game dev preview — see T-019).
- **Repo:** unbrewed-pro-server (file lands there; authoring happens in this repo's /dev/map-editor)
- **Depends on:** T-008 (done), T-009 (done)
- **More info needed:** NONE

## Context
**v1 map switched to The Mended Drum** by ANDSUSHI (user decision 2026-07-04:
smaller board preferred for 1v1 — ~33 spaces, printed starts 1 and 2). Its one
special feature, the green one-way stairs arrow, is now IN scope: the schema
carries `oneWayTo` directed edges and the editor authors them (connect-mode
cycle). Huntsman's Lodge (the earlier pick, full rationale in T-008)
becomes **map #2**.

Image: `https://i.imgur.com/NXBcIZN.jpeg` (source thread in
`defaultMaps.json` — credit ANDSUSHI in `meta.source`).

## Scope
- Author the full graph in `/dev/map-editor`: every space (~33), every printed
  adjacency line, the stairs arrow as a ONE-WAY edge in its printed direction,
  zone palette matching the board (tan, purple, dark-maroon, wood-brown,
  gray-stone, blue — several 2-zone split spaces), starts 1 and 2.
- Export → drop in `docs/pro/maps-drafts/mended-drum.json` (see that folder's
  README for the pipeline).
- Promote: validate, align field names with the engine `MapDef` (T-002),
  commit to `unbrewed-pro-server/data/maps/mended-drum.zones.json`.
- Engine note for T-002/T-003: movement out-edges = `adjacentTo ∪ oneWayTo`;
  ranged/zone logic is unaffected by edge direction.
- 5 positional spot-check tests in the engine repo (adjacency/zone/range read
  off the image by eye), including one asserting the stairs edge works one way
  and not the other.

## Acceptance criteria
- Validator green (symmetric `adjacentTo`, valid `oneWayTo`, all spaces zoned,
  starts 1+2, no isolated spaces); space count recorded in Result.
- The 5 spot-check tests committed and passing, incl. the one-way case.
- T-006's golden replay re-pointed to Mended Drum once both exist.

## Out of scope
Map #2 (Huntsman's Lodge — clone this ticket when wanted); client rendering.
