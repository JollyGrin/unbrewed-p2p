# T-021 — UI: /pro lobby wiring with hero select

- **Status:** done (implemented 2026-07-04)
- **Repo:** unbrewed-p2p (this repo only — NO server changes needed or allowed)
- **Depends on:** T-019 scaffolding (done — game page, socket hook, protocol v1 synced)
- **More info needed:** NONE — every open question below has a decided answer.

## Goal

Today the flow is: open `/pro/game` cold, hero is hardcoded
(`const heroId = "king-kong"` in `pages/pro/game.tsx` LiveGame). Wire the real
flow: pick a hero on the `/pro` landing roster → create a room → opponent opens
the join link → picks their hero → plays. Keep everything in the existing
visual language (the landing's smash-roster + the game page's sandbox-style
table).

## What already exists (read these first, change only what's listed)

| Piece | Where | State |
| --- | --- | --- |
| Landing roster | `components/Pro/ProLanding.tsx` | renders POPULAR_DECKS grid; `SUPPORTED: Record<deckId, name>` = `{ kdKM: "King Kong", "yAJ-": "Baba Yaga", p1Ew: "The Flash" }`; supported tiles glow, rest are grayscale+lock. NOT clickable today. |
| Protocol | `lib/pro/protocol.ts` (v1, synced copy — DO NOT EDIT; source of truth is the server repo) | `ClientMsg LIST_HEROES` → `ServerMsg HEROES {heroes: HeroListing[]}` where `HeroListing = {heroId, name, hp, move, reach}`. `CREATE_ROOM`/`JOIN_ROOM` take a server `heroId` ("king-kong"), NOT a deck id ("kdKM"). `ERROR` codes incl. `UNKNOWN_HERO`, `ROOM_NOT_FOUND`, `ROOM_FULL`. |
| Server | already implements `LIST_HEROES` (verified `server/index.ts:55`) and rejects unknown heroes. Currently ships ONE hero (king-kong); the UI must handle a 1-hero list gracefully and scale to 3+. |
| Socket hook | `lib/pro/useProSocket.ts` | `createRoom(heroId)` / `joinRoom(roomId, heroId)` exist and queue until the socket opens. NO `LIST_HEROES` support yet — you add it. |
| Game page | `pages/pro/game.tsx` | LiveGame's pre-join screen (the `!joined` branch) is where hero select lands. Reads `?room=` already. |
| deckId ↔ heroId map | `lib/pro/useProCardArt.ts` `HERO_DECK_IDS: Record<serverHeroId, deckId>` | the ONLY place this mapping lives. Reuse it (invert it for landing→game navigation). Do not create a second copy. |

## Decided design (implement exactly this)

### URL contract
- Creator: `/pro/game?hero=<serverHeroId>` (e.g. `?hero=king-kong`) → create-room screen with that hero preselected.
- Joiner: `/pro/game?room=<CODE>` → join screen, hero chosen there (join links stay hero-free so the joiner always picks).
- Both params absent → create screen with no preselection (pick from the list).
- Invalid `?hero` → ignore it, fall back to no preselection. Never block on it.

### Landing (`ProLanding.tsx`)
- Supported tiles become links to `/pro/game?hero=<serverHeroId>` (invert
  `HERO_DECK_IDS` to map deckId→serverHeroId; export the inverted map from
  `useProCardArt.ts` as `DECK_HERO_IDS` rather than duplicating).
- Only tiles whose serverHeroId exists in the mapping get links; IN_THE_LAB and
  locked tiles stay exactly as they are (no navigation).
- Add ONE clear primary CTA near the roster: "Start a match" →
  `/pro/game` (no hero param). Keep it subtle — the page is still unlisted.
- Do NOT fetch LIST_HEROES on the landing. The landing stays static/serverless
  (it must render even with the backend down). The static SUPPORTED map is the
  landing's truth; the server list is the game page's truth. When the two
  disagree, the game page wins (worst case: a tile links to a hero the server
  rejects → the game page's hero select simply won't offer it).

### Socket hook (`useProSocket.ts`)
- Add `heroes: HeroListing[] | null` state; send `{v, type: "LIST_HEROES"}`
  once per socket **open** (in `ws.onopen`, alongside the existing hello
  logic — also on reconnects; idempotent) and store the `HEROES` reply.
- No caching beyond hook state; it's one tiny message.

