# Cross-player card transfer (a.k.a. the "Houdini" problem)

Design plan for moving a card from one player's zone into **another** player's zone —
e.g. Houdini returning an opponent's discarded Trick to his own hand, or simply
"give this card to my opponent." Not yet implemented; this is the design.

## The core constraint

The gameserver relay stores state keyed by the sender:

```go
// gameserver/gameserver/server.go
FieldState.Players[name] = gm.Content   // name == the sender
```

So **a client can only ever write its own blob.** Player A physically cannot
push a card into B's pool. Every workable design has to route through
"B writes B's pool." The relay also **drops unknown msgtypes**, so a brand-new
message channel would require a Go server change.

The good news: we already have the pattern this needs. The shared map and the
synced action log both work by *stamping state onto your own blob and letting the
other client reconcile*. Card transfer is the same shape. And cards travel as
**full objects** in the payload, so the missing per-card unique ID never bites —
same trick `reorderTop` already relies on.

## Data model

Two new optional fields on `PlayerState` (`lib/gamesocket/message.ts`):

```ts
type Transfer = {
  id: string;               // `${from}-${seq}` — monotonic per sender
  from: string;
  to: string;
  card: DeckImportCardType;  // the card travels in-payload (no ID lookup needed)
  zone: "hand" | "deckTop" | "deckBottom" | "discard";
  createdAt: number;
};

interface PlayerState {
  // ...existing...
  pendingTransfers?: Transfer[];   // on the SENDER's blob — acts as escrow
  appliedTransfers?: string[];     // on the RECIPIENT's blob — ids it consumed
}
```

## Flow (three phases, all blob-stamped like the log)

1. **Offer.** A removes the card from its own pool and pushes a `Transfer` onto
   `A.pendingTransfers`, then broadcasts. The transfer object *is* the escrow —
   the card now lives there, never in limbo.
2. **Apply.** B's client runs a reconcile effect that watches every player's
   `pendingTransfers` for `to === self` where `id ∉ B.appliedTransfers`. It writes
   the card into `B.pool[zone]` (reusing existing `PoolFns`: hand `push` /
   `deckCard` / `deckCardBottom` / discard), records the `id` in
   `B.appliedTransfers`, broadcasts, and `logAction("received a card from A")`.
3. **Cleanup.** A's reconcile effect drops any pending transfer whose `id` now
   appears in the recipient's `appliedTransfers`. B prunes `appliedTransfers` ids
   that no sender still advertises, keeping the list bounded.

## Why this is safe

- **No lost cards.** The card is always in exactly one place — a pool or an
  in-flight transfer object.
- **Idempotent under rebroadcast.** The relay re-emits whole state constantly;
  the `id ∈ appliedTransfers` check makes double-apply impossible.
- **Offline-tolerant.** If B is away, the offer sits in A's escrow until B
  returns and applies it.
- **Fully auditable.** Both ends call `logAction`, so every transfer shows up in
  the Activity feed.

## Two modes

Unmatched has both consensual and forced transfers, so support both:

- **Auto-apply (recommended default).** B's client applies incoming transfers
  silently and logs them. Models forced effects (Houdini yanking an opponent's
  discarded card) without a click — appropriate for a no-enforcement sandbox.
- **Consent.** B gets an Accept/Decline prompt. Decline adds the id to a
  `declinedTransfers` list; A sees it and returns the card to its own pool. Good
  for "here, take this card" gifts. Make it a per-player toggle.

## UI surfaces

- A "Give card to…" entry on the card kebab and in the deck/discard modals
  (pick target player + target zone).
- A matching command in the ⌘K palette.
- Notifications reuse toasts; consent mode adds a small Accept modal.

## Provider work

Mirror `stampMap`/`stampLog` with a `stampTransfers`, plus the two reconcile
effects (recipient-applies, sender-cleans-up), both writing through
`readLocalPool()`. No new plumbing, no server change.

## Rollout

- **v1 (MVP):** hand-only, auto-apply, escrow + id-dedup. Covers "give a card"
  and Houdini-to-hand.
- **v2:** add zones (deck top/bottom, discard) and the consent toggle.
- **Later:** the forced-discard family ("A makes B discard") is a natural
  follow-on using the same channel in reverse — A posts a *request* on its blob,
  B's client resolves it — but that's a separate primitive from transfer and
  deserves its own pass.
