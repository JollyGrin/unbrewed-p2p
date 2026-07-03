# T-009 — Maps: dev-only annotation editor page

- **Status:** ready
- **Repo:** unbrewed-p2p (this repo)
- **Depends on:** — (T-008's draft JSON is an input when available, not a blocker)
- **More info needed:** NONE

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
