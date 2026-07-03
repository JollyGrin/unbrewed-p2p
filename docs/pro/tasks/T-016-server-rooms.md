# T-016 — Server: rooms, redaction, reconnect

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-015
- **More info needed:** NONE

## Context
The referee process. Hobby-budget constraints are settled (context doc): Node +
`ws`, in-memory rooms, no DB, no accounts. `redactFor` is the security
boundary (prior-art doc §5).

## Scope
- `server/ws.ts`: WebSocket server, `hello` version handshake (reject with
  `versionMismatch`), heartbeat/ping, connection→player mapping.
- `server/rooms.ts`: create/join by short human-typable code (server-generated,
  unambiguous alphabet); room = `{ code, engineState, players, spectatorless }`;
  room TTL sweep (e.g. 30 min idle → drop); max rooms guard.
- `redactFor(state, viewerId) → PlayerView`: strips opponent hand/deck order/
  face-down commit; opponent hand becomes a count. Face-down commits stay
  hidden until the engine's REVEAL event.
- Flow: on action received → assert membership in `legalActions` → `reduce` →
  broadcast fresh `gameView` per player (each redacted + their own
  legalActions/prompt).
- Reconnect: token issued at join; a dropped socket may resume its seat with
  the token within the room TTL; the other player sees a "reconnecting" flag
  in lobbyState.
- Server-side seeded RNG: seed generated at room creation (crypto random),
  stored in engine state (T-001).

## Acceptance criteria
- Integration test with two in-process ws clients: create → join → pick heroes
  → play several scripted turns → assert each client only ever received its
  own hand (grep the raw frames for opponent card ids — must be absent).
- Reconnect test: drop one socket mid-game, rejoin with token, receive current
  view, play on.
- Idle room reaped by TTL test (fake timers).

## Out of scope
Deployment (T-017), matchmaking, spectators, accounts, persistence.
