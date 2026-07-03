# T-015 — Protocol v1 (wire types + version handshake)

- **Status:** blocked
- **Repo:** both (source of truth in pro-server `protocol/protocol.ts`; synced copy in this repo `lib/pro/protocol.ts`)
- **Depends on:** T-004, T-005 (view/action shapes must be stable first)
- **More info needed:** NONE

## Context
The ONLY coupling between the public client and the private server (context
doc). Client knows zero rules: it renders `view + legalActions + prompt` and
sends actions. Keep it small, JSON, boring.

## Scope
- `protocol/protocol.ts`: `PROTOCOL_VERSION` (integer); client→server:
  `hello{v}`, `createRoom{name}`, `joinRoom{code, name, reconnectToken?}`,
  `pickHero{heroId}`, `action{gameAction}` (gameAction = the engine's Action
  type, re-exported shape only); server→client: `lobbyState`, `gameView{view,
  legalActions, prompt?}`, `gameOver{winner, reason}`, `error{code, message}`,
  `versionMismatch{minVersion}` (client shows "refresh").
- `PlayerView` shape: public state (board, HP, discard piles, counters, action
  log, revealed combat cards) + viewer's private state (own hand, own
  face-down commit) + opponent summaries (hand COUNT only). Redaction itself is
  T-016; this ticket only fixes the shape so redaction has a target.
- Reconnect token semantics documented in the file (issued on join, replayable
  once, rotates).
- Sync procedure documented at top of file: any change bumps
  `PROTOCOL_VERSION`, copy the file to `unbrewed-p2p/lib/pro/protocol.ts`, note
  it in both commit messages.

## Acceptance criteria
- File compiles in BOTH repos with no imports beyond type-level engine shapes
  (no engine logic leaks).
- A type-level test in pro-server asserting `PlayerView` contains no field
  typed as the full secret state (e.g. opponent hand array).

## Out of scope
The socket implementation (T-016 server, T-019 client).
