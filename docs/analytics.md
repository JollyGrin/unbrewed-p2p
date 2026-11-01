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
- URL sanitizer (`before_send: sanitizeEvent`): every URL property (`$current_url`, `$referrer` from our own origin, `$initial_*`, `$initial_person_info`) loses its fragment and keeps only `utm_*`, `ref`, `deckId`, `tour`, `match` query params, so `name` / `gid` / `ticket` never leave; external referrers only lose the fragment. It also deletes `title` (`document.title` can carry a user-named deck, e.g. IRL Mode).

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
   `$pageview` already carries referrer, UTM and landing page (posthog-js campaign params). The events below (#1513) live in
   `lib/growthAnalytics.ts`; each is sent **at most once per page load** (a re-render, a second click or a URL the page rewrites
   itself sends nothing).
   | Event | Properties | Trigger |
   |---|---|---|
   | `landing_cta_clicked` | cta `<section>:<href>`, from_page | A click on a landing CTA (`components/LandingPage/`): `chooser` (Play now options), `tables` (the four table cards), `intent` ("I want to…" card), `pro` (Pro band buttons), `progression` (collection/leaderboard/tournaments), `decks` (2D/3D picks, "Open your bag"). In-page anchors, changelog, footer and nav are not CTAs. |
   | `share_link_opened` | kind `deck`\|`map`\|`replay`, source `share_page` | `/share/{deck,map,replay}/<id>` once the id is known (`ShareLanding`, `ReplaySharePage`; the routes and the 404.html rescue render the same components). |
   | `share_link_opened` | kind `deck`, source `deeplink` | `?deckId=` present when `/irl`, `/offline` or `/table` first has its query (`lib/hooks/useDeckLink.ts`). A deckId `/irl` writes itself after an in-game deck switch is not counted. |
   | `invite_link_copied` | mode `sandbox`\|`sandbox-table`\|`pro` | The clipboard write succeeded: `/connect` "Copy Invite Link" (`InviteLink`), `/table` friend's seat "Copy" (`InviteScreen`), pro lobby "copy link", the in-game room chip (`ProHud`) and mobile menu "Copy join link". The native Share sheet and replay share links are not counted here. |
   | `join_link_opened` | mode `sandbox` | `/join` with `?gid=` once the router is ready (`components/Join`). |
   | `join_link_opened` | mode `pro` | `/pro/game?room=` as the page opened, unless this browser already holds a seat token for the room (refresh, "back to your room") or the URL is a tournament ticket. |
   | `pwa_installed` | – | The browser's `appinstalled` event on `/irl` (the only page linking `public/irl.webmanifest`). |
   | `app_first_open` | display_mode | `/irl` launched outside a browser tab (`display-mode` standalone/fullscreen/minimal-ui, or iOS `navigator.standalone`) with no `unbrewed-irl-first-open` localStorage flag; the flag is set then. |

   Page-load events (`share_link_opened`, `join_link_opened`, `app_first_open`) are sent one frame after mount, after the
   notice has had its chance to start analytics. `/irl`, `/offline`, `/table` and `/pro/game` are game routes: a first-time
   visitor who lands straight on one is not started, so their entry event is **dropped** (and its once-per-load / first-open
   flag is still spent). This is accepted.
2. **Decks** (#1512, helpers in `lib/deckAnalytics.ts`):
   - `deck_added` {source, deck_id, hero_name?, card_count, labs_unsupported_count?, labs_skipped_count?}: a new deck
     landed in the bag (`pushDeck` with a `source`). No `success` prop: the event is the success. Bulk sends one
     `deck_added` {source: `bulk`, deck_count} per import, not one per deck.
   - `deck_add_failed` {source, reason}: `reason` is an HTTP status, a Labs error code (`bad-input`, `not-found`,
     `character-not-found`, `choose-character`, `no-deck`, `no-heroes`, `network`), `parse_error`, `no_cards`,
     `blocked_author`, `device_full` or `storage_refused`. Never message text. Keeping an edited saved copy is not a failure.
   - `deck_replaced` {source}: a re-add of a deck already in the bag (sent instead of `deck_added`).
   - `deck_removed` {source?}: tossed in /bag. `source` is the deck's stored `addSource`.
   - `deck_selected_for_game` {mode, deck_id, source?}: a deck picked on /connect or /join (`sandbox`), /table
     (`sandbox-table`) or the in-game change-deck modal (mode from the route).
   - `hero_picked` {hero_id, tier, mode}: a Pro create/join naming a hero. `mode`: `bot` (any bot seat), `quickmatch`,
     `ranked` (a tournament ticket), else `casual`. Resumes and reconnects send nothing.
   - `hero_preview_opened` {hero_id}: the Pro hero preview modal opened (deck id when there is no server hero id).

   | `source` | Trigger |
   |---|---|
   | `code` | /bag → Import from unmatched.cards (deck code, `CodePanel`) |
   | `unmatched-labs` | /bag → Import from Unmatched Labs (`LabsPanel`), with the unsupported/skipped counts |
   | `tts` | /bag → The Unmatched Club → Tabletop Simulator export (made by the club and unmatched.cards alike) |
   | `image` | /bag → The Unmatched Club → Image URLs |
   | `starter` | /bag → Starter decks |
   | `popular` | /bag → Popular decks |
   | `bulk` | /bag → Backup & Share → Import |
   | `deeplink` | `?deckId=` on /irl, /offline (`useDeckLink`) and /connect (`useLoadRouterDeck`) |
   | `pro-hero` | `deck_selected_for_game` only: a Pro roster deck played without adding it to the bag (#1421) |
   | `unmatched.cards`, `the-unmatched.club` | Reserved: no add path is distinct from `code` / `tts` today |

   `hero_name` is the deck's catalog hero name and is omitted for `image` and `tts`, whose hero name
   is typed by the player. `deck_id` is the source site's id. Never a deck name. Each added deck stores its
   `source` as `addSource` (optional field on the deck) for `deck_removed` and `deck_selected_for_game`; a value that
   isn't in the list above (e.g. from a backup file) is left out. A deep link's automatic re-push (react-query refetch)
   sends nothing.
3. **Games:** engine: `game_created`, `game_started`, `game_finished` {duration_s, end_reason, …}, `game_abandoned`,
   `rematch_offered/accepted`, `reconnect`. Client (no-engine modes): `lobby_created/joined`, `game_started`, `game_ended`,
   `irl_session_started`, `tableplace_handoff`. Tournaments: `tournament_created/joined/match_played`.

   **Client mode triggers (#1511).** The client never sends `game_started` / `game_ended` for `pro` (the engine owns it;
   `lib/gameAnalytics.ts` has no `pro` mode and refuses `/pro/*`). Game names and properties match the engine's where they
   overlap. Count rooms with `is_host = true`; per-player funnels use every event.
   | Event | Properties | Trigger |
   |---|---|---|
   | `lobby_created` | mode `sandbox`, deck_source? | `/connect`: the relay answered "Connect to Game" and the lobby name is still the one we rolled (`components/Connect/index.tsx`). |
   | `lobby_joined` | mode `sandbox` | `/join` (the "Invite a friend" link): the relay answered and the deck is starred, just before the `/game` push (`components/Join/index.tsx`). Also `/connect` when the lobby name was typed rather than rolled; typing a fresh name to start a room counts as a join. |
   | `lobby_created` | mode `sandbox-table`, deck_source? | `/table`: table.place created the lobby (after the dry run), `components/TablePlace/TablePage.tsx`. The friend's seat link goes straight to table.place, so `sandbox-table` has no `lobby_joined`. |
   | `tableplace_handoff` | from_mode `sandbox-table`, deck_source?, deck_count | Each click that leaves for table.place: "Open your seat" (`InviteScreen.tsx`) and the "Your last table" seat links (`TablePage.tsx`). Properties describe the table as it was created. |
   | `game_started` | mode, players, is_host | `sandbox`: the first room state arrives on `/game`; `players` counts the seats in it, and `is_host` is true when nobody else was in the room. `irl`: the deck is on the table on `/irl` or `/offline` (players 1, is_host always true). `sandbox-table` games run on table.place, so none are sent. |
   | `game_ended` | mode, duration_s, players, is_host, end_reason | At most one per `game_started`. `left`: the page unmounts (in-app navigation). `closed`: `pagehide`, sent with `sendBeacon` (`track(…, { beacon: true })`). `players` is the most seats seen. A page restored from the back/forward cache sends a new `game_started`. No client mode has a game over, so `finished` is never sent today. A dropped socket does not end the game. |
   | `irl_session_started` | offline, has_deck | Once per visit to `/irl` (offline false) or `/offline` (offline true), when the deck loads (has_deck true) or the page settles without one (no starred deck / couldn't load). |

   A `/game` reload sends `game_ended` (`closed`), then a new `game_started` with `is_host: false`, because the relay
   replays the other seats' state. Room counts (`is_host = true`) stay right; per-player game counts go up by one per
   refresh.

   `deck_source` uses the decks ticket's (#1512) source names, only when the deck records it: its stored `addSource`
   (section 2), else `unmatched-labs` for a Labs deck id. Otherwise it is left out: a deck's `sourceUrl` is set on the curated popular decks whatever the add path, so it
   says nothing about the source. Budget: 3 events per player per
   sandbox or irl game, plus one `tableplace_handoff` per click on `/table`. All of these routes except `/connect` and `/join` are game
   routes (`GAME_PREFIXES`): a first-time visitor who lands straight on one has not been started yet, so their events are
   dropped until they reach a normal route. This is accepted.
4. **Errors** (named events only: `$exception` autocapture stays off and `posthog.captureException` is never called,
   since it bills the separate Error Tracking product). Client events fire at most once per key per page load
   (`lib/analyticsErrors.ts`), so a crash loop or a redeploy reconnect storm costs one event.
   - `client_error` {boundary: `pro` | `sandbox` | `table` | `irl`, route, error_name, message (first 200 chars),
     room_id?, seat?, state_hash?}: a render error caught by an error boundary; one per boundary per page load.
     `pro` is `ProErrorBoundary` on `/pro/game` (carries room_id/seat/state_hash); `GameErrorBoundary` wraps
     `/game` + `/connect` (`sandbox`), `/table` (`table`), `/irl` + `/offline` (`irl`).
   - `ws_connect_failed` {mode: `pro`}: a `/pro/game` socket closed without ever opening.
   - `ws_closed_unexpected` {mode: `pro`, code}: an open socket closed and the backoff loop is reconnecting.
     Not unexpected: codes 1000 / 1001 / 1012, a deliberate leave / unmount / `closeForGood` (the socket is
     superseded before its close lands), a close inside a `SERVER_RESTARTING` window (the planned redeploy path,
     which also suppresses `ws_connect_failed` while the new instance boots), and a tournament seat taken over by
     another tab (code 4001). `code` is null for the synthetic close of a half-open socket on tab return.
   - Engine: `server_error`, `rate_limited`.
   - Dismissed: `toast_error_shown` (toasts are free text with no key and can carry user text).
5. **Funnels/paths:** built from the above (visitor → first game, deck-add per source, lobby funnel, retention).
6. **Feature usage:** `cosmetics_equipped`, `collection_opened`, `stats_viewed`, `leaderboard_viewed`, `replay_opened`, settings toggles.

Never per-move or per-WebSocket-message.