### Game page pre-join screen (LiveGame `!joined` branch)
Replace the current bare Create/Join button block with a compact hero-select
lobby (same TABLE_BG backdrop already in place):
- Title: `CREATE A ROOM` / `JOIN ROOM <CODE>` (keep LeagueGothic style).
- Hero picker: one card-ish tile per `HeroListing` from the hook (name, hp,
  move, reach icons — reuse the stat-pip visual language from
  `components/Pro/ProHud.tsx`; art via `HERO_DECK_IDS` + POPULAR_DECKS
  `cardbackUrl` if trivially available, otherwise text tiles are fine —
  do not spend effort on art here).
- While `heroes === null` (list not arrived): show skeleton tiles; if
  `?hero=` was given, show it as preselected text immediately so the creator
  can click Create the moment the socket opens (server validates anyway).
- Preselect from `?hero=` when it matches a listed heroId. Single-hero list →
  preselect it automatically.
- One primary gold button: `Create` / `Join` (existing BTN_GOLD), disabled
  until socket `open` AND a hero is selected.
- ERROR handling on this screen (not after): `ROOM_NOT_FOUND` → "room expired
  or never existed" + a "Create a new room instead" button (navigates to
  `/pro/game`); `ROOM_FULL` → say so + same fallback; `UNKNOWN_HERO` →
  re-open the picker (shouldn't happen if picking from HEROES).
- Keep the existing reconnect path untouched: if a sessionStorage token exists
  for `?room=`, `joinRoom` already RECONNECTs — the hero picker must NOT block
  that (skip straight past the picker when a token for this room exists).

### Post-create lobby screen
Already exists (room code + copy link + "waiting for opponent"). Only change:
show the chosen hero's name on it ("You are King Kong — waiting for an
opponent…").

## Acceptance criteria
- From `/pro`: click King Kong tile → create screen with Kong preselected →
  Create → lobby screen with join link → second browser opens link → picks
  Kong from the server-fed list → Join → game starts. No hardcoded heroId
  remains in `game.tsx`.
- `/pro/game?room=XXXX` for a dead room shows the friendly ROOM_NOT_FOUND
  state with the create-new fallback (test by restarting the server).
- Refresh mid-game still reconnects into the same seat WITHOUT showing the
  hero picker.
- `npx tsc --noEmit` clean (ignore pre-existing `Pool.spec` errors:
  `| grep -v "Pool.spec"`), and the page compiles in `next dev`.
- Zero changes outside: `ProLanding.tsx`, `pages/pro/game.tsx`,
  `lib/pro/useProSocket.ts`, `lib/pro/useProCardArt.ts` (the inverted map
  export only). Protocol file untouched. No sandbox files touched.

## Judgment calls already made (don't relitigate)
- Landing static, game page server-fed (resilience beats freshness at n=3).
- Join links never carry a hero (joiner always chooses; prevents two-Kong
  links from feeling prescriptive — mirrors are legal and fine).
- Hero select lives on the game page, not a modal on the landing: the socket
  lives there, and the landing must keep working with the backend down.
- Reconnect-token flow outranks the picker: a returning player never re-picks.
- Single-hero auto-preselect: with only Kong shipped, the picker should feel
  like a confirmation, not a puzzle.

## Out of scope
Matchmaking, spectating, hero portraits/art polish, mobile pass (separate),
any change to `docs/pro/tasks/README.md` other than flipping this ticket's
status row, anything in unbrewed-pro-server.

## Result (2026-07-04)
Implemented exactly as specced. Landed in `pages/pro/game.tsx`,
`lib/pro/useProSocket.ts`, `lib/pro/useProCardArt.ts`, `components/Pro/ProLanding.tsx`.
- `useProCardArt.ts`: added `DECK_HERO_IDS` (inverse of `HERO_DECK_IDS`).
- `useProSocket.ts`: added `heroes: HeroListing[] | null`, sends `LIST_HEROES`
  on every socket open, stores the `HEROES` reply; also clears `error` at the
  start of each `createRoom`/`joinRoom` so a retry after ROOM_NOT_FOUND/ROOM_FULL
  works cleanly.
- `ProLanding.tsx`: ready tiles with a known server hero id link to
  `/pro/game?hero=<serverHeroId>` (via `DECK_HERO_IDS`); lab/locked tiles stay
  inspect-only; added a subtle "Start a match →" CTA → `/pro/game`.
- `game.tsx`: removed the hardcoded `heroId`; the `!joined` branch is now a
  `HeroSelectLobby` (server-fed tiles with hp/move/reach pips + cardback art,
  skeletons while the roster loads, `?hero=` preselect, single-hero auto-select).
  Reconnect tokens skip the picker; ROOM_NOT_FOUND/ROOM_FULL show a friendly
  create-new fallback; UNKNOWN_HERO reopens the picker. Post-create lobby shows
  "You are &lt;hero&gt;". `npx tsc --noEmit` clean (excl. pre-existing Pool.spec).
