# T-017 — Server: Railway deployment

- **Status:** blocked
- **Repo:** unbrewed-pro-server
- **Depends on:** T-016
- **More info needed:** NONE — answered 2026-07-04:
  1. The user's own Railway account; **the user creates the project himself**
     (agent supplies config + instructions, does not provision).
  2. Domain: not yet chosen — default to the Railway-generated domain; ask
     again only when wiring `NEXT_PUBLIC_PRO_WS_URL` for production.
  3. Budget: **$5–10/month** — smallest instance, no autoscaling, one process.

## Context
Single Node process, in-memory state — the simplest possible deploy. Accept
that a redeploy drops live games for now (no persistence by decision); deploy
etiquette beats infrastructure.

## Scope
- Deployment config in the pro-server repo (Dockerfile or Nixpacks — prefer
  whichever Railway needs least config for), `PORT` env, `/healthz` endpoint,
  graceful shutdown (close rooms with a `gameOver{reason:'server-restart'}`).
- WSS: terminate TLS at Railway's edge (comes free with their domains).
- CORS/origin allowlist: the unbrewed domains + localhost dev.
- Write `docs/DEPLOY.md` in that repo: how to deploy, roll back, read logs,
  and the "don't redeploy while rooms are live" etiquette (add a
  `/healthz?rooms` count for checking).
- Client env in THIS repo: `NEXT_PUBLIC_PRO_WS_URL` documented in `.env.example`.

## Acceptance criteria
- `wss://<endpoint>` reachable from a browser client; a full game playable
  across two machines/networks.
- Health endpoint returns room count; logs visible in Railway.
- Deploy docs good enough that the user can redeploy without an agent.

## Out of scope
CI/CD automation, autoscaling, persistence, custom metrics.
