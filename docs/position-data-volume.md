# Position-data volume: measurements & easy wins

_Investigated 2026-07-03, on the card-on-table branch (issue #67). Numbers
measured with the Baba Yaga deck fixture (`public/top-decks/yAJ-.json`)._

## How position data flows today

1. Every d3 drag tick (one per pointermove, i.e. **60–120 Hz** while a token
   moves) calls `moveToken` (`pages/game.tsx`), which re-serializes the
   player's **entire** `PositionBlob` and sends it as a `playerposition`
   message (`useCanvas.tsx` drag handler → `sendTokens` → socket). There is
   no throttling anywhere in the path.
2. The relay stores the blob and broadcasts **all players' blobs to all
   clients** on every tick (`gameserver/server.go:326-332` →
   `broadcastAll`).
3. Clients render tokens **from the server echo**, not locally
   (`game.tsx` builds `allTokens` from `gamePositions`). Your own drag is
   only as smooth as your round-trip to the relay — this is already
   noticeable on fly.dev and is a UX problem independent of volume.
4. The websocket upgrader has **no compression**
   (`server.go:254` — gorilla defaults `EnableCompression` off).

## Measured sizes (JSON bytes)

| Payload | Bytes |
|---|---|
| Disc token | 31 |
| Image token (typical URL) | ~106 |
| **Card token (full card text + faceDown)** | **~412** (avg card 307, max 342 + token fields) |
| PositionBlob: 2 discs + 1 image + 1 card | ~614 |
| PositionBlob: 2 discs + 1 image + 5 cards | ~2,260 |
| Full `playerstate` pool (30-card deck) | ~14,900 |

## Traffic math (2-player room, one player dragging at 60 Hz)

Relay egress per second = blob-of-everyone × 60 × clients.

| Table state | Per-tick broadcast | Relay egress | Per-client download |
|---|---|---|---|
| Pre-cards (3 tokens each) | ~0.4 KB | ~48 KB/s | ~24 KB/s |
| 5 card tokens each | ~4.6 KB | ~550 KB/s | ~275 KB/s |

So card tokens multiply drag traffic ~10× — not fatal on desktop broadband,
but meaningful on mobile, and all of it is redundant: the only thing changing
per tick is one token's `x,y` (~30 bytes of information carried by ~4,600
bytes of message).

The `playerstate` channel is bigger per message (~15 KB) but only fires on
discrete actions (draw/discard/play), so it's not the problem; no action
needed there.

## Easy wins, ranked

### 1. Local-echo the drag + throttle the sends (client only) ⭐

Two changes in one, ~15 lines, no protocol impact:

- In the d3 drag handler, set the dragged element's `transform` directly
  (`d3.select(this).attr("transform", …)`) so your own token tracks the
  pointer at full frame rate regardless of network.
- Wrap the network send (`move`) in `lodash.throttle` (already a dep) at
  **20 Hz with a trailing call** so the final position always lands.

Effect: your own drag becomes perfectly smooth (better than today, where it
waits on the echo), and drag traffic drops **3–6×** (60–120 Hz → 20 Hz).
This is the one to do first.

### 2. `EnableCompression: true` on the upgrader (one line, Go redeploy)

Position/state JSON is extremely repetitive (same keys, same card text every
tick); permessage-deflate typically shrinks it 5–10×. Browsers negotiate it
automatically — no client change. Combined with win 1, the 550 KB/s worst
case above becomes roughly **15–30 KB/s**. Gorilla marks the feature
"experimental" but it's widely used; CPU cost is trivial at this scale.

### 3. Tween remote tokens (client only, contained in `useCanvas`)

With sends at 20 Hz, *other* players' tokens update 20×/s, which looks
slightly steppy. Interpolate: for non-own tokens, apply position via
`selection.transition().duration(50).attr("transform", …)` instead of
setting it instantly. ~10 lines, all inside `renderGroup`. This also decouples
perceived smoothness from send rate, opening the door to 10 Hz sends later.
(Gotcha: keep `.html(markup)` out of the transition — only tween the
transform, and skip the tween for tokens whose non-positional fields changed.)

### 4. Skip no-op sends (trivial)

`moveToken` fires even when coordinates haven't changed (drag start, subpixel
moves). Guard with `if (t.x === prev.x && t.y === prev.y) return` and round
coords to integers before sending (also shaves bytes: `1183.2384971`-style
floats dominate disc tokens).

## Not worth it (for now)

- **Delta messages** (`{id, x, y}` instead of whole blob): the relay stores
  each player's blob verbatim and replays it to late joiners — deltas would
  corrupt that without a store-and-merge relay change. Real work, and wins
  1+2 get ~90% of the benefit.
- **Slimming card tokens to a card-reference**: opponents can't resolve a
  ref (they don't have your deck locally), so the full card must travel at
  least once. Compression (win 2) already de-duplicates the repeated text
  almost entirely.
- **Broadcasting only the changed player's blob**: needs a client-side merge
  protocol change; revisit only if rooms grow beyond 2–4 players.

## Suggested order

1 → 2 → 4 are an afternoon combined and compound multiplicatively
(~20–40× reduction in worst-case drag traffic, plus a strictly better own-drag
feel). Do 3 when the lower send rate is in and remote motion looks steppy.
