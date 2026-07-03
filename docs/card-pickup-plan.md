# Opponent card pickup from the table (issue #67, phase 3)

_Plan written 2026-07-03, on the card-on-table branch. Builds on
`card-transfer-plan.md` (the "give" direction) — read that first; this doc
adds the "take" direction: an opponent picks a card token up off the board
into their own hand._

## What makes pickup different from "give"

`card-transfer-plan.md` solves sender-initiated pool→pool transfer with an
escrow on the sender's blob. Pickup differs in two ways:

1. **The recipient initiates.** B wants A's table card; A hasn't offered it.
2. **The source is a board token** in A's `PositionBlob` (playerposition
   channel), not a card in A's pool (playerstate channel).

Both differences resolve into one extra primitive — a **claim** — after
which pickup reuses the transfer escrow unchanged:

```
B posts claim  →  A's client converts token → escrow transfer  →  B applies
   (new)              (new reconcile on A)                    (existing plan)
```

## Why not just let the server move the card? (we can touch Go now)

This session made the relay editable (compression, join replay, etc.), so a
server-side "transfer" msgtype is tempting. **Don't.** Clients send their
*whole* blob computed from local state on every action. If the server
mutated A's stored blob on B's request, A's very next send (a drag tick, a
draw) would be built from A's stale local view and clobber the server-side
mutation — resurrecting the token, duplicating the card. Any mutation of A's
state must flow *through A's client* so A's local view and blob stay the
single source of truth. The claim handshake does exactly that. (This is the
same reason the shared map syncs via stamping rather than a server field.)

## Data model

On `PlayerState` (`lib/gamesocket/message.ts`), alongside the transfer
fields from the companion doc:

```ts
type TokenClaim = {
  tokenId: string;   // the card token being claimed (ids are owner-prefixed)
  owner: string;     // token owner — lets A filter cheaply
  claimedAt: number; // arbitration + TTL
};

interface PlayerState {
  // ...existing + pendingTransfers/appliedTransfers from card-transfer-plan...
  tokenClaims?: TokenClaim[];   // on the CLAIMANT's blob
}
```

No optimistic hand-add: B does **not** take the card until the escrow
transfer arrives. This is what makes multi-claimant races trivially safe —
losers simply never receive a transfer, so there is nothing to revert.

## Flow

1. **Claim (B).** B clicks an opponent's card token → "Pick up". B stamps
   `{tokenId, owner: A, claimedAt}` onto its own blob (new `stampClaims`,
   same shape as `stampMap`/`stampLog`/`stampRoll` in `WebGameProvider`).
   UI shows a pending state on the token.
2. **Grant (A, reconcile effect).** A's client watches all blobs for claims
   with `owner === self` whose token A still has. For each (winner = lowest
   `claimedAt`, tie-break by name):
   1. Push `Transfer{ id: "take-" + tokenId, from: A, to: B, card, zone: "hand" }`
      onto `A.pendingTransfers` and broadcast (**escrow first** — the card is
      never in zero places).
   2. Delete the token from A's `PositionBlob` and broadcast.

   The deterministic transfer id (`take-${tokenId}`) makes a crash between
   the two sends harmless: re-running re-posts the same id (recipient
   dedups via `appliedTransfers`), and the token deletion re-runs.
3. **Apply (B).** Existing transfer-apply reconcile from
   `card-transfer-plan.md`: card into `B.pool.hand`, id into
   `appliedTransfers`, `logAction("picked up a card from A")`.
4. **Cleanup.** B prunes its claim once the token id no longer exists in
   A's blob (or on a ~60s TTL if A never responds — "owner offline" toast).
   A prunes the escrow per the transfer plan's phase 3.

Every hop is idempotent under the relay's constant whole-state rebroadcast,
and thanks to the join-replay fix in this branch, claims and escrows survive
either player refreshing mid-handshake (they're stamped on blobs, which now
replay on join).

## Latency & failure honesty

- Happy path is two reconcile hops: sub-second when both players are live.
- A offline → B's claim sits pending with visible "waiting for owner" state;
  the card stays safely on the table. This is the correct semantic for a
  physical-table metaphor: you can't take a card from a player who left with
  the table.

## UI

- Opponent **card** tokens become clickable (today all foreign tokens are
  `pointer-events: none` in `useCanvas.tsx` — carve out `d.card` tokens for
  click only, still not draggable). Click → mini panel: card back/name plate
  preview + **"Pick up card"**.
- Claimed token gets a pulsing ring (both players see it — it's derivable
  from any blob's claims during `markup()`).
- Both sides log to the Activity feed.
- v2: owner consent toggle ("opponents must ask") reusing the transfer
  plan's Accept/Decline machinery; v1 is auto-grant, matching the issue's
  sandbox intent.

## Implementation steps, in order

| # | Step | Where | Size |
|---|---|---|---|
| 1 | Transfer primitive v1 (escrow + apply + cleanup, hand-only, auto-apply) — from `card-transfer-plan.md`; ship with a "Give card to…" kebab action as its own feature | `message.ts`, `WebGameProvider.tsx`, `PoolFns.ts`, hand UI | ~½ day |
| 2 | `tokenClaims` + `stampClaims` + claimant UI (click opponent card token → Pick up, pending ring) | `message.ts`, `WebGameProvider.tsx`, `useCanvas.tsx`, `game.tsx` | ~½ day |
| 3 | Owner grant reconcile (claim → escrow-first + token delete, deterministic id, winner arbitration) | `game.tsx` / `WebGameProvider.tsx` | small |
| 4 | Claimant cleanup + TTL + offline toast | same | small |
| 5 | Two-browser e2e: place face-down → B picks up → card in B's hand, A's board clear, both logs; refresh-mid-claim; (3-player double-claim if ambitious) | scratchpad harness (pattern exists) | ~½ day |

Step 1 is independently shippable (Houdini/"give a card"); steps 2–4 are the
pickup itself; nothing touches Go.
