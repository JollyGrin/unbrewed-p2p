# T-008 — Maps: Marmoreal geometry seed script

- **Status:** needs-info
- **Repo:** unbrewed-pro-server
- **Depends on:** —
- **More info needed:** ⚠️ YES — ask the user before building:
  1. Which Marmoreal board **image** should the client display (the
     the-unmatched.club community re-render, or another source)? This decides
     what the normalized x/y coordinates must be registered against.
  2. Confirm the display posture is the same as the sandbox's (community-hosted
     imagery via URL, nothing bundled) — maps doc §3 metadata has a
     `source/license` field to fill.

## Context
the-unmatched.club publishes a server-fetchable data blob with space
coordinates + zone membership for ~28 maps including Marmoreal — but NO
adjacency and NO start markers (maps doc §2). This script turns that blob into
a draft map file that the annotation editor (T-009) finishes. Blob:
`https://the-unmatched.club/maps/__data.json` (SvelteKit format; CORS-blocked in
browsers, fine from a script).

## Scope
- `scripts/seed-map-geometry.ts` (pro-server repo): fetch + parse the blob,
  locate Marmoreal, convert its internal SVG-viewBox coords to normalized 0–1
  x/y against the chosen image's aspect, map zone colors → zone ids, and emit
  `data/maps/marmoreal.zones.draft.json` per maps doc §3 — with empty
  `adjacentTo` arrays and no start slots (human work, T-010).
- Make the map-id a CLI arg so future maps reuse the script.

## Acceptance criteria
- Draft JSON validates against the schema except for the known-empty fields;
  space count and zone list sanity-checked against a board photo (document the
  count in the ticket Result).
- Script is idempotent and committed with a short usage note.

## Out of scope
Adjacency/start authoring (T-009/T-010), any client rendering.
