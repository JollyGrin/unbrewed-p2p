# T-017 — Server: Railway deployment

- **Status:** needs-info
- **Repo:** unbrewed-pro-server
- **Depends on:** T-016
- **More info needed:** ⚠️ YES — ask the user before building:
  1. Railway account/project to deploy into (and who creates it).
  2. Public endpoint: Railway-generated domain, or a custom domain (e.g.
     `pro.unbrewed.xyz` / `pro-ws.unbrewed.xyz`)? DNS access needed if custom.
  3. Monthly spend comfort level (drives instance size/sleep settings —
     "hobby project, keep this cheap" is the standing directive).

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
