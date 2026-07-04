# T-015 — Protocol v1 (wire types + version handshake)

- **Status:** done
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

## Result (2026-07-04)

Protocol v1 authored in pro-server `protocol/protocol.ts` (source of truth,
PROTOCOL_VERSION = 1) and synced verbatim to `lib/pro/protocol.ts` here.
Deviations from this repo's v0 draft:
- Prompt answers are a regular `RESPOND_PROMPT` **action** through the single
  ACTION path — the draft's `PROMPT_RESPONSE` client message is gone.
- `PlayerView` gained `counters`, `maneuver`, `catalog` (CardDefId → printed
  card metadata), `prompt` (full options for the chooser, `options: []` for
  the waiting player), and `ViewCombatCard { instance, role, boosts,
  effectiveValue }` for revealed combat cards.
- `LIST_HEROES`/`HEROES` messages added for the lobby roster.
- No hello message: every ClientMsg carries `v`; mismatch → ERROR{VERSION}.
- No event stream in v1 — the client diffs consecutive views (reveal beat =
  `combat.attackerCard` flipping null → card).
Acceptance held: file compiles standalone in both repos; type-level no-leak
test in pro-server `test/protocol.test.ts` — actually `test/server.test.ts`
(OpponentHasNoHand / ViewHasNoSecret assertions).
