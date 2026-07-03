# T-019 — UI: /pro game page (board, prompts, socket)

- **Status:** blocked
- **Repo:** unbrewed-p2p
- **Depends on:** T-015, T-016 (needs a live protocol to render)
- **More info needed:** NONE

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
