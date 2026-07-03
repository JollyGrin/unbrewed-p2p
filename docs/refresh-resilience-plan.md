# Refresh resilience: what's fixed, what's left, localStorage plan

_Investigated 2026-07-03 on the card-on-table branch. Companion to
`position-data-volume.md`._

## The bug that was actually eating cards

"Place a card, refresh, card gone" reproduced 100%. It was not a missing
save layer — it was four compounding bugs, all now fixed on this branch:

1. **Relay never replayed board positions on join**
   (`server.go` `PlayerJoin` broadcast game state only). A rejoiner saw an
   empty board until someone moved a token.
2. **The client's starter-disc fallback then destroyed the real blob**:
   after 1.5s with no positions in sight, `game.tsx` sends a fresh
   `{tokens:[disc]}` blob — overwriting the server copy that still held the
   card token. The card existed nowhere after that.
3. **Zombie-connection eviction**: on refresh the new connection can join
   before the old one's read loop notices the close; `PlayerExit` deleted
   `Clients[name]` unconditionally, kicking the *fresh* connection off the
   broadcast list — the rejoiner received nothing at all.
4. **The hand-init timer didn't cancel** when the replayed pool arrived, so
   a stale timeout could re-initialize the deck over restored state
   (`hand.container.tsx`).

Fixes: join now replays `gamestate` + `playerposition`; `PlayerExit` only
removes the map entry if it still points at the same connection; the init
timer clears on effect re-run; and all connection writes go through a
per-conn mutex (`PlayerConn.Send`) — the old raw writes raced and, with
compression on, corrupted the deflate stream.

**Verified**: place card → refresh → card token, deck count, and hand all
survive. Stress harness (reconnect churn ×40, 4-client 50Hz broadcast storm,
malformed/5MB frames, 30 concurrent joins) passes with zero bad frames.

## Remaining loss windows

Room state lives only in relay memory, so state still dies when:

| Window | Frequency | Notes |
|---|---|---|
| Relay redeploy / crash (fly.dev, future railway mirror) | every deploy | everything in every room is lost |
| Room GC | 12h inactivity (`GarbageCollector`) | intended cleanup, but a "resume tomorrow" game is gone |
| Player returns after room died | with either of the above | their deck/table setup is unrecoverable |

## Plan: localStorage lagging save (client-side, no relay changes)

### Save

- Key: `GAME_BACKUP` → `{ gid, name, savedAt, pool, positionBlob }` (one
  slot, latest game only; ~20 KB worst case vs the ~5 MB quota that already
  budgets decks).
- Written on every outgoing `playerstate`/`playerposition`, throttled to one
  write per ~2s trailing — "lagging" is fine; we only need roughly-current.
- Lives in `WebGameProvider` (both senders already funnel through it).

### Restore — the decision matrix

Restore runs once, at the **first join replay** (which the relay now
guarantees within one RTT):

| Server state for (gid, me) | Backup state | Action |
|---|---|---|
| has pool or positions | anything | **server wins**, overwrite backup |
| empty | matches gid+name, savedAt < 24h | **offer restore** (toast: "Found your table from 3h ago — Restore / Discard") |
| empty | stale, or different gid/name | purge silently |

On "Restore": send saved pool + blob as normal `playerstate`/`playerposition`
messages — the relay needs no new concepts; on "Discard": delete the backup.

### Why staleness stays manageable

The user's instinct that this "gets tricky with stale info" is right in
general but tamed by one structural fact: **blobs are single-writer**. Only
you ever write your pool/positions (the relay keys writes by connection
name), so a backup can never be stale relative to *another player* — only
relative to yourself on another tab/device.

- **Live game elsewhere** (second tab/device): server state is non-empty →
  server wins, backup never fires. No clobbering possible.
- **Same gid reused for a brand-new game** after the old room died: the
  backup would resurrect the old table — this is why restore is a **prompt,
  not automatic**. The toast shows the deck name + age; a wrong restore is
  one click to decline and self-purges.
- **24h TTL** bounds every weird case; expired backups delete themselves.
- Multi-tab with the same name is already undefined behavior today (the
  relay's name-taken check is commented out); the plan doesn't worsen it.

### Effort

~Half a day: throttled save + restore check in `WebGameProvider`, one small
toast component, purge logic. No Go changes.

## Alternative considered: relay-side persistence

Snapshotting rooms to disk/SQLite on change and reloading on boot would fix
redeploys for *all* players at once (localStorage only helps players who
come back). It's the better long-term answer — especially before running a
railway mirror, since every deploy restarts state — but it's real server
work (serialization, startup reload, file lifecycle on fly + railway).
Recommendation: ship the localStorage layer first (cheap, client-only), add
relay persistence when the railway mirror becomes serious.

## Railway mirror note

The relay now honors `PORT` (falls back to 1111), which is exactly what
railway injects — the Go server should deploy there unchanged. Point any
client at it via the existing server picker (`SERVER_ACTIVE`). Remember each
relay is an island: rooms on fly and railway don't see each other.
