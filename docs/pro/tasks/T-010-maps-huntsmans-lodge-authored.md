# T-010 — Maps: authored Huntsman's Lodge map file

- **Status:** ready
- **Repo:** unbrewed-pro-server (file lands there; authoring happens in this repo's /dev/map-editor)
- **Depends on:** T-008 (done — map selected), T-009 (done — editor built)
- **More info needed:** NONE

## Context
The v1 battlefield is **Huntsman's Lodge** by Taytertots (community map — see
T-008 for the no-official-content decision and selection rationale). No seed
geometry exists for fan maps: every space, edge, zone, and start is authored by
hand in the `/dev/map-editor` page (run `npm run dev` in unbrewed-p2p, open
`localhost:3000/dev/map-editor`).

Image: `https://arweave.net/fSXTqIw2GSC3o16dozS1zP4JD4fJo-oAEvRweBv3iIg`
(5000×3294; ~42 spaces; zones incl. yellow/snowflake, ice-blue, dock-brown,
white, two greens, gray, red; several 2-way and 3-way split spaces; printed
starts 1–4 — mark all four, 1v1 uses 1 and 2).

## Scope
- Author the full graph in the editor: every space, every printed adjacency
  line as an edge, zone palette matching the printed colors, all zone
  memberships (split spaces belong to ALL their zones), starts 1–4.
- Fill meta: title, imageUrl (above), source
  (`defaultMaps.json` credits Taytertots), license note, players `[2]` for v1.
- Export JSON → convert/rename to the engine's `MapDef` shape if it differs
  (T-002 defines it) → `data/maps/huntsmans-lodge.zones.json` in
  unbrewed-pro-server → run the T-002 validator.
- Write 5 positional spot-check tests in the engine repo (pick 5 space pairs,
  read expected adjacency/zone/range off the image by eye, assert the engine
  agrees) — they document the board.

## Acceptance criteria
- Validator green: symmetric edges, every space zoned, starts 1+2 present,
  no isolated spaces; space count recorded in the Result section.
- 5 spot-check tests committed and passing in unbrewed-pro-server.
- T-006's golden replay re-pointed from the fixture map to Huntsman's Lodge
  once both exist.

## Out of scope
More maps; one-way-edge schema support (that's what disqualified the
runner-up — only add it when a map that needs it is actually chosen).
