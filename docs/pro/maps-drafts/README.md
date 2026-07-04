# Map drafts — hand-off inbox

Drop `/dev/map-editor` exports here as `<map-id>.json` (e.g.
`mended-drum.json`). This folder is the **inbox**, not the engine's source of
truth.

## The pipeline (editor → rules engine)

1. **Author** in `/dev/map-editor` (npm run dev → localhost:3000/dev/map-editor).
   The editor autosaves ONE draft to localStorage — always `export → box` and
   save the JSON before starting a different map.
2. **Drop** the exported JSON in this folder and commit (or just tell an agent
   it's here).
3. **Promote** (agent work, T-010 pattern): validate, convert field names to
   the engine's `MapDef` if they drift, and commit to
   `unbrewed-pro-server/data/maps/<map-id>.json` — THAT repo is where the rules
   engine loads maps from. Nothing here is read at runtime.
4. **Serve**: the pro server's map manifest decides what the lobby offers.
   Clients never fetch map files — the server sends the graph (spaces, edges,
   zones, image URL) inside the game view; the board is public information.

So: "prebuilt maps" = one JSON file per map committed in
`unbrewed-pro-server/data/maps/`, each having passed the validator + positional
spot-check tests. This folder just gets them from your browser to the repo
without pasting JSON into chat.

## Format notes

- `adjacentTo` = symmetric edges (the editor enforces symmetry).
- `oneWayTo` = directed edges (Mended Drum's stairs drop). Engine movement
  treats out-edges as `adjacentTo ∪ oneWayTo`.
- Coordinates are normalized 0–1 against the image, so any render size works.
- Credit the map author in `meta.source` — community maps run on attribution.
