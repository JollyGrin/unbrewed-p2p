---
name: verify
description: Build, run, and drive the Unbrewed game board end-to-end to verify changes against a local relay. Use when verifying game/board/token/deck changes at runtime.
---

# Verify Unbrewed changes

## Launch

1. `npm install --legacy-peer-deps` (npm, not yarn/pnpm; react-icons stays at 4.12.0).
2. `npm run dev` — Next dev server; picks the next free port if 3000 is taken (watch the "ready" line).
3. Relay: a local gameserver usually runs on `:1111` (`lsof -nP -iTCP:1111`); otherwise `cd gameserver && go run .`.
4. **Rooms must be created before the websocket join**: `curl http://localhost:1111/lobby/<gid>` first, or the ws handshake 500s with "Unable to find the game room socket".
5. The default relay is `https://unbrewed-v2.fly.dev`; to force local, seed localStorage before page scripts run: `localStorage.setItem("SERVER_ACTIVE", "http://localhost:1111")`.

## Drive

- Headless: puppeteer-core + system Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) works well; use `page.evaluateOnNewDocument` for the localStorage seed.
- Game URL shape: `/game?name=<player>&gid=<room>`. Two pages with different `name` + same `gid` = a multiplayer table.
- Board DOM: background is `image.background`; overlay tokens under `g.overlays g.tok`; normal tokens under `g.pieces g.tok`. Foreign/locked tokens carry `pointer-events="none"`, own movable ones `"all"`.
- Starter disc spawns ~1.5s after connect if the player has no blob — wait ≥4s after goto before counting tokens.
- Token drag: mouse down/move/up on the token's boundingRect center. Zoom-pan: same gesture on empty board space. Verify separation via the `transform` attr of `svg g[cursor]` (zoom) vs each `g.tok` (token).

## Gotchas

- puppeteer `waitUntil: "networkidle2"` never settles on /game (live websocket) — use `"domcontentloaded"` plus a `waitForFunction` that a known button exists AND has a non-zero boundingRect (hydration + lazy icon chunk can lag several seconds on first compile).

- The fly.dev relay may be unreachable from a sandboxed/offline env — the header chip shows "Disconnected — reconnecting" and no tokens render (they render from the server echo, not locally).
- Port 3000 is often occupied by an unrelated app; don't assume.
