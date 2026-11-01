# Analytics (PostHog EU Cloud) — issue #1438

Replaces counter.dev (which stays until the ~2-week comparison ends). Game/balance data stays in
`unbrewed-telemetry`; PostHog answers product questions only.

## Status
- **Phase A (this PR):** SDK, `lib/analytics.ts`, notice + `/privacy`, identify on login, `$pageview`,
  release super-properties, proxy Worker, `analyticsId` on the wire.
- **Phase B (after A merges):** event call sites for sections 2, 3 (client modes), 4 (client), 6 below.
- **Engine:** `JollyGrin/unbrewed-engine#894` (`posthog-node`, pro game events).

## Configuration
| Env | Meaning |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | EU project key (never committed). Unset = analytics fully off. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Proxy origin, e.g. `https://t.unbrewed.xyz`. Defaults to `https://eu.i.posthog.com`. |

Both are set as GitHub Actions repository variables and passed to the build step in `.github/workflows/nextjs.yml`.

Analytics are off in dev and test (`NODE_ENV !== "production"`), on `/dev/*` and `/debug`, and whenever the key is unset.
Everything goes through `lib/analytics.ts` (the only importer of `posthog-js`, loaded by dynamic `import()` only once analytics starts, so nothing downloads when it is off/declined). The notice and first start are skipped on in-game routes (`/pro/game`, `/game`, `/irl`, `/offline`, `/table`): a new visitor starts on the first normal route. The account probe for identify mounts only when analytics is available.

## Privacy model
- No cookie; anonymous id in localStorage. Notice (`AnalyticsNotice`) renders first, capture starts after it
  has painted; `Decline` persists and calls `opt_out_capturing`. `/privacy` explains and lets users flip it.
- `person_profiles: "identified_only"`, autocapture off, session replay off.
- On sign-in (`useAccount` → signed-in) `posthog.identify(account.id)` — the Unbrewed account uuid from `/me`, not the Discord snowflake — merges the anonymous history; sign-out resets.
  The privacy blurb says this.
- While signed in, the person profile also stores the Discord username, avatar and Discord id (#1510), sent with
  identify: `$set` {`username`, `avatar_url`, `discord_id`, `auth_provider`}, `$set_once` {`account_created_at`,
  `first_identified_at`}, plus `discord_roles_linked` from the /account page's Linked Roles read. Fields `/me` lacks are
  left out. A localStorage fingerprint (`unbrewed-analytics-person`) means an unchanged profile sends nothing on later
  loads. A guest `/me` answer resets a persisted identified id (session expired / signed out in another tab).
  `login_completed` fires only when identify switches an anonymous id to the account. The count is slightly inflated by
  cleared browser storage and by players signed in before phase A, whose first load after deploy counts as one.
- `capture_pageleave` is off (it doubles volume against the 1M/month free tier). Exception autocapture, web vitals, performance, heatmaps, dead clicks, surveys and replay are pinned off.
- Super-properties on every event: `app_commit`, `app_version`.
- No PII: no typed deck names, chat text or e-mails in properties.
- URL sanitizer (`before_send: sanitizeEvent`): every URL property (`$current_url`, `$referrer` from our own origin, `$initial_*`, `$initial_person_info`) loses its fragment and keeps only `utm_*`, `ref`, `deckId`, `tour`, `match` query params, so `name` / `gid` / `ticket` never leave; external referrers only lose the fragment.

## Proxy (Cloudflare Worker, `workers/posthog-proxy`)
GitHub Pages cannot proxy, so a Worker on `t.unbrewed.xyz` forwards to `eu.i.posthog.com` (and `/static/*` to
`eu-assets.i.posthog.com`), strips cookies, forwards the visitor IP as `X-Forwarded-For` (from `CF-Connecting-IP`), answers CORS for unbrewed.xyz. Deploy: `cd workers/posthog-proxy && npx wrangler deploy`,
then set `NEXT_PUBLIC_POSTHOG_HOST=https://t.unbrewed.xyz` in the build env. Also set the PostHog billing limit.

## Wire: `analyticsId`
Optional string on `CREATE_ROOM` / `JOIN_ROOM` / `RECONNECT` / `RESUME_ROOM`: the PostHog distinct id, added in
`sendBind` only when analytics is active. Before posthog-js has loaded (a direct `/pro/game` load), a visitor who
accepted the notice sends the id PostHog persisted in localStorage (or the known account id), so the bind never waits. The engine uses it as `distinct_id` (account id when logged in). The
field is protocol v39 (engine #894); `lib/pro/protocol.ts` is synced to it, so this needs an engine at v39.

## Taxonomy
Every game event carries `mode`: `sandbox` (`/game`, `/connect`), `sandbox-table` (`/table`), `irl` (`/irl`, `/offline`), `pro` (`/pro/game`).

1. **Growth:** `$pageview` (referrer/UTM), `landing_cta_clicked`, `share_link_opened`,
   `invite_link_copied`, `join_link_opened`, `login_started`, `login_completed` (+ `$identify`), `pwa_installed`, `app_first_open`.
2. **Decks:** `deck_added` {source, deck_id, hero_name, card_count, success, …}, `deck_add_failed` {source, reason},
   `deck_removed`, `deck_replaced`, `deck_selected_for_game`, `hero_picked`, `hero_preview_opened`.
3. **Games:** engine: `game_created`, `game_started`, `game_finished` {duration_s, end_reason, …}, `game_abandoned`,
   `rematch_offered/accepted`, `reconnect`. Client (no-engine modes): `lobby_created/joined`, `game_started`, `game_ended`,
   `irl_session_started`, `tableplace_handoff`. Tournaments: `tournament_created/joined/match_played`.
4. **Errors:** `$exception`, `ws_connect_failed`, `ws_closed_unexpected`, `toast_error_shown`; engine `server_error`, `rate_limited`.
5. **Funnels/paths:** built from the above (visitor → first game, deck-add per source, lobby funnel, retention).
6. **Feature usage:** `cosmetics_equipped`, `collection_opened`, `stats_viewed`, `leaderboard_viewed`, `replay_opened`, settings toggles.

Never per-move or per-WebSocket-message.
