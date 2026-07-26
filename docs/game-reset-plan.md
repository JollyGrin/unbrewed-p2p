# New game + Change my deck (issue #493)

_Written 2026-07-26. Sibling of `card-transfer-plan.md` and
`card-pickup-plan.md`; like those, it exists because the gameserver relay is
**write-your-own-blob-only** and any room-wide effect has to be built out of
per-player blobs._

## Two asks, deliberately separate

| | blast radius | consent | protocol |
|---|---|---|---|
| **Change my deck** | just me | none | none — a normal pool + position send |
| **New game** | the whole room | every other player accepts | 3 new blob fields |

Keeping them apart is the point: swapping heroes is routine, wiping the table
is not.

## Why this can't be a server call

`gameserver/gamemessage.go` stores one blob per player under `playerstate` /
`playerposition` and replays them to joiners. There is no room-level mutation
and no "clear room" endpoint (`lib/gamesocket/socket.ts`). Worse, a
server-side mutation of A's blob would be clobbered by A's very next send,
which is built from A's local state (the same reasoning as the pickup plan).

So a reset is a **convergent signal every client applies to itself** — exactly
the shape the shared map already uses (`mapUrl` + `mapUpdatedAt` as a logical
clock on every blob, highest wins).

## Protocol (`lib/gamesocket/message.ts`)

```ts
resetRequest?: ResetRequest;  // proposer only; cleared on commit/cancel/expiry
resetVotes?: ResetVote[];     // this player's answers to requests they've seen
resetEpoch?: number;          // highest reset this player has APPLIED
```

All three are stamped onto **every** outgoing blob by `stampReset`, alongside
`stampMap` / `stampLog` / `stampRoll` / `stampHandoff` in `broadcast()`. A
partial send must never drop them: a blob missing `resetEpoch` reads as "this
player has applied nothing", and the room would wipe them again.

`resetEpoch` is the only field that triggers a wipe. The request and the votes
are just the handshake that decides when to bump it.

## The adopt rule

```
myEpoch  = my applied epoch  (seeded from the relay's replay of my own blob)
maxEpoch = max(resetEpoch) across all players
apply the wipe iff maxEpoch > myEpoch
```

One comparison covers every case, with no seed-suppression flag (contrast the
dice path, which needs `hasSeededRollsRef` precisely because a roll has no
per-player applied-marker):

- **refresh after a reset** — my replayed blob already carries the epoch →
  equal → no second wipe.
- **stale rejoin** — I was offline when it happened, so my replayed blob
  carries the *old* epoch → less → I wipe and re-seed. Without this I'd come
  back holding a pre-reset pool while everyone else is fresh.
- **brand-new joiner** — epoch 0 < max, but there is no pool yet: adopt the
  epoch and skip the wipe, so this doesn't fight the join-time seed timers.

`lib/sandbox/gameReset.ts` holds this as pure functions; `gameReset.test.ts`
tests it as a table.

## Consent flow

1. Proposer clicks **New game** → dialog listing what dies, with a *Change*
   link into the deck picker → **[Ask for a new game]** puts a `resetRequest`
   on their blob.
2. Every other player with a pool sees a prompt and stamps a `ResetVote` on
   **their own** blob.
3. Unanimous accept → the proposer commits: `resetEpoch = max + 1`, request
   cleared.
4. Everyone applies the wipe off the epoch.

A single decline drops the request with a toast; nothing is wiped.

**Required voters** are the other seats that actually have a pool. A seat with
no pool has nothing to lose, so it never blocks — which is also what makes a
solo lobby and `/offline` commit immediately with no consent step at all.

## What the wipe clears

Spread across the pool, the position blob, and three ref groups in
`WebGameProvider.applyReset`. Missing any one of them breaks the rematch:

1. **Pool** → rebuilt from the currently starred deck via
   `lib/sandbox/initGame.ts` (`initPool`). *Not* nulled — leaning on the
   hand's 500ms auto-init timer is the race that makes rejoin fragile, so the
   init is a shared helper every path calls.
2. **Position blob** → re-seeded with `initPositionBlob`, the same helper the
   join path uses (saved loadout, else the lone starter disc). Sending
   `{ tokens: [] }` is not enough: `blobs[self]` stays truthy, so the join
   seed never re-fires and the player ends up with an empty board.
3. **`actionLogRef` + `actionSeqRef`** → cleared. Only the committer writes
   the `New game started by X` line: every client merges every blob, so a line
   per client would show the same reset N times.
4. **`rollSyncRef.lastRoll` + `seenRollIdsRef`** → cleared, and
   `hasSeededRollsRef` is dropped back to `false`. Clearing the seen-set alone
   would let a pre-reset roll from a blob that hasn't been wiped yet animate in
   the gap; re-seeding is exactly the join-time behaviour.
5. **`pendingTransfersRef` / `appliedTransfersRef` / `tokenClaimsRef`** →
   cleared. Additionally the handoff reconcile now ignores any player whose
   `resetEpoch` lags ours: a card in escrow at commit time would otherwise be
   dealt straight into the freshly shuffled deck.

**The map is preserved on purpose** — a rematch is normally on the same map,
and it is already changeable in-game. HP and sidekick counts come back via
`newPool`.

## Wedge cases

- **Ghost blobs.** Disconnected players' blobs persist with no liveness
  signal, so "everyone must accept" could wedge forever. After
  `RESET_REQUEST_TTL_MS` (60s, matching `CLAIM_TTL_MS`) the proposer's dialog
  offers **[Reset anyway]**, which commits regardless; other clients ignore
  expired requests entirely, so a stale one also dies on its own.
- **Concurrent proposals.** Both propose, both accept, both commit — but both
  compute `max + 1`, so they land on the same epoch and each client wipes
  once. Whoever commits second is usually pulled along by the other's epoch
  first (the epoch check runs before the vote tally), which drops their
  request without a second bump. In a genuinely simultaneous double-commit the
  feed shows one reset line per committer; that is honest (both did commit)
  and costs nothing, so it isn't specially suppressed.
- **Refresh mid-request.** The request lives on the proposer's blob, so the
  prompt re-appears — hence Accept has to be idempotent, and the local vote
  list is seeded from our own replayed blob.
- **Solo / offline.** `OfflineGameProvider` implements the same context
  methods; "New game" there is a straight re-seed.

## Entry points

- The local `PlayerBox` control row (where map / tokens / dice already live):
  a deck chip for **Change my deck** and ⟳ for **New game**.
- The ⌘ Actions palette grows a **Game** group, built from the same
  `buildDeckCommands` ctx primitives (`newGame`, `changeDeck`) so the two
  surfaces can't fork. Surfaces that can't provide a primitive omit the
  command, exactly as dice and board actions already do — here the primitives
  come from `GameMenusProvider`, which owns the dialogs.

The picker itself is `/connect`'s `SelectedDeckContainer`, reused with its
`/bag` links switched off so a mis-click can't navigate out of the lobby.

## Out of scope

`/pro/game` (engine-driven, owns its own lifecycle), resetting the map, undo,
and persisting reset history.
