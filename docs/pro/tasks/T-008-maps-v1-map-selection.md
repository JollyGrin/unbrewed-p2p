# T-008 — Maps: v1 map selection (was: Marmoreal seed script)

- **Status:** done (2026-07-04) — superseded & resolved by user decision
- **Repo:** unbrewed-pro-server
- **Depends on:** —
- **More info needed:** NONE (was: image/license questions — answered)

## Decision (from the user, 2026-07-04)
**Pro contains NO official Unmatched content.** Community maps only (matching
the community-decks-only roster). v1 is 1v1, so the board shouldn't be too big.
This supersedes the Marmoreal pick in the maps doc §6 and the original scope of
this ticket: community fan maps have no machine-readable geometry, so there is
no seed blob to script against — annotation is fully manual in the T-009
editor (which exists for exactly this).

## Result — v1 map selected: **Huntsman's Lodge** by Taytertots
Candidates reviewed visually from `defaultMaps.json` (the curated community
list): The Chalk, Opera House, The Mended Drum (all ANDSUSHI), Count's Castle,
Olympus, Huntsman's Lodge (Taytertots), Basra Port.

- **Huntsman's Lodge** wins: the ONLY fully vanilla candidate — no one-way
  arrows, no special markers — with crisp adjacency lines at 5000×3294
  (annotation-friendly), strong zone variety incl. 3-way split spaces, printed
  starts 1–4 (1v1 uses 1 and 2). ~42 spaces (roomy but acceptable).
  Image: `https://arweave.net/fSXTqIw2GSC3o16dozS1zP4JD4fJo-oAEvRweBv3iIg`
- **Runner-up:** The Mended Drum (~33 spaces, 2 starts, ideal size) — rejected
  for v1 because its one-way stairs arrow would force directional edges into
  the engine schema. Revisit as map #2 if one-way edges get added.
- Rejected: The Chalk / Opera House / Olympus (one-way arrows), Count's Castle
  (~100 spaces, lock-gated doors), Basra Port (640px image, too low-res).
- ⚠ Catalog finding: `defaultMaps.json` arweave links for Rose Garden,
  Weathertop, Island of Despair, Pharoh's Tomb are DEAD (HTML error pages).
  Filed here for a future sandbox catalog pass — not Pro work.

## Follow-on
T-010 (retargeted to Huntsman's Lodge) is now unblocked once T-009 ships.
