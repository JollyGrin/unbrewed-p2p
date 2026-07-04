# T-019 — UI: /pro game page (board, prompts, socket)

- **Status:** in progress — scaffolding landed 2026-07-04 (overnight prep); wiring blocked on T-015/T-016
- **Repo:** unbrewed-p2p
- **Depends on:** T-015, T-016 (needs a live protocol to render)
- **More info needed:** NONE

## Progress (2026-07-04, overnight)
Landed ahead of the backend so the two can be connected the moment the server
is up:
- `lib/pro/protocol.ts` — **DRAFT** client protocol mirroring the engine's
  committed types (Action union, PendingPrompt, MapDef) + a proposed room
  envelope (CREATE/JOIN/RECONNECT/ACTION/PROMPT_RESPONSE ↔
  ROOM_CREATED/JOINED/STATE/OPPONENT_STATUS/ERROR). ⚠ First wiring task:
  diff against `unbrewed-pro-server/protocol/protocol.ts` (didn't exist yet)
  and make the client file an exact copy. `PROTOCOL_VERSION = 0` until synced.
- `lib/pro/useProSocket.ts` — reconnect w/ sessionStorage token, exp backoff,
  queued hello. Endpoint from `NEXT_PUBLIC_PRO_WS_URL`.
- `components/Pro/ProBoard.tsx` — presentational board: map image, spaces at
  normalized coords sized by `meta.spaceDiameter`, fighter tokens w/ HP badges,
  gold pulse on caller-supplied highlight lists. Zero rules logic.
- `pages/pro/game.tsx` — LIVE mode (when WS URL set) + DEV PREVIEW mode
  (no WS URL: renders `lib/pro/fixtures/mended-drum.map.json`, verified in
  browser). 404s in prod while WS URL is unset.
- Still open from Scope: lobby wiring on /pro, CardFactory hand, reveal beat,
  action log, mobile pass, reconnect acceptance test.

## Progress (2026-07-04, after first live playtest)
First full rules-enforced Kong mirror played end-to-end by the user (move,
boost, attack, defend all confirmed live). Landed since: protocol v1 synced
(RESPOND_PROMPT action model), room lobby screen w/ join link, click-to-act
board (gold spaces / pulsing targets), CardFactory hand fan + combat reveal
slots (art via unbrewed-api title-match), overlay-shift fix (grid stretch),
full-viewport sandbox-style table (100svh, radial felt), ProHud plates reusing
header.styles (HP/move/reach, hand/deck pips, discard card-face modals,
hero-ability tooltip, room + connection chips). Still open: reveal-beat
animation, action log, /pro lobby wiring, mobile pass, reconnect test.

## Context
The dumb renderer (context doc): everything it shows comes from
`gameView{view, legalActions, prompt}`; everything it sends is an action from
that list. NO rules logic client-side — if the UI needs to know something, the
protocol view must carry it (fix the protocol, don't infer).

## Scope
- `lib/pro/useProSocket.ts`: connect to `NEXT_PUBLIC_PRO_WS_URL`, hello
  handshake, auto-reconnect with stored token (sessionStorage), typed message
  handlers.
- `/pro` lobby wiring: create/join room with a code, hero select limited to
  the supported list served by the server (replaces the static status map in
  `ProLanding.tsx`).
- `pages/pro/game.tsx` + `components/Pro/`:
  - **Board**: map image + SVG space/zone overlay from the map data in the
    view; fighters snapped to spaces; legal move/target spaces highlighted
    from `legalActions`; click = send action. Reuse pan/zoom from
    `BoardCanvas` if cheap — otherwise a simpler fixed-fit board is fine for v1.
  - **Hand** (reuse `CardFactory` card faces from display data), commit flow
    (face-down state until server reveals), boost prompts.
  - **Prompt surface**: one component rendering every `PendingPrompt` kind
    (yes/no, choose target/space/option, pay cost) as modal or inline chips.
  - Turn/action tracker, HP, combat reveal moment (make the simultaneous flip
    feel dramatic — it's the game's signature beat), action log, game-over
    screen.
- Mobile-usable layout (the sandbox sets the bar).

## Acceptance criteria
- Full King Kong mirror match playable in two browsers against a local server.
- The client bundle imports nothing from any rules/engine source — only
  `lib/pro/protocol.ts` types.
- Refresh mid-game reconnects into the same seat and re-renders correctly.

## Out of scope
Spectating, animations beyond the reveal beat, sandbox changes.
