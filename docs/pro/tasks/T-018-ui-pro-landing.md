# T-018 — UI: /pro landing & roster page

- **Status:** done (2026-07-04)
- **Repo:** unbrewed-p2p
- **Depends on:** —
- **More info needed:** NONE (follow-up question logged below)

## Context
Public face of Pro while it's built: explain the promise, show the
Smash-Bros-style roster from the existing top-30 deck list with unsupported
fighters locked out.

## Result
- `pages/pro/index.tsx` + `components/Pro/ProLanding.tsx`.
- Dark arena treatment on existing brand tokens (`brand.surfaceDim` bg, gold
  accent, LeagueGothic/BebasNeue display type), staggered tile reveal,
  gold-pulse on ready fighters.
- Roster = `POPULAR_DECKS` (same source as deck import). Status map lives at
  the top of `ProLanding.tsx`: SUPPORTED = King Kong `kdKM`, Baba Yaga `yAJ-`,
  The Flash `p1Ew` ("READY SOON", full color); IN_THE_LAB = Pinocchio `72Dz`,
  Schrödinger's Cat `G_nr`; everyone else grayscale + lock icon with an
  explanatory tooltip. Clicking any tile shows an announcer line.
- Purpose copy: referee metaphor, roster-opens-gradually explanation, explicit
  "sandbox is not being replaced" note, 3-step roadmap, link back to /connect.
- Typecheck clean (pre-existing `Pool.spec.ts` errors are unrelated).

## Follow-ups (fold into future tickets)
- ~~Needs a user decision: link /pro from nav?~~ **Answered 2026-07-04: stays
  unlisted until Pro is actually playable.** Add the nav/landing link as part
  of T-019's launch checklist.
- When T-016/T-017 land: replace the announcer bar with a real
  create/join-lobby flow (that's T-019 territory).
- When a supported deck ships, flip its copy from "READY SOON" to playable.
