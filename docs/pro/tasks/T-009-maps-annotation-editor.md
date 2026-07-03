# T-009 — Maps: dev-only annotation editor page

- **Status:** done (2026-07-04)
- **Repo:** unbrewed-p2p (this repo)
- **Depends on:** —
- **More info needed:** NONE

## Result
`pages/dev/map-editor.tsx` — client-only, hard 404 in production via
`getServerSideProps`. Modes: space (click add / drag move / click select),
connect (click A→B toggles a symmetric edge, chains), zone paint (palette with
editable labels; spaces hold multiple zones, rendered as conic segments), start
(cycles 1→2→3→4→none), delete (cleans edges). Live warnings (zoneless,
isolated, asymmetric, missing starts/meta), edge/space counts, export/import
JSON textarea, localStorage draft autosave. Note: the community-maps decision
(T-008) removed the seed-import use case — authoring is fully manual, which
this covers. Original spec below for reference.

## Context
Humans draw the adjacency edges — the visually hard part LLM-vision gets wrong
(maps doc §5 recommends exactly this tool). One dev-only page, never linked
from nav, no backend.

## Scope
- `pages/dev/map-editor.tsx`: load a map image by URL + optionally import a
  JSON draft (T-008 output or empty). Client-side only.
- Interactions: click empty canvas = add space (normalized coords); drag a
  space = move; click space A then B = toggle adjacency edge; zone painting
  (select spaces → assign zone id/color; spaces can hold MULTIPLE zones);
  mark start slots (player 1/2 hero); delete.
- Render: image with SVG overlay — spaces as circles (zone colors as ring
  segments for multi-zone), edges as lines, starts labeled.
- Export button: validated JSON per maps doc §3 (symmetric edges enforced on
  export; warn on isolated spaces / zoneless spaces / missing starts).
  Import round-trips.
- Keep it ugly-but-usable; Chakra default components are fine. Guard the page
  behind `process.env.NODE_ENV === 'development'` (404 in prod builds).

## Acceptance criteria
- Author the 6-space worked example from maps doc §3 by hand in the editor and
  export — output validates and matches the doc's structure.
- Import → edit → export round-trip preserves untouched fields.
- Page absent from production build output.

## Out of scope
The actual Marmoreal authoring session (T-010), server storage, multi-user.
