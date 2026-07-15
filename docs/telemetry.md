# Balance telemetry (orientation)

There is a separate **balance-telemetry** system for Unbrewed: a Node/Postgres
service (`unbrewed-telemetry`) that collects completed Pro games + deck
definitions and serves a **balance dashboard** — win rates with confidence
intervals, the 1v1 matchup matrix, 2v2 synergy, pick-vs-win, per-deck pages,
and a recents feed.

This doc exists so contributors know **where telemetry comes from and where it
does *not***. Short version: **p2p does not produce balance telemetry.**

## Who produces it

Pro games run on the **unbrewed-engine Pro server** — the same WebSocket server
this app's Pro client connects to (`lib/pro/wsUrl.ts` →
`wss://unbrewed-engine-production.up.railway.app`). Balance telemetry is emitted
**server-side, by the engine**, when a game finishes and (separately) when its
deck registry is published. See `docs/TELEMETRY.md` in the `unbrewed-engine`
repo for the producer details, payloads, and config.

## p2p's role

- **Pro client (`lib/pro/`, `pages/pro/`)** — connects to the engine Pro server
  and plays games. It sends game *actions* over the Pro protocol, not balance
  telemetry. Game outcomes are recorded by the engine server, not by the client.
- **Casual `gameserver/` (Go relay)** — the peer-to-peer signaling/relay for
  casual play. It is unrelated to balance telemetry.

So there is **nothing to configure or emit from this repo** for balance
telemetry. If future work needs richer per-game data for the dashboard, it is
collected on the engine Pro server (from the finished room), not in the p2p
client or the Go relay.

## Where things live

| Piece | Repo |
|-------|------|
| Balance dashboard + ingest API + Postgres model | `unbrewed-telemetry` |
| Telemetry **producer** (deck push, game submissions, sim harness) | `unbrewed-engine` (`docs/TELEMETRY.md`) |
| Pro client / UI | this repo (`lib/pro/`, `pages/pro/`) |

## See also

- `unbrewed-engine/docs/TELEMETRY.md` — the authoritative producer guide.
- `docs/pro/` — Pro-mode protocol, rooms, and deploy tasks (T-015/016/017).
