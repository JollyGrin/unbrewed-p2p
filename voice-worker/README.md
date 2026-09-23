# unbrewed-voice

Standalone Cloudflare Worker that backs the app's voice chat: a `POST /join`
password check that issues a signed ticket, a `VoiceRoom` Durable Object that
holds the participant roster over hibernating WebSockets, and a
`/partytracks/*` proxy to the Cloudflare Realtime SFU (free up to 1,000 GB of
egress per month). It is a separate package from the Next.js app — own
`package.json`, `tsconfig.json`, and Vitest config — and is never built or
type-checked as part of the app.

## Local dev

```sh
npm install
npm run typecheck
npm test
```

`npm run dev` / `npm run deploy` need `npx wrangler login` first — not run as
part of this change, since no Cloudflare credentials exist yet.

## Owner setup (one-time)

1. **Create the Realtime SFU app.** Cloudflare dashboard → Realtime → SFU →
   Create app. Copy the **App ID** and **App Token**.
2. **(Optional) create a TURN app** the same way under Realtime → TURN, for
   players behind restrictive NATs. Copy its App ID and Token too.
3. **Log in to Wrangler**: `npx wrangler login` (from `voice-worker/`).
4. **Set the secrets** (never commit these values):
   ```sh
   npx wrangler secret put SFU_APP_ID
   npx wrangler secret put SFU_APP_TOKEN
   npx wrangler secret put VOICE_PASSWORD       # the shared voice password
   openssl rand -base64 32 | npx wrangler secret put TICKET_SECRET
   # optional, only if you created a TURN app:
   npx wrangler secret put TURN_APP_ID
   npx wrangler secret put TURN_APP_TOKEN
   ```
5. **Check `ALLOWED_ORIGINS`** in `wrangler.jsonc` if the app's deployed URL
   differs from `https://unbrewed.xyz`.
6. **Deploy**: `npx wrangler deploy`. Note the resulting `*.workers.dev` URL.
7. **Point the app at it**: in the app's hosting environment (e.g. Vercel), set
   `NEXT_PUBLIC_VOICE_URL` to that Workers URL, then redeploy the app. Without
   it, the voice pill shows "Voice chat isn't set up yet" instead of crashing.

## Environment reference

| Name | Kind | Purpose |
|---|---|---|
| `SFU_APP_ID` | secret | Cloudflare Realtime SFU app id |
| `ALLOWED_ORIGINS` | var | Comma-separated origins allowed to call this Worker |
| `SFU_APP_TOKEN` | secret | Cloudflare Realtime SFU app token |
| `VOICE_PASSWORD` | secret | Shared voice password checked by `POST /join` |
| `TICKET_SECRET` | secret | HMAC key signing/verifying join tickets |
| `TURN_APP_ID` | secret, optional | Cloudflare TURN app id |
| `TURN_APP_TOKEN` | secret, optional | Cloudflare TURN app token |

## Routes

- `POST /join` — `{ room, name, password, role }` → `{ ticket, participantId }`
  on success (401 wrong password, 400 invalid input, 503 not configured).
- `GET /rooms/:room/ws?ticket=…` — upgrades to a WebSocket into that room's
  `VoiceRoom` Durable Object once the ticket is verified.
- `/partytracks/*` — proxied to the Realtime SFU via `partytracks/server`,
  gated on a valid ticket in the `X-Voice-Ticket` header.
